import type { Step } from "@/types";
import { useCountdown } from "./useCountdown";

// 촬영·결제·시작·완료 단계에선 유휴 타임아웃을 돌리지 않는다(그 외 단계에서만 동작).
const IDLE_OFF_STEPS: ReadonlySet<Step> = new Set<Step>(["start", "camera", "payment", "complete"]);

export function useIdleTimer(
  currentStep: Step,
  timeoutSeconds: number,
  onTimeout: () => void,
) {
  const { remaining, paused, togglePause, reset } = useCountdown(
    !IDLE_OFF_STEPS.has(currentStep),
    timeoutSeconds,
    onTimeout,
    currentStep, // 단계가 바뀔 때마다 새 화면 기준으로 타이머 리셋
  );
  return { idleRemaining: remaining, clearIdleTimer: reset, paused, togglePause };
}
