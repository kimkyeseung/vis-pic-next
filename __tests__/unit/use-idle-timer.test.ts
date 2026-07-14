// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import type { Step } from "@/types";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIdleTimer", () => {
  it("마운트 후 idleRemaining이 timeoutSeconds로 초기화된다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("frame", 30, onTimeout));

    expect(result.current.idleRemaining).toBeNull();
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.idleRemaining).toBe(30);
  });

  it("1초마다 카운트다운된다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("frame", 30, onTimeout));

    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.idleRemaining).toBe(30);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.idleRemaining).toBe(25);
  });

  it("시간이 다 되면 onTimeout이 정확히 1번 호출되고 idleRemaining이 초기화된다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("frame", 3, onTimeout));

    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(3000); });

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.idleRemaining).toBeNull();

    // 타이머가 완전히 정리돼 이후 시간이 더 지나도 추가 호출이 없어야 한다
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  // 회귀 테스트: 설정이 비동기 로드되어 기본값(30초)이 서버 설정값(예: 5초)으로
  // 바뀌었을 때, 예전 코드(deps=[currentStep]만)는 step이 바뀌기 전까지
  // 옛 30초짜리 타이머를 그대로 유지하는 stale-closure 버그가 있었다.
  it("타이머 진행 중 timeoutSeconds가 바뀌면 새 값으로 즉시 재시작한다", () => {
    const onTimeout = vi.fn();
    const { result, rerender } = renderHook(
      ({ seconds }: { seconds: number }) => useIdleTimer("frame", seconds, onTimeout),
      { initialProps: { seconds: 30 } },
    );

    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.idleRemaining).toBe(30);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.idleRemaining).toBe(28);

    // 설정 로드 완료 → timeoutSeconds 30 → 5로 변경
    rerender({ seconds: 5 });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.idleRemaining).toBe(5);

    // 옛 30초 타이머가 살아있었다면 여기(마운트 후 7초 시점)서 onTimeout이
    // 아직 호출되지 않아야 하지만, 새 5초 타이머는 이미 끝나 있어야 한다
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("currentStep이 camera면 타이머를 돌리지 않는다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("camera", 3, onTimeout));

    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.idleRemaining).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("currentStep이 start면 타이머를 돌리지 않는다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("start", 3, onTimeout));

    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.idleRemaining).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("currentStep이 payment면 타이머를 돌리지 않는다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("payment", 3, onTimeout));

    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.idleRemaining).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("timeoutSeconds가 0 이하면 타이머를 돌리지 않는다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("frame", 0, onTimeout));

    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.idleRemaining).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("clearIdleTimer 호출 시 즉시 정지하고 이후 onTimeout이 호출되지 않는다", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimer("frame", 10, onTimeout));

    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.idleRemaining).toBe(10);

    act(() => { result.current.clearIdleTimer(); });
    expect(result.current.idleRemaining).toBeNull();

    act(() => { vi.advanceTimersByTime(15000); });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("currentStep이 바뀌면 타이머가 새 단계 기준으로 리셋된다", () => {
    const onTimeout = vi.fn();
    const { result, rerender } = renderHook(
      ({ step }: { step: Step }) => useIdleTimer(step, 10, onTimeout),
      { initialProps: { step: "frame" as Step } },
    );

    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(7000); });
    expect(result.current.idleRemaining).toBe(3);

    rerender({ step: "background" });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.idleRemaining).toBe(10);
  });
});
