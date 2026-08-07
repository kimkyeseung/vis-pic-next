"use client";

import { useRef } from "react";

interface CircularTimerProps {
  value: number;
  total: number;
  size?: number;
  testId?: string;
  /** 롱프레스(길게 누르기) 시 호출 — 일시정지/재개 토글용. 지정 시 타이머가 눌림 가능해진다. */
  onLongPress?: () => void;
  /** 일시정지 상태 — ⏸ 표시 + 딤 처리. */
  paused?: boolean;
  /** 위치(Tailwind) 클래스. 기본 우상단 여백 top-12 right-12. */
  positionClass?: string;
}

const strokeWidth = 4;
const LONG_PRESS_MS = 700;

export function CircularTimer({ value, total, size = 108, testId, onLongPress, paused = false, positionClass = "top-12 right-12" }: CircularTimerProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, value / total));
  const offset = circumference * (1 - progress);

  // 롱프레스 감지 — pointerdown 후 LONG_PRESS_MS 유지되면 발동. 떼거나 벗어나면 취소.
  const pressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => {
    if (!onLongPress) return;
    pressRef.current = setTimeout(() => { pressRef.current = null; onLongPress(); }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressRef.current) { clearTimeout(pressRef.current); pressRef.current = null; }
  };

  const ringColor = paused ? "rgba(251,191,36,0.85)" : "rgba(255,255,255,0.85)";

  return (
    <div
      className={`absolute ${positionClass} z-50 flex items-center justify-center`}
      style={{ width: size, height: size, cursor: onLongPress ? "pointer" : undefined, touchAction: onLongPress ? "none" : undefined }}
      data-testid={testId}
      onPointerDown={onLongPress ? startPress : undefined}
      onPointerUp={onLongPress ? cancelPress : undefined}
      onPointerLeave={onLongPress ? cancelPress : undefined}
      onPointerCancel={onLongPress ? cancelPress : undefined}
      title={onLongPress ? "길게 눌러 일시정지/재개" : undefined}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.95s linear", opacity: paused ? 0.6 : 1 }}
        />
      </svg>
      <span
        className="font-bold tabular-nums"
        style={{ fontSize: size * 0.34, lineHeight: 1, position: "relative", color: paused ? "#fbbf24" : "#fff" }}
      >
        {paused ? "⏸" : value}
      </span>
    </div>
  );
}
