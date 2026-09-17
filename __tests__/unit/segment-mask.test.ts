import { describe, it, expect } from "vitest";
import {
  DEFAULT_MASK_TUNING,
  MODEL_GRID,
  bakeAlphaMask,
  bboxToFrame,
  maskBlurPx,
  nextRoi,
  type MaskTuning,
} from "@/lib/segmentMask";

const tuning = (over: Partial<MaskTuning> = {}): MaskTuning => ({ ...DEFAULT_MASK_TUNING, ...over });

/** w×h confidence 배열을 만든다. `fg(x,y)`가 true인 칸만 전경 확신도 1. */
function conf(w: number, h: number, fg: (x: number, y: number) => boolean): Float32Array {
  const arr = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) arr[y * w + x] = fg(x, y) ? 1 : 0;
  return arr;
}

describe("maskBlurPx", () => {
  it("256 격자 텍셀 크기에 비례한다 — ROI로 좁게 볼수록 블러가 약해진다", () => {
    const wide = maskBlurPx(MODEL_GRID * 4); // 텍셀 4px
    const tight = maskBlurPx(MODEL_GRID); // 텍셀 1px
    expect(wide).toBeGreaterThan(tight);
    expect(tight).toBeCloseTo(0.6, 5);
  });

  it("상한이 있어 전체 프레임을 볼 때도 과하게 번지지 않는다", () => {
    expect(maskBlurPx(100_000)).toBeLessThanOrEqual(6);
  });

  it("설정 세기에 비례하고, 0이면 블러가 꺼진다", () => {
    const base = maskBlurPx(MODEL_GRID * 4, tuning({ blur: 100 }));
    expect(maskBlurPx(MODEL_GRID * 4, tuning({ blur: 200 }))).toBeCloseTo(base * 2, 5);
    expect(maskBlurPx(MODEL_GRID * 4, tuning({ blur: 0 }))).toBe(0);
  });

  it("블러를 껐어도 경계 두께를 쓰면 최소 전환대를 만들어 준다", () => {
    // 두께 보정은 블러가 만든 전환대 안에서 알파를 미는 방식이라, 전환대가 없으면 아무 일도 안 난다.
    expect(maskBlurPx(MODEL_GRID * 4, tuning({ blur: 0, edgeShift: -40 }))).toBeGreaterThan(0);
  });
});

describe("bakeAlphaMask", () => {
  const opts = { fgIsMask0: true, thresh: 0.15, feather: 0.35 };

  it("전경은 불투명, 배경은 투명으로 굽는다", () => {
    const w = 4;
    const h = 4;
    const out = new Uint8ClampedArray(w * h * 4);
    bakeAlphaMask(conf(w, h, (x, y) => x === 1 && y === 1), out, w, h, opts);
    const alphaAt = (x: number, y: number) => out[(y * w + x) * 4 + 3];
    expect(alphaAt(1, 1)).toBe(255);
    expect(alphaAt(0, 0)).toBe(0);
    // RGB는 항상 흰색 — destination-in 합성에서 알파만 쓰인다.
    expect(out[(1 * w + 1) * 4]).toBe(255);
  });

  it("멀티클래스 극성(masks[0]=배경)을 뒤집어 읽는다", () => {
    const w = 2;
    const h = 1;
    const out = new Uint8ClampedArray(w * h * 4);
    // arr=1 → 배경 확신도 1 → 전경 0
    bakeAlphaMask(conf(w, h, (x) => x === 0), out, w, h, { ...opts, fgIsMask0: false });
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(255);
  });

  it("전경 bbox를 함께 돌려준다", () => {
    const w = 8;
    const h = 8;
    const out = new Uint8ClampedArray(w * h * 4);
    const inner = bakeAlphaMask(conf(w, h, (x, y) => x >= 2 && x <= 4 && y === 3), out, w, h, opts);
    expect(inner).toEqual({ x: 2, y: 3, w: 3, h: 1 });
  });

  it("전경이 하나도 없으면 bbox가 null", () => {
    const out = new Uint8ClampedArray(4 * 4 * 4);
    expect(bakeAlphaMask(conf(4, 4, () => false), out, 4, 4, opts)).toBeNull();
  });

  it("thresh 아래는 0, thresh+feather 위는 1로 클램프된다", () => {
    const arr = new Float32Array([0.1, 0.15 + 0.35 / 2, 0.9]);
    const out = new Uint8ClampedArray(3 * 4);
    bakeAlphaMask(arr, out, 3, 1, opts);
    expect(out[3]).toBe(0);
    expect(out[7]).toBeGreaterThan(100);
    expect(out[7]).toBeLessThan(155);
    expect(out[11]).toBe(255);
  });
});

describe("bboxToFrame", () => {
  it("크롭 없이 추론했으면 프레임 전체 기준으로 확대한다", () => {
    const r = bboxToFrame({ x: 10, y: 5, w: 20, h: 10 }, 100, 50, null, 1000, 500);
    expect(r).toEqual({ x: 100, y: 50, w: 200, h: 100 });
  });

  it("크롭으로 추론했으면 그 크롭 안의 좌표로 되돌린다", () => {
    const roi = { x: 400, y: 200, w: 320, h: 320 };
    const r = bboxToFrame({ x: 0, y: 0, w: 160, h: 320 }, 320, 320, roi, 1920, 1080);
    expect(r).toEqual({ x: 400, y: 200, w: 160, h: 320 });
  });
});

describe("nextRoi", () => {
  const W = 1920;
  const H = 1080;

  it("인물 주변에 여유를 붙이고 프레임 안으로 클램프한다", () => {
    const roi = nextRoi({ x: 800, y: 300, w: 300, h: 500 }, W, H, null)!;
    expect(roi.w).toBeGreaterThan(300); // 여유(margin)만큼 더 넓게
    expect(roi.x).toBeGreaterThanOrEqual(0);
    expect(roi.y).toBeGreaterThanOrEqual(0);
    expect(roi.x + roi.w).toBeLessThanOrEqual(W);
    expect(roi.y + roi.h).toBeLessThanOrEqual(H);
  });

  it("세로를 꽉 채운 인물도 가로는 좁혀 준다 — 부스의 전형적인 구도", () => {
    // 상반신이 화면 세로를 다 쓰는 경우. 정사각/프레임비율 크롭이면 이득이 0이 되는 구도다.
    const roi = nextRoi({ x: 620, y: 20, w: 670, h: 1060 }, W, H, null)!;
    expect(roi.h).toBe(H); // 위아래는 이미 화면이 자르고 있으니 끝까지
    expect(roi.w).toBeLessThan(W * 0.75); // 가로는 실질적으로 좁아진다
  });

  it("정수로 확정된다 — 보내는 쪽(createImageBitmap 크롭)과 되붙이는 쪽이 같은 값을 봐야 한다", () => {
    const roi = nextRoi({ x: 801.3, y: 299.7, w: 301.1, h: 499.9 }, W, H, null)!;
    for (const v of [roi.x, roi.y, roi.w, roi.h]) expect(Number.isInteger(v)).toBe(true);
  });

  it("인물이 프레임을 가득 채우면 null — 잘라도 얻을 해상도가 없다", () => {
    expect(nextRoi({ x: 20, y: 10, w: 1880, h: 1060 }, W, H, null)).toBeNull();
  });

  it("설정에서 끄면 항상 null — 프레임 전체로 추론한다", () => {
    expect(nextRoi({ x: 800, y: 300, w: 300, h: 500 }, W, H, null, tuning({ roi: false }))).toBeNull();
  });

  it("추적 여유를 좁히면 크롭도 좁아진다", () => {
    const wide = nextRoi({ x: 800, y: 300, w: 300, h: 500 }, W, H, null, tuning({ roiMargin: 50 }))!;
    const tight = nextRoi({ x: 800, y: 300, w: 300, h: 500 }, W, H, null, tuning({ roiMargin: 5 }))!;
    expect(tight.w).toBeLessThan(wide.w);
    expect(tight.w).toBeGreaterThanOrEqual(300); // bbox는 항상 들어가야 한다
  });

  it("이전 ROI가 있으면 EMA로 따라가 프레임마다 들썩이지 않는다", () => {
    const prev = { x: 300, y: 0, w: 900, h: 1080 };
    const bbox = { x: 800, y: 100, w: 400, h: 900 };
    const roi = nextRoi(bbox, W, H, prev)!;
    const direct = nextRoi(bbox, W, H, null)!;
    expect(Math.abs(roi.x - prev.x)).toBeLessThan(Math.abs(direct.x - prev.x));
  });

  it("인물이 크롭의 안쪽 경계에 닿으면 EMA를 건너뛰고 여유를 두 배로 잡는다", () => {
    const prev = { x: 600, y: 0, w: 700, h: 1080 };
    // bbox 왼쪽이 prev의 안쪽 왼쪽 경계(600)에 딱 붙은 상황 = 크롭 밖으로 나가는 중
    const bbox = { x: 600, y: 100, w: 300, h: 900 };
    const escaping = nextRoi(bbox, W, H, prev)!;
    const normal = nextRoi(bbox, W, H, null)!; // 같은 bbox, 평상시 여유
    expect(escaping.w).toBeGreaterThan(normal.w);
    // EMA를 탔다면 prev(x=600)에 끌려갔을 텐데, 즉시 반영이라 bbox 기준 그대로 나온다.
    expect(escaping.x).toBe(Math.round(600 - 300 * 0.44));
  });

  it("프레임 끝에 맞닿은 변은 '탈출'로 치지 않는다 — 원래 화면이 인물을 자르는 자리다", () => {
    // prev가 위아래로 프레임 끝까지 차 있고 인물도 끝에 닿아 있지만, 이건 정상 상태다.
    const prev = { x: 600, y: 0, w: 700, h: 1080 };
    const steady = { x: 800, y: 0, w: 300, h: 1080 };
    const roi = nextRoi(steady, W, H, prev)!;
    // 탈출로 오인했다면 여유가 두 배가 되어 prev보다 훨씬 넓어졌을 것이다.
    expect(roi.w).toBeLessThanOrEqual(prev.w);
  });
});
