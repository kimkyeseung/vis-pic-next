"use client";

import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { BackgroundRemovalPreviewDialog } from "@/components/admin/BackgroundRemovalPreviewDialog";
import { parseIntSafe, clampPercent } from "@/lib/deviceConfig";
import { useAdminDeviceSettings } from "@/hooks/useAdminDeviceSettings";
import { CAMERA_RESOLUTIONS } from "@/constants/camera";

/** "R,G,B" 문자열 → "#rrggbb". 파싱 실패 시 기본 그린스크린 색상으로 대체. */
function rgbStringToHex(rgb: string): string {
  const parts = rgb.split(",").map((n) => parseInt(n.trim(), 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "#00ff00";
  return `#${parts.map((n) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0")).join("")}`;
}

/** "#rrggbb" → "R,G,B" 문자열 (기존 CHROMAKEY_RGB 저장 형식과 호환). */
function hexToRgbString(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "0,255,0";
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(",");
}

/** "R,G,B" 문자열 → {r,g,b} 숫자 객체. 파싱 실패 시 기본 그린스크린. */
function parseRgbString(rgb: string): { r: number; g: number; b: number } {
  const [r, g, b] = rgb.split(",").map((n) => parseInt(n.trim(), 10));
  return {
    r: Number.isNaN(r) ? 0 : r,
    g: Number.isNaN(g) ? 255 : g,
    b: Number.isNaN(b) ? 0 : b,
  };
}

// 레거시 CHROMAKEY_MODE 값("0"=off, "1"=chromakey)을 셀렉트 옵션 값으로 정규화해
// 저장된 실제 모드가 셀렉트에 올바로 표시되게 한다.
function normalizeSelectValue(name: string, val: string | undefined): string {
  if (name === "CHROMAKEY_MODE") {
    if (val === "0") return "off";
    if (val === "1") return "chromakey";
  }
  return val || "";
}

const FIELDS: { name: string; label: string; type?: "text" | "number" | "select" | "color"; options?: { value: string; label: string }[]; min?: number; max?: number; hint?: string; showIf?: (settings: Record<string, string>) => boolean }[] = [
  { name: "CAPTURE_SECONDS", label: "카운트다운 (초)", type: "number" },
  { name: "CAPTURE_COUNT_UNIFORM", label: "슬롯당 촬영 횟수", type: "number", hint: "각 슬롯당 촬영할 장수. 예: 2 → 4컷은 8장 촬영 후 4장 선택." },
  {
    name: "CAMERA_RESOLUTION",
    label: "카메라 화질(해상도)",
    type: "select",
    options: CAMERA_RESOLUTIONS.map((r) => ({ value: r.id, label: r.label })),
    hint: "촬영 카메라 해상도. 높을수록 화질이 좋지만, 실제 적용 해상도는 카메라·기기 성능에 따라 가장 가까운 값으로 조정됩니다. 기본 FHD.",
  },
  { name: "CHROMAKEY_MODE", label: "배경 제거 모드", type: "select", options: [{ value: "mediapipe", label: "AI 배경 제거 (기본)" }, { value: "chromakey", label: "크로마키 (그린스크린)" }, { value: "off", label: "비활성" }] },
  {
    name: "CHROMAKEY_RGB",
    label: "크로마키 색상",
    type: "color",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_SIMILARITY",
    label: "크로마키 감도",
    type: "number",
    min: 1,
    max: 100,
    hint: "높일수록 키 색과 더 먼 색까지 제거됩니다. 기본값 50.",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_SMOOTHNESS",
    label: "크로마키 경계 부드러움",
    type: "number",
    min: 0,
    max: 100,
    hint: "낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다. 기본값 50.",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_SPILL",
    label: "크로마키 스필 제거",
    type: "number",
    min: 0,
    max: 100,
    hint: "인물 테두리에 남는 키 색 번짐(초록/파랑기)을 제거합니다. 높일수록 강하게 눌러냅니다. 기본값 0(끔).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_CHOKE",
    label: "크로마키 경계 침식",
    type: "number",
    min: 0,
    max: 100,
    hint: "인물 마스크 경계를 안쪽으로 깎아 가장자리 초록/파랑 프린지를 제거합니다. 기본값 0(끔).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_LUMA",
    label: "밝기 무시 키잉",
    type: "select",
    options: [{ value: "off", label: "끔 (기본)" }, { value: "on", label: "켬 — 그늘/얼룩 보정" }],
    hint: "켜면 밝기 차이를 무시하고 색만 비교합니다. 그린스크린 조명이 불균일해 그늘/밝은 부분이 한 감도로 안 빠질 때 켜세요.",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CAPTURE_THRESHOLD",
    label: "AI 배경제거 경계 침식 (%)",
    type: "number",
    min: 0,
    max: 100,
    hint: "높일수록 인물 가장자리를 안쪽으로 더 깎아내 배경과의 경계가 또렷해집니다. 기본값 15.",
  },
  {
    name: "CAPTURE_SMOOTHNESS",
    label: "AI 배경제거 경계 부드러움 (%)",
    type: "number",
    min: 1,
    max: 100,
    hint: "낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다. 기본값 35.",
  },
];

const FIELD_NAMES = FIELDS.map((f) => f.name);

export default function CaptureSettingPage() {
  const { selectedDevice, settings, update: updateSetting, save, loading, saving, message } = useAdminDeviceSettings();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (loading) return <div className="text-gray-400">로딩중...</div>;
  if (!selectedDevice) return <div className="p-8 bg-gray-800 rounded-xl text-center text-gray-400">상단에서 지점을 선택하세요.</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">촬영 설정</h2>
          <p className="mt-1 text-sm text-gray-500">
            <span className="text-white font-medium">{selectedDevice.name}</span> 지점 설정입니다.
          </p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 py-6 space-y-4">
          {FIELDS.filter((field) => !field.showIf || field.showIf(settings)).map((field) => (
            <div key={field.name} className="grid grid-cols-[220px_1fr] gap-4 items-center">
              <label className="text-gray-400 text-sm truncate" title={field.name}>
                {field.label}
              </label>
              <div>
                {field.type === "select" && field.options ? (
                  <select
                    value={normalizeSelectValue(field.name, settings[field.name])}
                    onChange={(e) => updateSetting(field.name, e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">- 기본값 사용 -</option>
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : field.type === "color" ? (
                  <div className="relative">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setColorPickerOpen((v) => !v)}
                        className="w-10 h-10 rounded-lg border border-gray-600 shrink-0 cursor-pointer"
                        style={{ backgroundColor: `rgb(${settings[field.name] || "0,255,0"})` }}
                        aria-label="색상 선택"
                      />
                      <span className="text-gray-400 text-sm font-mono">
                        {settings[field.name] || "0,255,0"}
                      </span>
                    </div>

                    {colorPickerOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setColorPickerOpen(false)} />
                        <div className="absolute top-full left-0 mt-2 z-20 p-3 bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
                          <HexColorPicker
                            color={rgbStringToHex(settings[field.name] || "0,255,0")}
                            onChange={(hex) => updateSetting(field.name, hexToRgbString(hex))}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    min={field.min}
                    max={field.max}
                    value={settings[field.name] || ""}
                    onChange={(e) => updateSetting(field.name, e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="미설정 (기본값 사용)"
                  />
                )}
                {field.hint && <p className="text-gray-500 text-xs mt-1">{field.hint}</p>}
              </div>
            </div>
          ))}

          {(settings.CHROMAKEY_MODE || "mediapipe") !== "off" && (
            <div className="grid grid-cols-[220px_1fr] gap-4 items-center">
              <label className="text-gray-400 text-sm">배경 제거 미리보기</label>
              <div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white text-sm transition-colors"
                >
                  카메라로 미리보기
                </button>
                <p className="text-gray-500 text-xs mt-1">
                  카메라를 켜서 현재 설정으로 실시간 미리보기하고, 값을 바로 조정할 수 있습니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-[#2a2a2a]">
        <button
          onClick={() => save(FIELD_NAMES)}
          disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>

      {previewOpen && (
        <BackgroundRemovalPreviewDialog
          mode={(settings.CHROMAKEY_MODE || "mediapipe") === "chromakey" ? "chromakey" : "mediapipe"}
          chromaColor={parseRgbString(settings.CHROMAKEY_RGB || "0,255,0")}
          onChromaColorChange={(rgb) => updateSetting("CHROMAKEY_RGB", rgb)}
          similarity={clampPercent(parseIntSafe(settings.CHROMAKEY_SIMILARITY || "", 50), 1)}
          onSimilarityChange={(n) => updateSetting("CHROMAKEY_SIMILARITY", String(n))}
          smoothness={clampPercent(parseIntSafe(settings.CHROMAKEY_SMOOTHNESS || "", 50))}
          onSmoothnessChange={(n) => updateSetting("CHROMAKEY_SMOOTHNESS", String(n))}
          spill={clampPercent(parseIntSafe(settings.CHROMAKEY_SPILL || "", 0))}
          onSpillChange={(n) => updateSetting("CHROMAKEY_SPILL", String(n))}
          choke={clampPercent(parseIntSafe(settings.CHROMAKEY_CHOKE || "", 0))}
          onChokeChange={(n) => updateSetting("CHROMAKEY_CHOKE", String(n))}
          lumaIndependent={settings.CHROMAKEY_LUMA === "on"}
          onLumaIndependentChange={(v) => updateSetting("CHROMAKEY_LUMA", v ? "on" : "off")}
          threshold={clampPercent(parseIntSafe(settings.CAPTURE_THRESHOLD || "", 15))}
          onThresholdChange={(n) => updateSetting("CAPTURE_THRESHOLD", String(n))}
          feather={clampPercent(parseIntSafe(settings.CAPTURE_SMOOTHNESS || "", 35), 1)}
          onFeatherChange={(n) => updateSetting("CAPTURE_SMOOTHNESS", String(n))}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
