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

/** 채널 우세도 방식 크로마키(`chromakey` 모드)의 슬라이더 패널. */
export function ChromaKeyControls({
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
  eyedropper,
  setEyedropper,
}: {
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
          style={{ backgroundColor: `rgb(${chromaColor.r},${chromaColor.g},${chromaColor.b})` }}
          aria-label="색상 선택"
        />
        <span className="text-gray-400 text-sm font-mono">
          {chromaColor.r},{chromaColor.g},{chromaColor.b}
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
                color={rgbStringToHex(`${chromaColor.r},${chromaColor.g},${chromaColor.b}`)}
                onChange={(hex) => onChromaColorChange(hexToRgbString(hex))}
              />
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">감도 ({similarity})</label>
        <input
          type="range"
          min={1}
          max={100}
          value={similarity}
          onChange={(e) => onSimilarityChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">감도가 높을수록 키 색과 더 먼 색까지 제거됩니다.</p>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">경계 부드러움 ({smoothness})</label>
        <input
          type="range"
          min={0}
          max={100}
          value={smoothness}
          onChange={(e) => onSmoothnessChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다.</p>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">스필 제거 ({spill})</label>
        <input
          type="range"
          min={0}
          max={100}
          value={spill}
          onChange={(e) => onSpillChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">인물 테두리에 남는 키 색 번짐(초록/파랑기)을 눌러 제거합니다.</p>
      <div className="flex items-center gap-3">
        <label className="text-gray-400 text-sm w-40 shrink-0">경계 침식 ({choke})</label>
        <input
          type="range"
          min={0}
          max={100}
          value={choke}
          onChange={(e) => onChokeChange(Number(e.target.value))}
          className="flex-1"
        />
      </div>
      <p className="text-gray-500 text-xs">인물 마스크 경계를 안쪽으로 깎아 가장자리 프린지를 제거합니다.</p>
      <label className="flex items-center gap-3 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={lumaIndependent}
          onChange={(e) => onLumaIndependentChange(e.target.checked)}
          className="h-4 w-4 accent-blue-500"
        />
        <span className="text-gray-400 text-sm">밝기 무시 키잉 (그늘/얼룩진 그린스크린 보정)</span>
      </label>
      <p className="text-gray-500 text-xs">밝기 차이를 무시하고 색만 비교합니다. 조명이 불균일해 그늘/밝은 부분이 한 감도로 안 빠질 때 켜세요.</p>
    </div>
  );
}
