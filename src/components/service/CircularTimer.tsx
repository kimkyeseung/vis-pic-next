"use client";

interface CircularTimerProps {
  value: number;
  total: number;
  size?: number;
  testId?: string;
}

const strokeWidth = 4;

export function CircularTimer({ value, total, size = 72, testId }: CircularTimerProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, value / total));
  const offset = circumference * (1 - progress);

  return (
    <div
      className="absolute top-4 left-4 z-50 flex items-center justify-center"
      style={{ width: size, height: size }}
      data-testid={testId}
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
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.95s linear" }}
        />
      </svg>
      <span
        className="font-bold text-white tabular-nums"
        style={{ fontSize: size * 0.34, lineHeight: 1, position: "relative" }}
      >
        {value}
      </span>
    </div>
  );
}
