import { useState, useRef, useEffect, useCallback } from "react";
import type { Step } from "@/types";

export function useIdleTimer(
  currentStep: Step,
  timeoutSeconds: number,
  onTimeout: () => void,
) {
  const [idleRemaining, setIdleRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  const clearIdleTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    setIdleRemaining(null);
  }, []);

  const startIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (timeoutSeconds <= 0) return;

    const deadline = Date.now() + timeoutSeconds * 1000;
    setIdleRemaining(timeoutSeconds);

    tickRef.current = setInterval(() => {
      setIdleRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);

    timerRef.current = setTimeout(() => {
      clearIdleTimer();
      onTimeoutRef.current();
    }, timeoutSeconds * 1000);
  }, [timeoutSeconds, clearIdleTimer]);

  useEffect(() => {
    if (currentStep === "camera") { clearIdleTimer(); return; }
    startIdleTimer();
    return clearIdleTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  return { idleRemaining, clearIdleTimer };
}
