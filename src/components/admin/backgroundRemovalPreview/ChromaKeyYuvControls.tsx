"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { HexColorPicker } from "react-colorful";

function rgbStringToHex(rgb: string): string {
  const parts = rgb.split(",").map((n) => parseInt(n.trim(), 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "#00ff00";
  return `#${parts.map((n) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgbString(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "0,255,0";
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(",");
}

/** YUV 색차거리(OBS 방식) 크로마키(`chromakey-yuv` 모드)의 슬라이더 패널. */
export function ChromaKeyYuvControls({
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
  eyedropper,
  setEyedropper,
}: {
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
  eyedropper: boolean;
  setEyedropper: Dispatch<SetStateAction<boolean>>;
}) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">키 색상</label>
        <button
          type="button"
          onClick={() => setColorPickerOpen((v) => !v)}
          className="w-10 h-10 rounded-lg border border-gray-600 shrink-0 cursor-pointer"
          style={{ backgroundColor: `rgb(${yuvChromaColor.r},${yuvChromaColor.g},${yuvChromaColor.b})` }}
          aria-label="색상 선택"
        />
        <span className="text-gray-400 text-sm font-mono">
          {yuvChromaColor.r},{yuvChromaColor.g},{yuvChromaColor.b}
        </span>
        <button
          type="button"
          onClick={() => setEyedropper((v) => !v)}
          title="화면을 클릭해 색 추출"
          className={`ml-auto shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            eyedropper
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600"
          }`}
        >
          &#128167; 스포이드
        </button>

        {colorPickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setColorPickerOpen(false)} />
            <div className="absolute bottom-full left-0 mb-2 z-20 p-3 bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
              <HexColorPicker
                color={rgbStringToHex(`${yuvChromaColor.r},${yuvChromaColor.g},${yuvChromaColor.b}`)}
                onChange={(hex) => onYuvChromaColorChange(hexToRgbString(hex))}
              />
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">감도 ({yuvSimilarity})</label>
        <input
          type="range"
          min={1}
          max={100}
          value={yuvSimilarity}
          onChange={(e) => onYuvSimilarityChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">감도가 높을수록 키 색과 더 먼 색까지 제거됩니다.</p>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">경계 부드러움 ({yuvSmoothness})</label>
        <input
          type="range"
          min={0}
          max={100}
          value={yuvSmoothness}
          onChange={(e) => onYuvSmoothnessChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다.</p>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">스필 제거 ({yuvSpill})</label>
        <input
          type="range"
          min={0}
          max={100}
          value={yuvSpill}
          onChange={(e) => onYuvSpillChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">인물 테두리에 남는 키 색 번짐(초록/파랑기)을 눌러 제거합니다.</p>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">투명도 ({yuvOpacity})</label>
        <input
          type="range"
          min={0}
          max={100}
          value={yuvOpacity}
          onChange={(e) => onYuvOpacityChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">결과 전체의 투명도 배율입니다. 100이면 원본 그대로입니다.</p>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">대비 ({yuvContrast})</label>
        <input
          type="range"
          min={-100}
          max={100}
          value={yuvContrast}
          onChange={(e) => onYuvContrastChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">명암 ({yuvBrightness})</label>
        <input
          type="range"
          min={-100}
          max={100}
          value={yuvBrightness}
          onChange={(e) => onYuvBrightnessChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">감마 ({yuvGamma})</label>
        <input
          type="range"
          min={-100}
          max={100}
          value={yuvGamma}
          onChange={(e) => onYuvGammaChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">대비/명암/감마는 결과 화면 전체의 색감을 보정합니다. 0이면 변화 없음입니다.</p>
    </div>
  );
}
