// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePhotoFlow } from "@/hooks/usePhotoFlow";
import type { BGImage, DeviceConfig } from "@/types";

/**
 * advanceFromCurrentStep은 다음 순간에만 호출된다:
 *  - 다음(onNext) 버튼 클릭
 *  - 유휴 타이머(useIdleTimer) 만료 시 자동 진행
 * 두 경로가 같은 함수를 타므로, 여기서는 "선택 없이 타이머가 만료된" 상황(각 단계에서
 * 아무것도 고르지 않은 채 advanceFromCurrentStep을 바로 호출)을 기준으로 검증한다.
 */

const baseConfig: DeviceConfig = {
  deviceId: "test",
  deviceName: "테스트 장치",
  paymentEnabled: false,
  paymentAmount: 5000,
  paymentTiers: [{ qty: 1, price: 5000 }],
  paymentTerminalMode: "payapp_lite",
  captureSeconds: 3,
  captureCount: 4,
  cameraResolution: "fhd",
  chromakeyRgb: "0,255,0",
  chromakeySimilarity: 50,
  chromakeySmoothness: 50,
  chromakeySpill: 0,
  chromakeyChoke: 0,
  chromakeyLumaIndependent: false,
  chromakeyYuvRgb: "0,255,0",
  chromakeyYuvSimilarity: 50,
  chromakeyYuvSmoothness: 50,
  chromakeyYuvSpill: 0,
  chromakeyYuvOpacity: 100,
  chromakeyYuvContrast: 0,
  chromakeyYuvBrightness: 0,
  chromakeyYuvGamma: 0,
  captureModes: ["1x1", "2x1", "2x2"],
  bgRemovalMode: "mediapipe",
  idleTimeoutSeconds: 30,
  cameraAutoTimerSeconds: 60,
  printAutoTimerSeconds: 30,
  segmentThreshold: 15,
  segmentFeather: 35,
  themeTextColor: "#ffffff",
  themePrimaryColor: "#6c6fb4",
  themeBgColor: "#2a2a2a",
  btnGlowEnabled: true,
  btnGlowColor: "#6c6fb4",
  btnGlowSize: 28,
  btnCaptureTextColor: "#2a2a2a",
  btnNextTextColor: "#ffffff",
  btnPaymentTextColor: "#ffffff",
};

const printBg: BGImage[] = [
  { id: 101, name: "프레임A", filename: "frame-a.png" },
  { id: 102, name: "프레임B", filename: "frame-b.png" },
];

beforeEach(() => {
  sessionStorage.clear();
});

describe("usePhotoFlow.advanceFromCurrentStep", () => {
  it("start: 결제 비활성이면 frame으로 바로 진행", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig));
    act(() => { result.current.advanceFromCurrentStep(); });
    expect(result.current.currentStep).toBe("frame");
  });

  it("start: 결제 활성이면 payment로 진행", () => {
    const { result } = renderHook(() => usePhotoFlow("test", { ...baseConfig, paymentEnabled: true }));
    act(() => { result.current.advanceFromCurrentStep(); });
    expect(result.current.currentStep).toBe("payment");
  });

  it("payment: 다음 단계인 frame으로 진행", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig));
    act(() => { result.current.goToStep("payment"); });
    act(() => { result.current.advanceFromCurrentStep(); });
    expect(result.current.currentStep).toBe("frame");
  });

  it("frame: 아무것도 선택하지 않고 타임아웃되면 첫 번째 캡처모드가 자동 선택된다", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig));
    act(() => { result.current.goToStep("frame"); });
    expect(result.current.selectedFrame).toBeNull();

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.selectedFrame).toBe(baseConfig.captureModes[0]);
    expect(result.current.currentStep).toBe("background");
  });

  it("frame: 이미 선택된 프레임이 있으면 그대로 유지한 채 진행", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig));
    act(() => { result.current.goToStep("frame"); });
    act(() => { result.current.setSelectedFrame("2x2"); });

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.selectedFrame).toBe("2x2");
    expect(result.current.currentStep).toBe("background");
  });

  it("frame: 캡처모드가 비어 있으면 selectedFrame은 null로 남지만 다음 단계로는 진행한다", () => {
    const { result } = renderHook(() => usePhotoFlow("test", { ...baseConfig, captureModes: [] }));
    act(() => { result.current.goToStep("frame"); });

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.selectedFrame).toBeNull();
    expect(result.current.currentStep).toBe("background");
  });

  it("background: 선택 없이 타임아웃되면 '배경 없음'(-1)으로 진행", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig));
    act(() => { result.current.goToStep("background"); });

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.selectedBackground).toBe(-1);
    expect(result.current.currentStep).toBe("camera");
  });

  it("select: 인쇄배경 이미지가 있으면 printbg로, 없으면 complete로 진행", () => {
    const { result: withPrintBg } = renderHook(() => usePhotoFlow("test", baseConfig, printBg));
    act(() => { withPrintBg.current.goToStep("select"); });
    act(() => { withPrintBg.current.advanceFromCurrentStep(); });
    expect(withPrintBg.current.currentStep).toBe("printbg");

    const { result: withoutPrintBg } = renderHook(() => usePhotoFlow("test", baseConfig, []));
    act(() => { withoutPrintBg.current.goToStep("select"); });
    act(() => { withoutPrintBg.current.advanceFromCurrentStep(); });
    expect(withoutPrintBg.current.currentStep).toBe("complete");
  });

  // 회귀 테스트: printbg(인쇄 프레임 선택) 단계에서 아무것도 고르지 않고 유휴 타이머가
  // 만료되면 selectedPrintBg가 null인 채로 complete로 넘어가, CompleteSection이 프레임을
  // 합성하지 못하고 배경 이미지만 남는 버그가 있었다. 이제 첫 번째 프레임이 자동 선택된다.
  it("printbg: 아무것도 선택하지 않고 타임아웃되면 첫 번째 프레임이 자동 선택된다", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig, printBg));
    act(() => { result.current.goToStep("printbg"); });
    expect(result.current.selectedPrintBg).toBeNull();

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.selectedPrintBg).toBe(printBg[0].id);
    expect(result.current.currentStep).toBe("complete");
  });

  it("printbg: 이미 선택된 프레임이 있으면 그대로 유지한 채 진행", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig, printBg));
    act(() => { result.current.goToStep("printbg"); });
    act(() => { result.current.setSelectedPrintBg(printBg[1].id); });

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.selectedPrintBg).toBe(printBg[1].id);
    expect(result.current.currentStep).toBe("complete");
  });

  it("printbg: 인쇄배경 이미지가 하나도 없으면 selectedPrintBg는 null로 남지만 다음 단계로는 진행한다", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig, []));
    act(() => { result.current.goToStep("printbg"); });

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.selectedPrintBg).toBeNull();
    expect(result.current.currentStep).toBe("complete");
  });

  it("complete: 타임아웃되면 전체 상태가 초기화되고 start로 돌아간다", () => {
    const { result } = renderHook(() => usePhotoFlow("test", baseConfig, printBg));
    act(() => { result.current.goToStep("printbg"); });
    act(() => { result.current.setSelectedPrintBg(printBg[0].id); });
    act(() => { result.current.goToStep("complete"); });

    act(() => { result.current.advanceFromCurrentStep(); });

    expect(result.current.currentStep).toBe("start");
    expect(result.current.selectedFrame).toBeNull();
    expect(result.current.selectedBackground).toBeNull();
    expect(result.current.selectedPrintBg).toBeNull();
  });
});
