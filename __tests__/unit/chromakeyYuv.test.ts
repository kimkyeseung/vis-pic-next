import { describe, it, expect } from "vitest";
import { applyChromaKeyYuv } from "@/lib/chromakeyYuv";

// 단일 픽셀 RGBA 배열을 만들어 키잉 결과를 검사하기 위한 헬퍼
function px(r: number, g: number, b: number): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, 255]);
}

const GREEN = { r: 0, g: 255, b: 0 };

describe("applyChromaKeyYuv — 기본 키잉(색차 거리)", () => {
  it("키 색과 일치하는 픽셀은 완전 투명(alpha 0)이 된다", () => {
    const d = px(0, 255, 0);
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0);
    expect(d[3]).toBe(0);
  });

  it("키 색과 색차가 충분히 먼 픽셀은 불투명(alpha 255)으로 유지된다", () => {
    const d = px(220, 60, 60); // 빨강 계열 — 초록과 색차가 크다
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0);
    expect(d[3]).toBe(255);
  });

  it("스필=0이면 색상 채널을 건드리지 않는다", () => {
    const d = px(220, 60, 60);
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0, 0);
    expect([d[0], d[1], d[2]]).toEqual([220, 60, 60]);
  });
});

// 운영 기본값(useDeviceSetup·관리자 폼·CameraStreamer가 공유). 이 조합에서 인물이 반투명해지는
// 회귀를 막기 위한 값 — 바꾸려면 chromakeyYuv.ts 헤더의 `threshold + band < 136` 조건을 먼저 확인할 것.
const DEFAULT_SIMILARITY = 30;
const DEFAULT_SMOOTHNESS = 10;

describe("applyChromaKeyYuv — 운영 기본값(감도 30 / 부드러움 10)", () => {
  // 기본값이 50/50이던 시절엔 페더 구간이 100~200이라 아래 색들이 전부 alpha 90~130으로
  // 반투명하게 찍혔다. 페더 상한(60+20=80)이 무채색 거리(~136)보다 확실히 낮아야 한다.
  it.each([
    ["피부", 230, 180, 150],
    ["어두운 피부", 140, 100, 80],
    ["흰색", 255, 255, 255],
    ["회색", 128, 128, 128],
    ["검정", 0, 0, 0],
    ["갈색 머리", 80, 55, 40],
    ["청바지", 60, 80, 140],
    ["연두색 옷", 150, 200, 90],
  ])("%s 픽셀은 완전 불투명(alpha 255)으로 남는다", (_label, r, g, b) => {
    const d = px(r, g, b);
    applyChromaKeyYuv(d, 1, 1, GREEN, DEFAULT_SIMILARITY, DEFAULT_SMOOTHNESS);
    expect(d[3]).toBe(255);
  });

  it("스포이드로 찍은 그린스크린 색과 그 그늘진 부분은 제거된다", () => {
    const key = { r: 40, g: 200, b: 60 }; // 실제 스크린에서 샘플한 키 색
    for (const [r, g, b] of [[40, 200, 60], [90, 255, 110], [20, 110, 35], [80, 180, 90]]) {
      const d = px(r, g, b);
      applyChromaKeyYuv(d, 1, 1, key, DEFAULT_SIMILARITY, DEFAULT_SMOOTHNESS);
      expect(d[3]).toBe(0);
    }
  });
});

describe("applyChromaKeyYuv — 스필 제거", () => {
  it("남은 픽셀의 키 색 방향 색차 성분을 줄여 초록 기운을 눌러낸다(강도 100)", () => {
    // 초록이 섞인 살구색 픽셀(테두리 초록 번짐 상황을 흉내).
    const d = px(200, 220, 150);
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0, 100);
    expect(d[3]).toBe(255); // 키잉으로 지워지진 않음
    expect(d[1]).toBeLessThan(220); // 초록 성분이 줄어든다
    expect(d[0]).toBeGreaterThan(200); // 다른 채널은 반대로 올라간다(무채색 쪽으로 당겨짐)
  });

  it("spill=0이면 같은 픽셀이 변하지 않는다", () => {
    const withSpill = px(200, 220, 150);
    applyChromaKeyYuv(withSpill, 1, 1, GREEN, 50, 0, 0);
    expect([withSpill[0], withSpill[1], withSpill[2]]).toEqual([200, 220, 150]);
  });
});

describe("applyChromaKeyYuv — 투명도", () => {
  it("opacity가 최종 alpha에 곱해진다", () => {
    const d = px(220, 60, 60); // 키잉으로 지워지지 않는 픽셀
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0, 0, 50);
    expect(d[3]).toBe(128); // round(255 * 0.5)
  });

  it("opacity=100(기본)이면 alpha가 그대로 유지된다", () => {
    const d = px(220, 60, 60);
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0, 0, 100);
    expect(d[3]).toBe(255);
  });
});

describe("applyChromaKeyYuv — 색보정(대비/명암/감마)", () => {
  it("brightness가 결과 RGB를 가산 보정한다", () => {
    const d = px(50, 50, 50); // 키 색과 색차가 멀어 alpha에는 영향 없음
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0, 0, 100, 0, 100, 0);
    expect(d[0]).toBe(177); // 50 + 127
    expect(d[1]).toBe(177);
    expect(d[2]).toBe(177);
    expect(d[3]).toBe(255);
  });

  it("contrast가 128에서 먼 값을 더 멀어지게 만든다", () => {
    const d = px(100, 100, 100);
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0, 0, 100, 50, 0, 0);
    expect(d[0]).toBeLessThan(100); // 128보다 작은 값은 대비를 주면 더 작아진다
  });

  it("gamma가 중간톤을 밝게(+) 또는 어둡게(-) 만든다", () => {
    const bright = px(100, 100, 100);
    applyChromaKeyYuv(bright, 1, 1, GREEN, 50, 0, 0, 100, 0, 0, 100);
    expect(bright[0]).toBeGreaterThan(100);

    const dark = px(100, 100, 100);
    applyChromaKeyYuv(dark, 1, 1, GREEN, 50, 0, 0, 100, 0, 0, -100);
    expect(dark[0]).toBeLessThan(100);
  });

  it("contrast/brightness/gamma가 모두 0이면 색을 바꾸지 않는다", () => {
    const d = px(123, 45, 67);
    applyChromaKeyYuv(d, 1, 1, GREEN, 50, 0, 0, 100, 0, 0, 0);
    expect([d[0], d[1], d[2]]).toEqual([123, 45, 67]);
  });
});
