import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 촬영 화면의 자동 촬영 카운트다운 타이머.
 *
 * 남은 촬영이 있고(countdown 없음, photosCount < maxPhotos, seconds > 0) 일 때
 * seconds초부터 1초 간격으로 카운트다운하며, 0에 도달하면 onFire()로 촬영을 발동한다.
 * 타이머 원(CircularTimer)을 길게 누르면 일시정지/재개할 수 있다.
 *
 * ⚠️ 회귀 주의: onFire(= 부모의 capturePhoto)는 onCapture(usePhotoFlow.addPhoto — useCallback
 * 미적용이라 매 렌더 새 참조)에 의존해 배경 변경·스티커 적용 등 부모 리렌더마다 참조가 바뀐다.
 * onFire를 타이머 effect의 의존성에 직접 넣으면 그때마다 effect가 재실행돼 deadline이 초기화
 * (타이머 리셋)된다. 그래서 onFire는 ref로만 참조하고 effect deps에서 제외한다.
 */
export function useAutoCaptureTimer({
  photosCount,
  maxPhotos,
  countdown,
  seconds,
  onFire,
}: {
  photosCount: number;
  maxPhotos: number;
  countdown: number | null;
  seconds: number;
  onFire: () => void;
}): { autoTimer: number | null; cancel: () => void; paused: boolean; togglePause: () => void } {
  const [autoTimer, setAutoTimer] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // deadline은 일시정지 재개 시 뒤로 밀어야 해서 interval 밖(ref)에서 관리한다.
  const deadlineRef = useRef<number | null>(null);
  const pauseStartRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // onFire의 최신 참조를 ref로 유지 (아래 effect deps에서 제외하기 위함).
  const onFireRef = useRef(onFire);
  useEffect(() => { onFireRef.current = onFire; }, [onFire]);

  // setState는 전부 타이머 콜백에서 수행 (effect 본문 동기 setState 회피).
  useEffect(() => {
    if (photosCount >= maxPhotos || countdown !== null) return;
    if (seconds <= 0) return;

    setPaused(false);
    pauseStartRef.current = null;
    deadlineRef.current = Date.now() + seconds * 1000;
    const init = setTimeout(() => setAutoTimer(seconds), 0);
    autoTimerRef.current = setInterval(() => {
      // 일시정지 중엔 deadline도, 표시값도 건드리지 않고 그대로 멈춰 둔다.
      if (pausedRef.current || deadlineRef.current === null) return;
      const remaining = Math.ceil((deadlineRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        if (autoTimerRef.current) clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
        setAutoTimer(null);
        onFireRef.current();
      } else {
        setAutoTimer(remaining);
      }
    }, 1000);

    return () => {
      clearTimeout(init);
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    };
    // onFire는 ref로 참조하므로 deps에서 제외 — 배경/스티커 변경 시 타이머가 리셋되지 않도록 한다.
  }, [photosCount, maxPhotos, countdown, seconds]);

  // 일시정지/재개 토글. 재개 시 멈춰 있던 시간만큼 deadline을 뒤로 밀어 남은 시간이 그대로 이어지게 한다.
  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p;
      if (next) {
        pauseStartRef.current = Date.now();
      } else if (pauseStartRef.current !== null && deadlineRef.current !== null) {
        deadlineRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
      return next;
    });
  }, []);

  // 수동/제스처 촬영 시 진행 중이던 자동 타이머를 즉시 취소한다.
  const cancel = useCallback(() => {
    if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    setAutoTimer(null);
    setPaused(false);
    pauseStartRef.current = null;
  }, []);

  return { autoTimer, cancel, paused, togglePause };
}
