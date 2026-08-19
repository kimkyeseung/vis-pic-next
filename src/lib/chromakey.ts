// 크로마키 키잉 공용 로직 — 촬영 프리뷰(CameraSection)·고해상도 캡처·관리자 미리보기
// 다이얼로그가 동일한 픽셀 처리를 공유하도록 한 곳에 모은다.
//
//  · similarity(1-100) : 키 색 허용 거리. 이 거리(제곱) 안이면 완전 투명(HARD).
//  · smoothness(0-100) : 경계 페더 폭. softDist = simDist×(1+smoothness/50), 그 사이는 부드럽게.
//  · spill(0-100)      : 스필 제거 강도. 남은 인물 픽셀에서 키 색이 우세한 채널(그린스크린=G,
//                        블루스크린=B)을 나머지 두 채널 수준으로 눌러 초록/파랑 번짐(테두리)을 없앤다.
//  · choke(0-100)      : 경계 침식. 알파 마스크를 안쪽으로 깎아 가장자리 프린지를 제거(분리형 min 필터).
//  · lumaIndependent   : 밝기 무시 키잉. 픽셀 밝기를 키 색 밝기에 맞춰 정규화한 뒤 거리를 재서,
//                        그늘지거나 밝게 반사된 같은 색(불균일 조명 그린스크린)도 한 감도로 함께 빠지게 한다.
//
// spill=0·choke=0·lumaIndependent=false면 기존(감도/부드러움만) 동작과 픽셀 단위로 동일하다.

// BT.601 휘도(밝기) 가중치 — 밝기 무시 키잉에서 픽셀/키 색의 밝기를 계산할 때 쓴다.
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 알파 채널을 반경 r만큼 안쪽으로 침식(분리형 최소값 필터). 인물 경계를 깎아 프린지를 제거한다. */
function erodeAlpha(data: Uint8ClampedArray, w: number, h: number, r: number): void {
  const n = w * h;
  const src = new Uint8Array(n);
  for (let i = 0; i < n; i++) src[i] = data[i * 4 + 3];

  // 가로 방향 최소값
  const tmp = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 255;
      const x0 = x - r < 0 ? 0 : x - r;
      const x1 = x + r >= w ? w - 1 : x + r;
      for (let xx = x0; xx <= x1; xx++) { const v = src[row + xx]; if (v < m) m = v; }
      tmp[row + x] = m;
    }
  }
  // 세로 방향 최소값 → 알파에 기록
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 255;
      const y0 = y - r < 0 ? 0 : y - r;
      const y1 = y + r >= h ? h - 1 : y + r;
      for (let yy = y0; yy <= y1; yy++) { const v = tmp[yy * w + x]; if (v < m) m = v; }
      data[(y * w + x) * 4 + 3] = m;
    }
  }
}

export function applyChromaKey(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  key: { r: number; g: number; b: number },
  similarity: number,
  smoothness: number,
  spill = 0,
  choke = 0,
  lumaIndependent = false,
): void {
  const kr = key.r, kg = key.g, kb = key.b;
  const keyLuma = luma(kr, kg, kb);
  const simDist = Math.max(1, similarity);
  const softDist = simDist * (1 + Math.max(0, smoothness) / 50);
  const softBand = Math.max(1e-6, softDist - simDist);
  const HARD = simDist * simDist;
  const SOFT = softDist * softDist;

  // 스필 제거용: 키 색에서 가장 큰(우세) 채널 오프셋과 나머지 두 채널 오프셋을 미리 정한다.
  const spillAmt = Math.max(0, Math.min(100, spill)) / 100;
  let domOff = 1, o1 = 0, o2 = 2; // 기본 그린(1) 우세
  if (kr >= kg && kr >= kb) { domOff = 0; o1 = 1; o2 = 2; }
  else if (kb >= kg && kb >= kr) { domOff = 2; o1 = 0; o2 = 1; }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let dr: number, dg: number, db: number;
    if (lumaIndependent) {
      // 픽셀을 키 색과 같은 밝기로 스케일한 뒤 거리를 잰다 → 밝기 차이는 무시되고 색(방향)만 비교.
      const f = keyLuma / Math.max(1, luma(r, g, b));
      dr = r * f - kr;
      dg = g * f - kg;
      db = b * f - kb;
    } else {
      dr = r - kr;
      dg = g - kg;
      db = b - kb;
    }
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq < HARD) {
      data[i + 3] = 0;
      continue;
    }
    if (distSq < SOFT) {
      data[i + 3] = Math.round(((Math.sqrt(distSq) - simDist) / softBand) * 255);
    }
    // 남아 보이는 픽셀에만 스필 제거 적용.
    if (spillAmt > 0 && data[i + 3] > 0) {
      const a = data[i + o1];
      const b = data[i + o2];
      const otherMax = a > b ? a : b;
      const dv = data[i + domOff];
      if (dv > otherMax) data[i + domOff] = otherMax + (dv - otherMax) * (1 - spillAmt);
    }
  }

  // 경계 침식은 알파를 다 계산한 뒤 한 번에. 반경은 이미지 폭에 비례해(프리뷰·고해상도 일관)
  // 표시 배율이 달라도 결과 두께가 비슷하게 보이도록 한다.
  const chokeAmt = Math.max(0, Math.min(100, choke)) / 100;
  const radius = Math.min(16, Math.round(chokeAmt * w * 0.006));
  if (radius > 0) erodeAlpha(data, w, h, radius);
}
