// 크로마키 키잉 공용 로직 — 촬영 프리뷰(CameraSection)·고해상도 캡처·관리자 미리보기
// 다이얼로그가 동일한 픽셀 처리를 공유하도록 한 곳에 모은다.
//
// 판정 기준은 키 색 방향으로의 "채널 우세도"(chroma difference)다 — 키 색의 우세 채널(그린스크린=G,
// 블루스크린=B)이 나머지 두 채널의 최댓값보다 얼마나 큰지(diff = dom - max(other1, other2))만 본다.
// 키 색까지의 RGB 유클리드 거리로 판정하면, 카키색 옷이나 그늘진 피부·초록 스필을 받은 살구색처럼
// "우연히 키 색과 가까운" 색까지 같은 반경 안에 들어와 인물과 함께 지워진다 — 거리는 방향을 구분하지
// 못하기 때문이다. 채널 우세도는 방향성이 있어서, 피부(대개 R이 G보다 큼)나 대부분의 의상은 diff가
// 낮게(음수로) 나와 그대로 남고, 실제 그린/블루스크린만 강하게 반응한다.
//
//  · similarity(1-100) : 키잉 강도. 클수록 더 약한 채널 우세만으로도 완전 투명(HARD) 처리한다.
//                        HARD = 255×(1 - similarity/100).
//  · smoothness(0-100) : 경계 페더 폭(diff 단위). 0이면 HARD에서 딱 잘리고, 클수록 그 아래로
//                        넓은 구간에 걸쳐 부드럽게 불투명해진다.
//  · spill(0-100)      : 스필 제거 강도. 남은 인물 픽셀에서 키 색이 우세한 채널을
//                        나머지 두 채널 수준으로 눌러 초록/파랑 번짐(테두리)을 없앤다.
//  · choke(0-100)      : 경계 침식. 알파 마스크를 안쪽으로 깎아 가장자리 프린지를 제거(분리형 min 필터).
//  · lumaIndependent   : 밝기 무시 키잉. 픽셀 밝기를 키 색 밝기에 맞춰 정규화한 뒤 diff를 재서,
//                        그늘지거나 밝게 반사된 같은 색(불균일 조명 그린스크린)도 한 감도로 함께 빠지게 한다.

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

  // 키 색에서 가장 큰(우세) 채널 오프셋과 나머지 두 채널 오프셋 — 판정과 스필 제거가 함께 쓴다.
  let domOff = 1, o1 = 0, o2 = 2; // 기본 그린(1) 우세
  if (kr >= kg && kr >= kb) { domOff = 0; o1 = 1; o2 = 2; }
  else if (kb >= kg && kb >= kr) { domOff = 2; o1 = 0; o2 = 1; }

  const sim = Math.max(1, Math.min(100, similarity));
  const HARD = 255 * (1 - sim / 100);
  // smoothness(0-100): HARD 아래로 이 폭(diff 단위)만큼 페더 구간을 둔다. 0이면 경계 없이 딱 잘림.
  const band = Math.max(1e-6, (Math.max(0, smoothness) / 100) * 150);
  const SOFT = HARD - band;

  const spillAmt = Math.max(0, Math.min(100, spill)) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (lumaIndependent) {
      // 픽셀을 키 색과 같은 밝기로 스케일한 뒤 채널 우세도를 잰다 → 밝기 차이는 무시되고 색(방향)만 비교.
      const f = keyLuma / Math.max(1, luma(r, g, b));
      r *= f; g *= f; b *= f;
    }
    const dom = domOff === 0 ? r : domOff === 1 ? g : b;
    const other1 = o1 === 0 ? r : o1 === 1 ? g : b;
    const other2 = o2 === 0 ? r : o2 === 1 ? g : b;
    const diff = dom - (other1 > other2 ? other1 : other2);

    if (diff >= HARD) {
      data[i + 3] = 0;
      continue;
    }
    if (diff > SOFT) {
      data[i + 3] = Math.round(((HARD - diff) / band) * 255);
    }
    // 남아 보이는 픽셀에만 스필 제거 적용.
    if (spillAmt > 0 && data[i + 3] > 0) {
      const a = data[i + o1];
      const b2 = data[i + o2];
      const otherMax = a > b2 ? a : b2;
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
