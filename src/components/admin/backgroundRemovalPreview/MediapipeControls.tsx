"use client";

import { INFERENCE_INTERVAL_OPTIONS } from "./usePreviewCamera";

/** AI(MediaPipe) 배경제거(`mediapipe` 모드)의 슬라이더 패널. */
export function MediapipeControls({
  threshold,
  onThresholdChange,
  feather,
  onFeatherChange,
  inferenceInterval,
  onInferenceIntervalChange,
}: {
  threshold: number;
  onThresholdChange: (n: number) => void;
  feather: number;
  onFeatherChange: (n: number) => void;
  inferenceInterval: number;
  onInferenceIntervalChange: (ms: number) => void;
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
      {/* 추론 스로틀 — 서비스 화면 디버그 패널과 같은 선택지. 미리보기에만 적용되고 저장되지 않는다. */}
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">추론 스로틀 ({inferenceInterval}ms)</label>
        <div className="flex flex-1 gap-1">
          {INFERENCE_INTERVAL_OPTIONS.map((ms) => (
            <button
              key={ms}
              type="button"
              onClick={() => onInferenceIntervalChange(ms)}
              aria-pressed={inferenceInterval === ms}
              className={`px-2 py-1 rounded text-xs tabular-nums transition-colors ${
                inferenceInterval === ms
                  ? "bg-emerald-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {ms}
            </button>
          ))}
        </div>
      </div>
      <p className="text-gray-500 text-xs pl-[10.75rem]">
        마스크를 다시 계산하는 최소 간격. 낮을수록 잔상이 줄지만 CPU 부하가 커집니다. 미리보기에만 적용되며 저장되지 않습니다.
      </p>
    </div>
  );
}
