"use client";

import { INFERENCE_INTERVAL_OPTIONS } from "./usePreviewCamera";
import type { SegmentProcessScale } from "@/types";

/** 슬라이더 한 줄 — 라벨/값/설명을 같은 형태로 맞춘다. */
function Slider({
  label,
  value,
  suffix = "%",
  min,
  max,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  onChange: (n: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">
          {label} ({value}
          {suffix})
        </label>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      {hint && <p className="text-gray-500 text-xs pl-[10.75rem] mt-1">{hint}</p>}
    </div>
  );
}

const PROCESS_SCALE_OPTIONS: { value: SegmentProcessScale; label: string }[] = [
  { value: "auto", label: "자동" },
  { value: "100", label: "100%" },
  { value: "50", label: "50%" },
  { value: "25", label: "25%" },
];

/**
 * AI(MediaPipe) 배경제거(`mediapipe` 모드)의 조정 패널.
 *
 * 값 축(경계 침식/부드러움)과 공간 축(경계 블러/두께)을 나눠 배치한다 — 경계 계단은 공간 축
 * 문제라 부드러움을 아무리 넓혀도 안 없어지고 고스팅만 는다(docs/CAMERA_QUALITY.md 4장).
 * 추론 스로틀만 미리보기 전용이고 나머지는 전부 저장되는 촬영 설정이다.
 */
export function MediapipeControls({
  threshold,
  onThresholdChange,
  feather,
  onFeatherChange,
  maskBlur,
  onMaskBlurChange,
  edgeShift,
  onEdgeShiftChange,
  temporal,
  onTemporalChange,
  roi,
  onRoiChange,
  roiMargin,
  onRoiMarginChange,
  processScale,
  onProcessScaleChange,
  inferenceInterval,
  onInferenceIntervalChange,
}: {
  threshold: number;
  onThresholdChange: (n: number) => void;
  feather: number;
  onFeatherChange: (n: number) => void;
  maskBlur: number;
  onMaskBlurChange: (n: number) => void;
  edgeShift: number;
  onEdgeShiftChange: (n: number) => void;
  temporal: number;
  onTemporalChange: (n: number) => void;
  roi: boolean;
  onRoiChange: (v: boolean) => void;
  roiMargin: number;
  onRoiMarginChange: (n: number) => void;
  processScale: SegmentProcessScale;
  onProcessScaleChange: (v: SegmentProcessScale) => void;
  inferenceInterval: number;
  onInferenceIntervalChange: (ms: number) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <h4 className="text-gray-300 text-sm font-semibold">경계 — 확신도 기준</h4>
        <Slider
          label="경계 침식"
          value={threshold}
          min={0}
          max={100}
          onChange={onThresholdChange}
          hint="높일수록 인물 가장자리를 안쪽으로 깎습니다. 낮추면 손끝이 살아나는 대신 배경 헤일로가 늘어납니다."
        />
        <Slider
          label="경계 부드러움"
          value={feather}
          min={1}
          max={100}
          onChange={onFeatherChange}
          hint="반투명 전환대의 폭. 넓히면 고스팅이 늘고, 좁혀도 계단은 안 없어집니다(계단은 아래 블러로)."
        />
      </section>

      <section className="space-y-3 border-t border-gray-700 pt-4">
        <h4 className="text-gray-300 text-sm font-semibold">경계 — 공간 기준</h4>
        <Slider
          label="경계 블러"
          value={maskBlur}
          min={0}
          max={200}
          onChange={onMaskBlurChange}
          hint="AI 모델의 256칸 격자에서 오는 계단을 지웁니다. 0이면 끔, 과하면 실루엣이 뭉갭니다."
        />
        <Slider
          label="경계 두께"
          value={edgeShift}
          min={-100}
          max={100}
          suffix=""
          onChange={onEdgeShiftChange}
          hint="−면 경계를 안쪽으로 깎아 헤일로를 없애고, +면 바깥으로 살립니다. 블러가 만든 전환대 안에서 움직이므로 블러 0이면 최소치가 자동 적용됩니다."
        />
        <Slider
          label="경계 떨림 억제"
          value={temporal}
          min={0}
          max={100}
          onChange={onTemporalChange}
          hint="이전 마스크를 섞어 프레임마다 경계가 떠는 것을 줄입니다. 높이면 움직일 때 잔상이 생깁니다."
        />
      </section>

      <section className="space-y-3 border-t border-gray-700 pt-4">
        <h4 className="text-gray-300 text-sm font-semibold">해상도</h4>
        <div className="flex items-center gap-3">
          <label className="text-gray-400 text-sm w-40 shrink-0">인물 추적 크롭</label>
          <button
            type="button"
            onClick={() => onRoiChange(!roi)}
            aria-pressed={roi}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              roi ? "bg-emerald-500 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {roi ? "켬" : "끔"}
          </button>
        </div>
        <p className="text-gray-500 text-xs pl-[10.75rem]">
          인물 주변만 잘라 추론해 경계 해상도를 올립니다. 모델 입력이 256×256 고정이라, 좁게 볼수록 계단이 실제로 얇아집니다.
        </p>
        <Slider
          label="추적 여유"
          value={roiMargin}
          min={0}
          max={100}
          onChange={onRoiMarginChange}
          disabled={!roi}
          hint="크롭을 인물보다 얼마나 넓게 잡을지. 좁힐수록 해상도 이득이 크고, 빠르게 움직일 때 놓칠 위험도 커집니다."
        />
        <div className="flex items-center gap-3">
          <label className="text-gray-400 text-sm w-40 shrink-0">처리 해상도</label>
          <div className="flex flex-1 gap-1">
            {PROCESS_SCALE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onProcessScaleChange(o.value)}
                aria-pressed={processScale === o.value}
                className={`px-2 py-1 rounded text-xs tabular-nums transition-colors ${
                  processScale === o.value
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-gray-500 text-xs pl-[10.75rem]">
          배경제거를 돌리는 해상도(카메라 해상도 대비). 자동은 4K에서만 25%로 낮춥니다. 높일수록 마스크가 정밀하지만 느려집니다.
        </p>
      </section>

      {/* 추론 스로틀 — 서비스 화면 디버그 패널과 같은 선택지. 미리보기에만 적용되고 저장되지 않는다. */}
      <section className="space-y-3 border-t border-gray-700 pt-4">
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
      </section>
    </div>
  );
}
