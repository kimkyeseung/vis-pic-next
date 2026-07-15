import { useState, useRef, useEffect, useCallback } from "react";
import type { Step } from "@/types";

export function useIdleTimer(
  currentStep: Step,
  timeoutSeconds: number,
  onTimeout: () => void,
) {
  const [idleRemaining, setIdleRemaining] = useState<number | null>(null);
  const initRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  const stopTimers = useCallback(() => {
    if (initRef.current) { clearTimeout(initRef.current); initRef.current = null; }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const clearIdleTimer = useCallback(() => {
    stopTimers();
    setIdleRemaining(null);
  }, [stopTimers]);

  // timeoutSeconds가 비동기 설정 로드로 바뀌면 새 값으로 타이머를 재시작한다.
  // 초기값 표시를 포함한 모든 setState는 타이머 콜백에서 수행 (effect 본문 동기 setState 회피).
  useEffect(() => {
    if (currentStep === "start" || currentStep === "camera" || currentStep === "payment" || currentStep === "complete" || timeoutSeconds <= 0) return;

    const deadline = Date.now() + timeoutSeconds * 1000;
    initRef.current = setTimeout(() => setIdleRemaining(timeoutSeconds), 0);
    tickRef.current = setInterval(() => {
      setIdleRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);
    timerRef.current = setTimeout(() => {
      stopTimers();
      setIdleRemaining(null);
      onTimeoutRef.current();
    }, timeoutSeconds * 1000);

    return stopTimers;
  }, [currentStep, timeoutSeconds, stopTimers]);

  return { idleRemaining, clearIdleTimer };
}
