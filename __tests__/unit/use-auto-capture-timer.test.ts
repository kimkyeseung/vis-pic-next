// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoCaptureTimer } from "@/hooks/useAutoCaptureTimer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const defaults = {
  photosCount: 0,
  maxPhotos: 4,
  countdown: null as number | null,
  seconds: 30,
  onFire: () => {},
};

describe("useAutoCaptureTimer", () => {
  it("마운트 후 autoTimer가 seconds로 초기화되고 1초마다 감소한다", () => {
    const { result } = renderHook(() => useAutoCaptureTimer({ ...defaults, onFire: vi.fn() }));

    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.autoTimer).toBe(30);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.autoTimer).toBe(25);
  });

  it("시간이 다 되면 onFire가 정확히 1번 호출되고 autoTimer가 초기화된다", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() => useAutoCaptureTimer({ ...defaults, seconds: 3, onFire }));

    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(3000); });

    expect(onFire).toHaveBeenCalledTimes(1);
    expect(result.current.autoTimer).toBeNull();

    // 발동 후 타이머가 정리돼 추가 호출이 없어야 한다
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  // ── 이 훅의 존재 이유(회귀 테스트) ─────────────────────────────────────────
  // onFire(= 부모 capturePhoto)는 배경 변경·스티커 적용 등 부모 리렌더마다 새 참조가 된다.
  // 예전(인라인) 코드는 이 참조를 타이머 effect deps에 넣어, 그때마다 deadline이 초기화돼
  // 타이머가 리셋됐다. 아래 테스트는 onFire 참조가 바뀌어도 카운트다운이 유지됨을 보장한다.
  it("진행 중 onFire 참조만 바뀌어도 타이머가 리셋되지 않는다 (배경/스티커 변경 회귀)", () => {
    const onFireA = vi.fn();
    const onFireB = vi.fn();
    const { result, rerender } = renderHook(
      ({ onFire }: { onFire: () => void }) => useAutoCaptureTimer({ ...defaults, seconds: 30, onFire }),
      { initialProps: { onFire: onFireA } },
    );

    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.autoTimer).toBe(25);

    // 부모 리렌더로 새 onFire 참조 전달 (배경 변경·스티커 적용 시뮬레이션)
    rerender({ onFire: onFireB });
    act(() => { vi.advanceTimersByTime(0); });
    // 리셋됐다면 30으로 돌아갔을 것 — 25로 유지되어야 한다
    expect(result.current.autoTimer).toBe(25);

    // 최초 시작 기준 30초 시점에 발동하며(재시작 안 함), 발동 시엔 최신 onFire(B)가 호출된다
    act(() => { vi.advanceTimersByTime(25000); });
    expect(onFireB).toHaveBeenCalledTimes(1);
    expect(onFireA).not.toHaveBeenCalled();
  });

  it("촬영 매수가 가득 차면(photosCount >= maxPhotos) 타이머를 돌리지 않는다", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() =>
      useAutoCaptureTimer({ ...defaults, photosCount: 4, maxPhotos: 4, onFire }),
    );

    act(() => { vi.advanceTimersByTime(40000); });
    expect(result.current.autoTimer).toBeNull();
    expect(onFire).not.toHaveBeenCalled();
  });

  it("카운트다운 중(countdown !== null)에는 타이머를 돌리지 않는다", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() =>
      useAutoCaptureTimer({ ...defaults, countdown: 2, onFire }),
    );

    act(() => { vi.advanceTimersByTime(40000); });
    expect(result.current.autoTimer).toBeNull();
    expect(onFire).not.toHaveBeenCalled();
  });

  it("seconds가 0 이하면 타이머를 돌리지 않는다", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() =>
      useAutoCaptureTimer({ ...defaults, seconds: 0, onFire }),
    );

    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.autoTimer).toBeNull();
    expect(onFire).not.toHaveBeenCalled();
  });

  it("카운트다운이 끝나(countdown null 복귀) 다음 촬영이 남아있으면 타이머가 새로 시작된다", () => {
    const onFire = vi.fn();
    const { result, rerender } = renderHook(
      ({ countdown }: { countdown: number | null }) =>
        useAutoCaptureTimer({ ...defaults, seconds: 10, countdown, onFire }),
      { initialProps: { countdown: 3 as number | null } },
    );

    // 카운트다운 중에는 정지
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.autoTimer).toBeNull();

    // 촬영 끝 → countdown 해제 → 타이머 재시작
    rerender({ countdown: null });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.autoTimer).toBe(10);
  });

  it("cancel() 호출 시 즉시 정지하고 이후 onFire가 호출되지 않는다", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() => useAutoCaptureTimer({ ...defaults, seconds: 10, onFire }));

    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.autoTimer).toBe(10);

    act(() => { result.current.cancel(); });
    expect(result.current.autoTimer).toBeNull();

    act(() => { vi.advanceTimersByTime(15000); });
    expect(onFire).not.toHaveBeenCalled();
  });

  // ── 길게 눌러 일시정지/재개 ─────────────────────────────────────────────
  it("togglePause()로 일시정지하면 시간이 지나도 autoTimer가 그대로 멈춰있고 onFire도 안 불린다", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() => useAutoCaptureTimer({ ...defaults, seconds: 10, onFire }));

    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.autoTimer).toBe(7);

    act(() => { result.current.togglePause(); });
    expect(result.current.paused).toBe(true);

    act(() => { vi.advanceTimersByTime(20000); });
    expect(result.current.autoTimer).toBe(7);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("일시정지 후 재개하면 멈췄던 시점의 남은 시간부터 이어서 카운트다운한다", () => {
    const onFire = vi.fn();
    const { result } = renderHook(() => useAutoCaptureTimer({ ...defaults, seconds: 10, onFire }));

    act(() => { vi.advanceTimersByTime(0); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.autoTimer).toBe(7);

    act(() => { result.current.togglePause(); }); // 일시정지
    act(() => { vi.advanceTimersByTime(8000); }); // 정지 중 시간 경과(발동 안 해야 함)
    act(() => { result.current.togglePause(); }); // 재개
    expect(result.current.paused).toBe(false);

    // 재개 직후엔 아직 7초 남아있어야 한다
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.autoTimer).toBe(7);
    expect(onFire).not.toHaveBeenCalled();

    // 재개 후 7초가 더 지나야 발동한다
    act(() => { vi.advanceTimersByTime(6000); });
    expect(onFire).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("새 촬영 사이클이 시작되면(photosCount 변경) paused가 초기화된다", () => {
    const onFire = vi.fn();
    const { result, rerender } = renderHook(
      ({ photosCount }: { photosCount: number }) =>
        useAutoCaptureTimer({ ...defaults, seconds: 10, photosCount, onFire }),
      { initialProps: { photosCount: 0 } },
    );

    act(() => { vi.advanceTimersByTime(0); });
    act(() => { result.current.togglePause(); });
    expect(result.current.paused).toBe(true);

    rerender({ photosCount: 1 });
    expect(result.current.paused).toBe(false);
  });
});
