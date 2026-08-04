import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 촬영 화면의 자동 촬영 카운트다운 타이머.
 *
 * 남은 촬영이 있고(countdown 없음, photosCount < maxPhotos, seconds > 0) 일 때
 * seconds초부터 1초 간격으로 카운트다운하며, 0에 도달하면 onFire()로 촬영을 발동한다.
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
}): { autoTimer: number | null; cancel: () => void } {
  const [autoTimer, setAutoTimer] = useState<number | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // onFire의 최신 참조를 ref로 유지 (아래 effect deps에서 제외하기 위함).
  const onFireRef = useRef(onFire);
  useEffect(() => { onFireRef.current = onFire; }, [onFire]);

  // setState는 전부 타이머 콜백에서 수행 (effect 본문 동기 setState 회피).
  useEffect(() => {
    if (photosCount >= maxPhotos || countdown !== null) return;
    if (seconds <= 0) return;

    const deadline = Date.now() + seconds * 1000;
    const init = setTimeout(() => setAutoTimer(seconds), 0);
    autoTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
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

  // 수동/제스처 촬영 시 진행 중이던 자동 타이머를 즉시 취소한다.
  const cancel = useCallback(() => {
    if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    setAutoTimer(null);
  }, []);

  return { autoTimer, cancel };
}
