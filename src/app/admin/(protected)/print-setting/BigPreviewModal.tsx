"use client";

import type { RefObject } from "react";

/** 인화 설정 페이지의 "크게 보기" 모달 — 큰 캔버스 + 용지 초과 경고. */
export function BigPreviewModal({
  previewMode,
  bigCanvasRef,
  overflow,
  onClose,
}: {
  previewMode: string | null;
  bigCanvasRef: RefObject<HTMLCanvasElement | null>;
  overflow: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">
            인화 미리보기 — {previewMode ?? "모드 없음"}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <div className="p-6 overflow-auto flex-1">
          <div className="bg-[#1a1a2e] rounded-xl overflow-hidden">
            <canvas
              ref={bigCanvasRef}
              width={1080}
              height={1080}
              className="w-full rounded-xl"
            />
          </div>
          {overflow && (
            <div className="mt-4 p-3 bg-red-900/40 border border-red-500/60 rounded-lg text-red-300 text-sm">
              ⚠ 현재 설정으로는 사진이 인화지를 벗어납니다. 사진 크기·간격·여백을 확인하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
