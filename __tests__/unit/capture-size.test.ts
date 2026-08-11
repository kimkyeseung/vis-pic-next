import { describe, it, expect } from "vitest";
import { computeCaptureSize } from "@/lib/canvas";

// 촬영 캡처 목표 해상도: 원본보다 확대하지 않고, maxW(예: 1800 — 10×15cm 300DPI)로 상한.
describe("computeCaptureSize", () => {
  const MAX = 1800;

  it("원본이 상한보다 크면 상한(1800)으로 축소하되 비율 유지 (4:3)", () => {
    expect(computeCaptureSize(1920, 1440, MAX)).toEqual({ w: 1800, h: 1350 });
  });

  it("4K(4:3) 원본도 1800으로 축소", () => {
    expect(computeCaptureSize(3840, 2880, MAX)).toEqual({ w: 1800, h: 1350 });
  });

  it("원본이 상한보다 작으면 확대하지 않고 그대로 둔다", () => {
    expect(computeCaptureSize(1280, 960, MAX)).toEqual({ w: 1280, h: 960 });
  });

  it("정확히 상한과 같으면 그대로", () => {
    expect(computeCaptureSize(1800, 1350, MAX)).toEqual({ w: 1800, h: 1350 });
  });

  it("16:9 등 다른 비율도 긴 변(가로) 기준으로 상한 적용", () => {
    // 1920x1080 → scale 0.9375 → 1800 x 1012.5 → 반올림 1013
    expect(computeCaptureSize(1920, 1080, MAX)).toEqual({ w: 1800, h: 1013 });
  });

  it("프리뷰 상한(1440)보다 큰 원본은 캡처에서 더 높은 해상도로 저장된다", () => {
    // 프리뷰는 1440으로 캡되지만 캡처는 1800까지 — 실제로 더 큼을 보장.
    const { w } = computeCaptureSize(1920, 1440, MAX);
    expect(w).toBeGreaterThan(1440);
  });

  it("유효하지 않은 입력(0/음수)은 {0,0}", () => {
    expect(computeCaptureSize(0, 1080, MAX)).toEqual({ w: 0, h: 0 });
    expect(computeCaptureSize(1920, 0, MAX)).toEqual({ w: 0, h: 0 });
    expect(computeCaptureSize(-1, -1, MAX)).toEqual({ w: 0, h: 0 });
    expect(computeCaptureSize(1920, 1080, 0)).toEqual({ w: 0, h: 0 });
  });
});
