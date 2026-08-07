import { useState, useRef, useEffect, useCallback } from "react";

/**
 * 1초 단위 카운트다운 + 롱프레스 일시정지/재개(멈춘 지점부터 이어 세기).
 * 유휴 타이머와 인화 타이머가 공통으로 사용한다. 표시 컴포넌트는 CircularTimer.
 *
 * @param active  타이머가 돌아야 하는 단계인지. false면 정지 + 표시 초기화.
 * @param seconds 총 카운트다운 시간(초). 0 이하면 동작하지 않는다.
 * @param onTimeout 0에 도달했을 때 호출(최신 참조 유지 — 매 렌더 새 함수여도 안전).
 * @param resetKey 값이 바뀌면 남은시간을 full로 리셋 + 일시정지 해제 + 카운트다운 재시작.
 *   예: 유휴 타이머는 단계(step)마다 리셋해야 하므로 currentStep을 넘긴다.
 *   생략 시 active 변화에만 리셋된다(활성 단계가 하나뿐인 인화 타이머용 기본값).
 * @returns remaining 남은초(null=미동작), paused 일시정지 여부, togglePause 토글, reset 즉시 정지+초기화.
 */
export function useCountdown(
  active: boolean,
  seconds: number,
  onTimeout: () => void,
  resetKey: unknown = active,
) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const initRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  // 남은 시간(초)을 ref로 추적 — 일시정지 후 재개 시 멈춘 지점에서 이어 세기 위함.
  const remainingRef = useRef<number>(seconds);

  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  const stopTimers = useCallback(() => {
    if (initRef.current) { clearTimeout(initRef.current); initRef.current = null; }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    stopTimers();
    remainingRef.current = seconds;
    setRemaining(null);
  }, [stopTimers, seconds]);

  // 일시정지/재개 토글 (롱프레스로 호출). active·seconds 변경 시엔 자동 해제된다.
  const togglePause = useCallback(() => setPaused((p) => !p), []);

  // resetKey/seconds 변경 → 남은시간을 full로 리셋 + 일시정지 해제(새 화면은 처음부터 정상 동작).
  useEffect(() => {
    remainingRef.current = seconds;
    const t = setTimeout(() => setPaused(false), 0);
    return () => clearTimeout(t);
  }, [resetKey, seconds]);

  // 카운트다운 실행. paused면 멈추고(remaining 프리즈), 비대상이면 정지+표시 초기화.
  // 모든 setState는 콜백에서 수행 (effect 본문 동기 setState 회피).
  useEffect(() => {
    if (!active || seconds <= 0) {
      stopTimers();
      const t = setTimeout(() => setRemaining(null), 0);
      return () => clearTimeout(t);
    }
    if (paused) return;

    // 재개면 멈춘 남은시간(remainingRef)부터, 새로 시작이면 full부터.
    const start = remainingRef.current > 0 ? remainingRef.current : seconds;
    const deadline = Date.now() + start * 1000;
    initRef.current = setTimeout(() => setRemaining(start), 0);
    tickRef.current = setInterval(() => {
      const r = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      remainingRef.current = r;
      setRemaining(r);
    }, 1000);
    timerRef.current = setTimeout(() => {
      stopTimers();
      remainingRef.current = seconds;
      setRemaining(null);
      onTimeoutRef.current();
    }, start * 1000);

    return () => {
      // 정리 시(일시정지·단계변경 등) 남은시간을 갱신해 재개 시 이어 세게 한다.
      remainingRef.current = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      stopTimers();
    };
  }, [active, seconds, paused, stopTimers, resetKey]);

  return { remaining, paused, togglePause, reset };
}
