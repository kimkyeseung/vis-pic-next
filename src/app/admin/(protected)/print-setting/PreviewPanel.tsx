"use client";

import type { RefObject } from "react";
import type { FrameInfoEntry } from "@/types";
import type { PrintLayout } from "@/lib/printLayout";

/** 인화 설정 페이지 우측 미리보기 카드 — 작은 캔버스, 인화지/배치 정보 요약, 모드 전환 버튼. */
export function PreviewPanel({
  canvasRef,
  onOpenBigPreview,
  previewLayout,
  paperDimensions,
  previewMode,
  effectiveModeInfo,
  printBgCount,
  modes,
  setPreviewMode,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onOpenBigPreview: () => void;
  previewLayout: PrintLayout | null;
  paperDimensions: { pw: number; ph: number };
  previewMode: string | null;
  effectiveModeInfo: Record<string, FrameInfoEntry>;
  printBgCount: number;
  modes: string[];
  setPreviewMode: (mode: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 sticky top-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">인화 미리보기</h3>
          <button
            onClick={onOpenBigPreview}
            title="크게 보기"
            className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <canvas
            ref={canvasRef}
            width={360}
            height={360}
            className="w-full rounded"
          />
        </div>

        {previewLayout?.overflow && (
          <div className="mt-3 p-3 bg-red-900/40 border border-red-500/60 rounded-lg text-red-300 text-sm">
            ⚠ 현재 설정으로는 사진이 인화지를 벗어납니다. 사진 크기·간격·여백을 확인하세요.
          </div>
        )}

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>배치</span>
            <span className="text-white">
              {previewLayout?.fromSettings ? "설정값 기반" : "자동 (설정 없음)"}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>인화지</span>
            <span className="text-white">
              {paperDimensions.pw}cm x {paperDimensions.ph}cm
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>인쇄 방향</span>
            <span className="text-white">
              {previewMode && effectiveModeInfo[previewMode]
                ? effectiveModeInfo[previewMode].orientation === "landscape" ? "가로" : "세로"
                : "-"}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>선택 모드</span>
            <span className="text-white">
              {previewMode ? `${previewMode} (${effectiveModeInfo[previewMode]?.label})` : "없음"}
            </span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>인쇄 배경</span>
            <span className="text-white">
              {printBgCount > 0 ? `${printBgCount}장 등록됨` : "없음"}
            </span>
          </div>
        </div>

        {modes.length > 1 && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <span className="text-gray-500 text-xs block mb-2">모드 전환</span>
            <div className="flex flex-wrap gap-1">
              {modes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    previewMode === mode
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-400 hover:text-white"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
