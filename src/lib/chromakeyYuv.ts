// YUV(BT.601) 색차평면 거리 기반 크로마키 — OBS류 방송 소프트웨어의 크로마키 필터와 비슷한 조작감
// (유사성/매끄러움/스필 제거 + 투명도/대비/명암/감마)을 제공하는 대안 알고리즘이다. chromakey.ts(채널
// 우세도 방식)와는 완전히 독립된 구현으로, 기존 알고리즘을 선택했을 때의 동작에는 전혀 영향을 주지 않는다.
//
// 밝기(Y)는 키 판정에 쓰지 않고 색차(U,V)만 비교한다 — 그늘지거나 밝게 반사된 같은 키 색도
// 한 감도로 함께 잡힌다(chromakey.ts의 lumaIndependent 옵션이 항상 켜진 것과 비슷한 효과가 기본 내장).
//
//  · similarity(1-100) : 키잉 강도. 클수록 키 색에서 더 먼 색까지 제거한다.
//  · smoothness(0-100) : 경계 페더 폭(색차 거리 단위).
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

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const { u, v } = toYuv(r, g, b);
    const du = u - keyYuv.u, dv = v - keyYuv.v;
    const dist = Math.hypot(du, dv);

    let alpha = data[i + 3];
    if (dist <= threshold) {
      alpha = 0;
    } else if (dist < threshold + band) {
      alpha = Math.round(((dist - threshold) / band) * 255);
    }

    let outR = r, outG = g, outB = b;
    if (spillAmt > 0 && alpha > 0) {
      // 픽셀 색차 벡터를 키 색 방향으로 투영 — 같은 방향(양수)일 때만 그만큼 원점 쪽으로 당긴다.
      const proj = u * keyDirU + v * keyDirV;
      if (proj > 0) {
        const pull = proj * spillAmt;
        const nu = u - pull * keyDirU;
        const nv = v - pull * keyDirV;
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        outR = y + 1.402 * nv;
        outG = y - 0.344136 * nu - 0.714136 * nv;
        outB = y + 1.772 * nu;
      }
    }

    data[i] = applyGrade(outR);
    data[i + 1] = applyGrade(outG);
    data[i + 2] = applyGrade(outB);
    data[i + 3] = Math.round(alpha * opacityAmt);
  }
}
