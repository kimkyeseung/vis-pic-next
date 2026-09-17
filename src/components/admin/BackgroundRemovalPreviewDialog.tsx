"use client";

import { useState } from "react";
import { usePreviewCamera, DEFAULT_INFERENCE_INTERVAL_MS } from "./backgroundRemovalPreview/usePreviewCamera";
import { ChromaKeyControls } from "./backgroundRemovalPreview/ChromaKeyControls";
import { ChromaKeyYuvControls } from "./backgroundRemovalPreview/ChromaKeyYuvControls";
import { MediapipeControls } from "./backgroundRemovalPreview/MediapipeControls";
import type { SegmentProcessScale } from "@/types";

export function BackgroundRemovalPreviewDialog({
  mode,
  chromaColor,
  onChromaColorChange,
  similarity,
  onSimilarityChange,
  smoothness,
  onSmoothnessChange,
  spill,
  onSpillChange,
  choke,
  onChokeChange,
  lumaIndependent,
  onLumaIndependentChange,
  yuvChromaColor,
  onYuvChromaColorChange,
  yuvSimilarity,
  onYuvSimilarityChange,
  yuvSmoothness,
  onYuvSmoothnessChange,
  yuvSpill,
  onYuvSpillChange,
  yuvOpacity,
  onYuvOpacityChange,
  yuvContrast,
  onYuvContrastChange,
  yuvBrightness,
  onYuvBrightnessChange,
  yuvGamma,
  onYuvGammaChange,
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
  handRescue,
  onHandRescueChange,
  onClose,
}: {
  mode: "mediapipe" | "chromakey" | "chromakey-yuv";
  chromaColor: { r: number; g: number; b: number };
  onChromaColorChange: (rgb: string) => void;
  similarity: number;
  onSimilarityChange: (n: number) => void;
  smoothness: number;
  onSmoothnessChange: (n: number) => void;
  spill: number;
  onSpillChange: (n: number) => void;
  choke: number;
  onChokeChange: (n: number) => void;
  lumaIndependent: boolean;
  onLumaIndependentChange: (v: boolean) => void;
  yuvChromaColor: { r: number; g: number; b: number };
  onYuvChromaColorChange: (rgb: string) => void;
  yuvSimilarity: number;
  onYuvSimilarityChange: (n: number) => void;
  yuvSmoothness: number;
  onYuvSmoothnessChange: (n: number) => void;
  yuvSpill: number;
  onYuvSpillChange: (n: number) => void;
  yuvOpacity: number;
  onYuvOpacityChange: (n: number) => void;
  yuvContrast: number;
  onYuvContrastChange: (n: number) => void;
  yuvBrightness: number;
  onYuvBrightnessChange: (n: number) => void;
  yuvGamma: number;
  onYuvGammaChange: (n: number) => void;
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
  handRescue: number;
  onHandRescueChange: (n: number) => void;
  onClose: () => void;
}) {
  // AI 추론 스로틀 간격(ms). 저장되는 촬영 설정이 아니라 미리보기 전용 값이라 다이얼로그가 들고 있는다.
  const [inferenceInterval, setInferenceInterval] = useState(DEFAULT_INFERENCE_INTERVAL_MS);

  // 카메라 캡처·실시간 키잉 루프 + 스포이드 — usePreviewCamera 참고.
  const { videoRef, canvasRef, status, errorMessage, eyedropper, setEyedropper, handleEyedrop } = usePreviewCamera({
    mode,
    chromaColor, onChromaColorChange,
    similarity, smoothness, spill, choke, lumaIndependent,
    yuvChromaColor, onYuvChromaColorChange,
    yuvSimilarity, yuvSmoothness, yuvSpill, yuvOpacity, yuvContrast, yuvBrightness, yuvGamma,
    threshold, feather, maskBlur, edgeShift, temporal, roi, roiMargin, processScale, handRescue,
    inferenceInterval,
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
      {/*
        2단 레이아웃 — 미리보기(왼쪽)는 제자리에 두고 값 목록(오른쪽)만 스크롤한다.
        슬라이더를 만지면서 결과를 봐야 하는데 한 줄로 쌓으면 스크롤할 때마다 미리보기가 화면 밖으로
        나가 버린다. 좁은 화면(lg 미만)에서는 2단이 오히려 답답해 세로로 쌓고 전체를 스크롤한다.
      */}
      <div
        className="bg-gray-800 rounded-xl border border-gray-700 max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 className="text-lg font-bold text-white">
            배경 제거 미리보기 ({mode === "mediapipe" ? "AI 배경 제거" : mode === "chromakey-yuv" ? "크로마키 (OBS 방식)" : "크로마키"})
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none" aria-label="닫기">
            &times;
          </button>
        </div>

        {/* min-h-0 — flex 자식이 내용 높이만큼 불어나 부모의 max-h를 넘기는 것을 막는다(스크롤 성립 조건). */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 px-6 pb-6 overflow-y-auto lg:overflow-hidden">
          <div className="lg:basis-[58%] lg:shrink-0 lg:self-start">
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} className="hidden" playsInline muted />
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
                style={{ cursor: eyedropper ? "crosshair" : "default" }}
                onClick={handleEyedrop}
              />

              {eyedropper && status === "ready" && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
                  화면을 클릭해 색 추출 · 해제: 스포이드 버튼 or Esc
                </div>
              )}

              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
                  {mode === "mediapipe" ? "AI 모델과 카메라를 여는 중..." : "카메라를 여는 중..."}
                </div>
              )}
              {status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center text-red-300 text-sm text-center px-6">
                  {errorMessage || "카메라를 사용할 수 없습니다."}
                </div>
              )}
            </div>

            <p className="text-gray-500 text-xs mt-3">
              체커보드 무늬로 보이는 부분이 실제로 제거되는 영역입니다. 값을 조절하면 바로 반영됩니다.
            </p>
          </div>

          <div className="lg:flex-1 lg:min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
            {mode === "chromakey" ? (
              <ChromaKeyControls
                chromaColor={chromaColor}
                onChromaColorChange={onChromaColorChange}
                similarity={similarity}
                onSimilarityChange={onSimilarityChange}
                smoothness={smoothness}
                onSmoothnessChange={onSmoothnessChange}
                spill={spill}
                onSpillChange={onSpillChange}
                choke={choke}
                onChokeChange={onChokeChange}
                lumaIndependent={lumaIndependent}
                onLumaIndependentChange={onLumaIndependentChange}
                eyedropper={eyedropper}
                setEyedropper={setEyedropper}
              />
            ) : mode === "chromakey-yuv" ? (
              <ChromaKeyYuvControls
                yuvChromaColor={yuvChromaColor}
                onYuvChromaColorChange={onYuvChromaColorChange}
                yuvSimilarity={yuvSimilarity}
                onYuvSimilarityChange={onYuvSimilarityChange}
                yuvSmoothness={yuvSmoothness}
                onYuvSmoothnessChange={onYuvSmoothnessChange}
                yuvSpill={yuvSpill}
                onYuvSpillChange={onYuvSpillChange}
                yuvOpacity={yuvOpacity}
                onYuvOpacityChange={onYuvOpacityChange}
                yuvContrast={yuvContrast}
                onYuvContrastChange={onYuvContrastChange}
                yuvBrightness={yuvBrightness}
                onYuvBrightnessChange={onYuvBrightnessChange}
                yuvGamma={yuvGamma}
                onYuvGammaChange={onYuvGammaChange}
                eyedropper={eyedropper}
                setEyedropper={setEyedropper}
              />
            ) : (
              <MediapipeControls
                threshold={threshold}
                onThresholdChange={onThresholdChange}
                feather={feather}
                onFeatherChange={onFeatherChange}
                maskBlur={maskBlur}
                onMaskBlurChange={onMaskBlurChange}
                edgeShift={edgeShift}
                onEdgeShiftChange={onEdgeShiftChange}
                temporal={temporal}
                onTemporalChange={onTemporalChange}
                roi={roi}
                onRoiChange={onRoiChange}
                roiMargin={roiMargin}
                onRoiMarginChange={onRoiMarginChange}
                processScale={processScale}
                onProcessScaleChange={onProcessScaleChange}
                handRescue={handRescue}
                onHandRescueChange={onHandRescueChange}
                inferenceInterval={inferenceInterval}
                onInferenceIntervalChange={setInferenceInterval}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
