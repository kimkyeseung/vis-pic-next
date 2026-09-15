"use client";

/** AI(MediaPipe) 배경제거(`mediapipe` 모드)의 슬라이더 패널. */
export function MediapipeControls({
  threshold,
  onThresholdChange,
  feather,
  onFeatherChange,
}: {
  threshold: number;
  onThresholdChange: (n: number) => void;
  feather: number;
  onFeatherChange: (n: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">경계 침식 ({threshold}%)</label>
        <input
          type="range"
          min={0}
          max={100}
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">경계 부드러움 ({feather}%)</label>
        <input
          type="range"
          min={1}
          max={100}
          value={feather}
          onChange={(e) => onFeatherChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
    </div>
  );
}
