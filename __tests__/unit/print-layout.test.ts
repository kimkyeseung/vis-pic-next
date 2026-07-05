import { describe, it, expect } from "vitest";
import { computePrintLayout, parseCm, modeSettingPrefix } from "@/lib/printLayout";
import { FRAME_INFO } from "@/constants/frames";

// 15x10cm 가로 인화지에 2x2 (6.5x4.7cm, 간격 0.2cm) — 레퍼런스 시나리오
const PAPER = { paperW: 15, paperH: 10 };
const BASE_2X2 = {
  MODE_2_2_WIDTH: "6.5",
  MODE_2_2_HEIGHT: "4.7",
  MODE_2_2_HGAP: "0.2",
  MODE_2_2_VGAP: "0.2",
};

const layout2x2 = (settings: Record<string, string>) =>
  computePrintLayout({ frame: FRAME_INFO["2x2"], mode: "2x2", ...PAPER, settings });

describe("parseCm", () => {
  it("빈 문자열·공백은 미설정(null)", () => {
    expect(parseCm("")).toBeNull();
    expect(parseCm("  ")).toBeNull();
    expect(parseCm(undefined)).toBeNull();
  });

  it("숫자가 아니거나 음수면 미설정(null)", () => {
    expect(parseCm("abc")).toBeNull();
    expect(parseCm("-1")).toBeNull();
  });

  it("0과 소수는 유효", () => {
    expect(parseCm("0")).toBe(0);
    expect(parseCm("0.2")).toBeCloseTo(0.2);
  });
});

describe("modeSettingPrefix", () => {
  it("2x2 → MODE_2_2_", () => {
    expect(modeSettingPrefix("2x2")).toBe("MODE_2_2_");
  });
});

describe("computePrintLayout — 여백 미지정 시 중앙 정렬", () => {
  it("슬롯 전체 영역이 인화지 중앙에 온다", () => {
    const { slots, fromSettings, overflow } = layout2x2(BASE_2X2);
    expect(fromSettings).toBe(true);
    expect(overflow).toBe(false);
    // totalW = 6.5*2 + 0.2 = 13.2 → startX = (15-13.2)/2 = 0.9
    // totalH = 4.7*2 + 0.2 = 9.6 → startY = (10-9.6)/2 = 0.2
    expect(slots[0].x).toBeCloseTo(0.9);
    expect(slots[0].y).toBeCloseTo(0.2);
    expect(slots).toHaveLength(4);
    // 슬롯 2는 오른쪽 열
    expect(slots[1].x).toBeCloseTo(0.9 + 6.5 + 0.2);
    // 슬롯 3은 아래 행
    expect(slots[2].y).toBeCloseTo(0.2 + 4.7 + 0.2);
  });
});

describe("computePrintLayout — 4방향 여백 기준", () => {
  it("상단 여백 지정 시 위 기준", () => {
    const { slots } = layout2x2({ ...BASE_2X2, MODE_2_2_MARGIN_TOP: "1" });
    expect(slots[0].y).toBeCloseTo(1);
  });

  it("하단 여백만 지정 시 아래 기준", () => {
    const { slots } = layout2x2({ ...BASE_2X2, MODE_2_2_MARGIN_BOTTOM: "0.1" });
    // startY = 10 - 9.6 - 0.1 = 0.3
    expect(slots[0].y).toBeCloseTo(0.3);
  });

  it("좌측 여백 지정 시 왼쪽 기준", () => {
    const { slots } = layout2x2({ ...BASE_2X2, MODE_2_2_MARGIN_LEFT: "0.2" });
    expect(slots[0].x).toBeCloseTo(0.2);
  });

  it("우측 여백만 지정 시 오른쪽 기준", () => {
    const { slots } = layout2x2({ ...BASE_2X2, MODE_2_2_MARGIN_RIGHT: "0.5" });
    // startX = 15 - 13.2 - 0.5 = 1.3
    expect(slots[0].x).toBeCloseTo(1.3);
  });

  it("상단·하단 동시 지정 시 상단 우선", () => {
    const { slots } = layout2x2({
      ...BASE_2X2,
      MODE_2_2_MARGIN_TOP: "1",
      MODE_2_2_MARGIN_BOTTOM: "3",
    });
    expect(slots[0].y).toBeCloseTo(1);
  });

  it("빈 문자열 여백은 미지정과 동일 (NaN 좌표 회귀 방지)", () => {
    const { slots } = layout2x2({ ...BASE_2X2, MODE_2_2_MARGIN_LEFT: "" });
    expect(slots[0].x).toBeCloseTo(0.9);
    expect(Number.isFinite(slots[0].x)).toBe(true);
  });
});

describe("computePrintLayout — 용지 초과 감지", () => {
  it("사진이 인화지보다 크면 overflow", () => {
    const { overflow } = layout2x2({
      ...BASE_2X2,
      MODE_2_2_WIDTH: "8", // 8*2 + 0.2 = 16.2 > 15
    });
    expect(overflow).toBe(true);
  });

  it("여백 때문에 밀려나도 overflow", () => {
    const { overflow } = layout2x2({ ...BASE_2X2, MODE_2_2_MARGIN_LEFT: "5" });
    expect(overflow).toBe(true);
  });

  it("딱 맞는 크기는 overflow 아님", () => {
    const { overflow } = layout2x2({
      MODE_2_2_WIDTH: "7.5",
      MODE_2_2_HEIGHT: "5",
      MODE_2_2_HGAP: "0",
      MODE_2_2_VGAP: "0",
    });
    expect(overflow).toBe(false);
  });
});

describe("computePrintLayout — 설정 없음 폴백", () => {
  it("크기 미설정이면 fromSettings=false, 4:3 슬롯 자동 배치", () => {
    const { slots, fromSettings, overflow } = layout2x2({});
    expect(fromSettings).toBe(false);
    expect(overflow).toBe(false);
    expect(slots).toHaveLength(4);
    // 모든 슬롯이 용지 안
    for (const s of slots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(15);
      expect(s.y + s.h).toBeLessThanOrEqual(10);
      expect(s.w / s.h).toBeCloseTo(4 / 3);
    }
  });

  it("1x1 모드도 폴백 배치 가능", () => {
    const { slots, fromSettings } = computePrintLayout({
      frame: FRAME_INFO["1x1"],
      mode: "1x1",
      paperW: 15,
      paperH: 10,
      settings: {},
    });
    expect(fromSettings).toBe(false);
    expect(slots).toHaveLength(1);
  });
});
