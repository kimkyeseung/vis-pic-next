import { describe, it, expect } from "vitest";
import { parseBgRemovalMode, parsePaymentTerminalMode, parseCaptureModes } from "@/lib/deviceConfig";

// ─── useDeviceSetup: config 파싱 로직 ────────────────────────────────────────

describe("parseBgRemovalMode", () => {
  it("'off', '0' → off", () => {
    expect(parseBgRemovalMode("off")).toBe("off");
    expect(parseBgRemovalMode("0")).toBe("off");
  });

  it("'chromakey', '1' → chromakey", () => {
    expect(parseBgRemovalMode("chromakey")).toBe("chromakey");
    expect(parseBgRemovalMode("1")).toBe("chromakey");
  });

  it("'mediapipe' → mediapipe", () => {
    expect(parseBgRemovalMode("mediapipe")).toBe("mediapipe");
  });

  it("알 수 없는 값 → mediapipe(기본값)", () => {
    expect(parseBgRemovalMode("unknown")).toBe("mediapipe");
    expect(parseBgRemovalMode("")).toBe("mediapipe");
  });
});

describe("parsePaymentTerminalMode", () => {
  it("'manual' → manual", () => {
    expect(parsePaymentTerminalMode("manual")).toBe("manual");
  });

  it("그 외 → payapp_lite", () => {
    expect(parsePaymentTerminalMode("payapp_lite")).toBe("payapp_lite");
    expect(parsePaymentTerminalMode("")).toBe("payapp_lite");
    expect(parsePaymentTerminalMode("other")).toBe("payapp_lite");
  });
});

describe("parseCaptureModes", () => {
  it("콤마로 분리된 모드 파싱", () => {
    expect(parseCaptureModes("1x1,2x2")).toEqual(["1x1", "2x2"]);
  });

  it("공백 포함 시 trim 처리", () => {
    expect(parseCaptureModes("1x1, 2x2, 2x4")).toEqual(["1x1", "2x2", "2x4"]);
  });

  it("빈 항목 제거", () => {
    expect(parseCaptureModes("1x1,,2x2")).toEqual(["1x1", "2x2"]);
  });

  it("단일 모드", () => {
    expect(parseCaptureModes("2x2")).toEqual(["2x2"]);
  });
});

