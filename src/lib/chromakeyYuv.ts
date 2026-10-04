// YUV(BT.601) 색차평면 거리 기반 크로마키 — OBS류 방송 소프트웨어의 크로마키 필터와 비슷한 조작감
// (유사성/매끄러움/스필 제거 + 투명도/대비/명암/감마)을 제공하는 대안 알고리즘이다. chromakey.ts(채널
// 우세도 방식)와는 완전히 독립된 구현으로, 기존 알고리즘을 선택했을 때의 동작에는 전혀 영향을 주지 않는다.
//
// 밝기(Y)는 키 판정에 쓰지 않고 색차(U,V)만 비교한다 — 그늘지거나 밝게 반사된 같은 키 색도
// 한 감도로 함께 잡힌다(chromakey.ts의 lumaIndependent 옵션이 항상 켜진 것과 비슷한 효과가 기본 내장).
//
//  · similarity(1-100) : 키잉 강도. 클수록 키 색에서 더 먼 색까지 제거한다.
//  · smoothness(0-100) : 경계 페더 폭(색차 거리 단위).
//
// ※ 두 값의 기본치는 30/10으로, chromakey.ts(50/50)보다 훨씬 낮다 — 판정 단위가 다르기 때문이다.
//   UV 평면에서 초록 키(0,255,0)부터 무채색까지의 거리가 약 136, 피부는 약 147밖에 안 된다.
//   따라서 threshold(=감도/100×200)와 band(=부드러움/100×200)의 합이 136을 넘으면 인물 색이
//   통째로 페더 구간에 들어가 피사체가 반투명하게 찍힌다(감도 50/부드러움 50 → 페더 100~200:
//   피부 alpha 121, 무채색 92). 감도 단독으로도 68을 넘으면 무채색이 threshold 안에 들어와 화면
//   전체가 지워진다. 기본값을 바꿀 때는 `threshold + band < 136`을 반드시 지킬 것.
//  · spill(0-100)      : 남은 픽셀의 색차 벡터에서 키 색 방향 성분을 눌러 초록/파랑 번짐(테두리)을 없앤다.
//  · opacity(0-100)    : 최종 결과의 전체 투명도 배율. 100 = 원본 그대로.
//  · contrast/brightness/gamma(-100~100) : 결과 프레임 전체에 적용하는 표준 색보정. 0 = 변화 없음.

function toYuv(r: number, g: number, b: number): { y: number; u: number; v: number } {
  return {
    y: 0.299 * r + 0.587 * g + 0.114 * b,
    u: -0.168736 * r - 0.331264 * g + 0.5 * b,
    v: 0.5 * r - 0.418688 * g - 0.081312 * b,
  };
}

// U,V 평면에서 관찰되는 실질적 최대 색차 거리(경험적 정규화 상수) — chromakey.ts의 band 계산(* 150)과 같은 성격.
const MAX_UV_DIST = 200;

export function applyChromaKeyYuv(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  key: { r: number; g: number; b: number },
  similarity: number,
  smoothness: number,
  spill = 0,
  opacity = 100,
  contrast = 0,
  brightness = 0,
  gamma = 0,
): void {
  void w;
  void h;

  const keyYuv = toYuv(key.r, key.g, key.b);
  const keyUvLen = Math.max(1e-6, Math.hypot(keyYuv.u, keyYuv.v));
  const keyDirU = keyYuv.u / keyUvLen;
  const keyDirV = keyYuv.v / keyUvLen;

  const sim = Math.max(1, Math.min(100, similarity));
  const threshold = (sim / 100) * MAX_UV_DIST;
  const band = Math.max(1e-6, (Math.max(0, smoothness) / 100) * MAX_UV_DIST);

  const spillAmt = Math.max(0, Math.min(100, spill)) / 100;
  const opacityAmt = Math.max(0, Math.min(100, opacity)) / 100;

  // 대비: 표준 "259/259" 보정 계수(contrast를 -255..255로 사상).
  const c255 = (Math.max(-100, Math.min(100, contrast)) / 100) * 255;
  const contrastFactor = (259 * (c255 + 255)) / (255 * (259 - c255));
  const brightnessAdd = (Math.max(-100, Math.min(100, brightness)) / 100) * 127;
  // 감마: 0=변화 없음, +100=밝게(지수 0.5), -100=어둡게(지수 2).
  const gammaExp = Math.pow(2, -Math.max(-100, Math.min(100, gamma)) / 100);

  const applyGrade = (c: number): number => {
    const graded = contrastFactor * (c - 128) + 128 + brightnessAdd;
    const clamped = Math.max(0, Math.min(255, graded));
    return Math.max(0, Math.min(255, 255 * Math.pow(clamped / 255, gammaExp)));
  };
  // 색보정은 채널값만의 함수라 정수 입력(0-255)은 256칸 표로 미리 계산해 픽셀 루프의 Math.pow(픽셀당 3회)를
  // 없앤다. 스필 제거를 거친 픽셀은 채널값이 소수이거나 0-255 밖일 수 있어(보정 전에 자르면 결과가 달라진다)
  // 그때만 applyGrade로 정확히 계산한다. 보정값이 모두 0이면 applyGrade는 클램프뿐이라 그것도 생략한다.
  const gradeLut = new Uint8ClampedArray(256);
  for (let c = 0; c < 256; c++) gradeLut[c] = applyGrade(c);
  const gradeIsIdentity = contrast === 0 && brightness === 0 && gamma === 0;

  // 거리 비교는 제곱으로 한다 — 제곱근은 페더 구간에 든 픽셀에서만 계산한다.
  const keyU = keyYuv.u, keyV = keyYuv.v;
  const thresholdSq = threshold * threshold;
  const outerSq = (threshold + band) * (threshold + band);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const u = -0.168736 * r - 0.331264 * g + 0.5 * b;
    const v = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const du = u - keyU, dv = v - keyV;
    const distSq = du * du + dv * dv;

    let alpha = data[i + 3];
    if (distSq <= thresholdSq) {
      alpha = 0;
    } else if (distSq < outerSq) {
      alpha = Math.round(((Math.sqrt(distSq) - threshold) / band) * 255);
    }

    data[i + 3] = Math.round(alpha * opacityAmt);
    if (spillAmt > 0 && alpha > 0) {
      // 픽셀 색차 벡터를 키 색 방향으로 투영 — 같은 방향(양수)일 때만 그만큼 원점 쪽으로 당긴다.
      const proj = u * keyDirU + v * keyDirV;
      if (proj > 0) {
        const pull = proj * spillAmt;
        const nu = u - pull * keyDirU;
        const nv = v - pull * keyDirV;
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const outR = y + 1.402 * nv;
        const outG = y - 0.344136 * nu - 0.714136 * nv;
        const outB = y + 1.772 * nu;
        // Uint8ClampedArray 대입이 클램프·반올림을 해 주므로 보정이 없으면 그대로 넣는다.
        data[i] = gradeIsIdentity ? outR : applyGrade(outR);
        data[i + 1] = gradeIsIdentity ? outG : applyGrade(outG);
        data[i + 2] = gradeIsIdentity ? outB : applyGrade(outB);
        continue;
      }
    }

    data[i] = gradeLut[r];
    data[i + 1] = gradeLut[g];
    data[i + 2] = gradeLut[b];
  }
}
