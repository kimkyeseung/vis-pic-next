"use client";

import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { BackgroundRemovalPreviewDialog } from "@/components/admin/BackgroundRemovalPreviewDialog";
import { parseIntSafe, clampPercent, clampSigned, parseSegmentProcessScale } from "@/lib/deviceConfig";
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

const FIELDS: { name: string; label: string; type?: "text" | "number" | "range" | "select" | "color"; options?: { value: string; label: string }[]; min?: number; max?: number; default?: number; hint?: string; showIf?: (settings: Record<string, string>) => boolean }[] = [
  { name: "CAPTURE_SECONDS", label: "카운트다운 (초)", type: "number", min: 1, max: 30, hint: "1~30초. 기본 3." },
  { name: "CAPTURE_COUNT_UNIFORM", label: "슬롯당 촬영 횟수", type: "number", min: 1, max: 10, hint: "각 슬롯당 촬영할 장수(1~10). 예: 2 → 4컷은 8장 촬영 후 4장 선택." },
  {
    name: "CAMERA_RESOLUTION",
    label: "카메라 화질(해상도)",
    type: "select",
    options: CAMERA_RESOLUTIONS.map((r) => ({ value: r.id, label: r.label })),
    hint: "촬영 카메라 해상도. 높을수록 화질이 좋지만, 실제 적용 해상도는 카메라·기기 성능에 따라 가장 가까운 값으로 조정됩니다. 기본 FHD.",
  },
  { name: "CHROMAKEY_MODE", label: "배경 제거 모드", type: "select", options: [{ value: "mediapipe", label: "AI 배경 제거 (기본)" }, { value: "chromakey", label: "크로마키 (그린스크린)" }, { value: "chromakey-yuv", label: "크로마키 (OBS 방식, 신규)" }, { value: "off", label: "비활성" }] },
  {
    name: "CHROMAKEY_RGB",
    label: "크로마키 색상",
    type: "color",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_SIMILARITY",
    label: "크로마키 감도",
    type: "range",
    min: 1,
    max: 100,
    default: 50,
    hint: "높일수록 키 색과 더 먼 색까지 제거됩니다. 기본값 50.",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_SMOOTHNESS",
    label: "크로마키 경계 부드러움",
    type: "range",
    min: 0,
    max: 100,
    default: 50,
    hint: "낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다. 기본값 50.",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_SPILL",
    label: "크로마키 스필 제거",
    type: "range",
    min: 0,
    max: 100,
    default: 0,
    hint: "인물 테두리에 남는 키 색 번짐(초록/파랑기)을 제거합니다. 높일수록 강하게 눌러냅니다. 기본값 0(끔).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey",
  },
  {
    name: "CHROMAKEY_CHOKE",
    label: "크로마키 경계 침식",
    type: "range",
    min: 0,
    max: 100,
    default: 0,
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
    name: "CHROMAKEY_YUV_RGB",
    label: "크로마키(OBS) 색상",
    type: "color",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CHROMAKEY_YUV_SIMILARITY",
    label: "크로마키(OBS) 감도",
    type: "range",
    min: 1,
    max: 100,
    default: 30,
    hint: "높일수록 키 색과 더 먼 색까지 제거됩니다. 기본값 30 — 65를 넘기면 피부·머리카락 같은 무채색 계열까지 지워집니다.",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CHROMAKEY_YUV_SMOOTHNESS",
    label: "크로마키(OBS) 경계 부드러움",
    type: "range",
    min: 0,
    max: 100,
    default: 10,
    hint: "낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다. 기본값 10 — 과하게 올리면 인물 전체가 반투명해집니다.",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CHROMAKEY_YUV_SPILL",
    label: "크로마키(OBS) 스필 제거",
    type: "range",
    min: 0,
    max: 100,
    default: 0,
    hint: "인물 테두리에 남는 키 색 번짐(초록/파랑기)을 제거합니다. 기본값 0(끔).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CHROMAKEY_YUV_OPACITY",
    label: "크로마키(OBS) 투명도",
    type: "range",
    min: 0,
    max: 100,
    default: 100,
    hint: "결과 전체의 투명도 배율입니다. 기본값 100(원본 그대로).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CHROMAKEY_YUV_CONTRAST",
    label: "크로마키(OBS) 대비",
    type: "range",
    min: -100,
    max: 100,
    default: 0,
    hint: "결과 화면의 대비를 보정합니다. 기본값 0(변화 없음).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CHROMAKEY_YUV_BRIGHTNESS",
    label: "크로마키(OBS) 명암",
    type: "range",
    min: -100,
    max: 100,
    default: 0,
    hint: "결과 화면의 밝기를 보정합니다. 기본값 0(변화 없음).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CHROMAKEY_YUV_GAMMA",
    label: "크로마키(OBS) 감마",
    type: "range",
    min: -100,
    max: 100,
    default: 0,
    hint: "결과 화면의 감마(중간톤)를 보정합니다. 기본값 0(변화 없음).",
    showIf: (s) => s.CHROMAKEY_MODE === "chromakey-yuv",
  },
  {
    name: "CAPTURE_THRESHOLD",
    label: "AI 경계 침식 (%)",
    type: "range",
    min: 0,
    max: 100,
    default: 15,
    hint: "확신도 기준. 높일수록 인물 가장자리를 안쪽으로 더 깎아냅니다. 낮추면 손끝이 살아나는 대신 배경 헤일로가 늘어납니다. 추천 10~15(기본 15). 손가락이 사라지면 여기부터 낮추세요 — 20을 넘기면 손끝이 먼저 잘려나갑니다.",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
  {
    name: "CAPTURE_SMOOTHNESS",
    label: "AI 경계 부드러움 (%)",
    type: "range",
    min: 1,
    max: 100,
    default: 35,
    hint: "반투명 전환대의 폭. 넓히면 고스팅이 늘고, 좁혀도 경계 계단은 없어지지 않습니다(계단은 아래 '경계 블러'로). 추천 35~45(기본 35).",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
  {
    name: "CAPTURE_MASK_BLUR",
    label: "AI 경계 블러 (%)",
    type: "range",
    min: 0,
    max: 200,
    default: 100,
    hint: "AI 모델의 256칸 격자에서 오는 경계 계단을 지웁니다. 0이면 끔, 과하면 실루엣이 뭉갭니다. 추천 80~120(기본 100).",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
  {
    name: "CAPTURE_EDGE_SHIFT",
    label: "AI 경계 두께",
    type: "range",
    min: -100,
    max: 100,
    default: 0,
    hint: "음수면 경계를 안쪽으로 깎아 배경 헤일로를 없애고, 양수면 바깥으로 살려 손끝을 남깁니다. '경계 침식'과 달리 확신도가 아니라 실제 거리 기준이라 손끝을 먹지 않습니다. 추천 −40~0(기본 0) — 침식을 낮춘 뒤 테두리가 지저분하면 여기를 음수로.",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
  {
    name: "CAPTURE_TEMPORAL",
    label: "AI 경계 떨림 억제 (%)",
    type: "range",
    min: 0,
    max: 100,
    default: 0,
    hint: "이전 마스크를 섞어 프레임마다 경계가 떠는 것을 줄입니다. 높이면 움직일 때 잔상이 생깁니다. 추천 0~40(기본 0). 60을 넘기면 손을 흔들 때 잔상이 눈에 띕니다.",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
  {
    name: "CAPTURE_ROI",
    label: "AI 인물 추적 크롭",
    type: "select",
    options: [{ value: "on", label: "켬 (기본) — 경계 해상도 향상" }, { value: "off", label: "끔 — 항상 화면 전체를 추론" }],
    hint: "인물 주변만 잘라 추론합니다. 모델 입력이 256×256 고정이라, 좁게 볼수록 경계 계단이 실제로 얇아집니다. 추천: 켬.",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
  {
    name: "CAPTURE_ROI_MARGIN",
    label: "AI 추적 여유 (%)",
    type: "range",
    min: 0,
    max: 100,
    default: 22,
    hint: "크롭을 인물보다 얼마나 넓게 잡을지. 좁힐수록 해상도 이득이 크고, 빠르게 움직일 때 놓칠 위험도 커집니다. 추천 15~30(기본 22).",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe" && (s.CAPTURE_ROI || "on") !== "off",
  },
  {
    name: "CAPTURE_HAND_RESCUE",
    label: "AI 손 구제 (%)",
    type: "range",
    min: 0,
    max: 100,
    default: 50,
    hint: "제스처 인식기가 찾아낸 손 주변에서만 전경 컷오프를 낮춰, 손끝이 통째로 사라지는 것을 막습니다. 손이 안 잡히면 아무 일도 하지 않습니다. 추천 40~70(기본 50). 100에 가까우면 손 주위 배경이 함께 딸려옵니다.",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
  {
    name: "CAPTURE_PROCESS_SCALE",
    label: "AI 처리 해상도",
    type: "select",
    options: [
      { value: "auto", label: "자동 (기본) — 4K에서만 25%" },
      { value: "100", label: "100% — 가장 정밀, 가장 느림" },
      { value: "50", label: "50%" },
      { value: "25", label: "25% — 가장 빠름" },
    ],
    hint: "배경제거를 돌리는 해상도(카메라 해상도 대비). 높일수록 마스크가 정밀하지만 프레임이 떨어질 수 있습니다. 추천: 자동. 경계가 거칠고 FPS에 여유가 있을 때만 올리세요.",
    showIf: (s) => (s.CHROMAKEY_MODE || "mediapipe") === "mediapipe",
  },
];

const FIELD_NAMES = FIELDS.map((f) => f.name);

/** min/max가 있는 숫자·슬라이더 칸 중 범위를 벗어난(또는 숫자가 아닌) 값의 라벨 목록. 빈 값은 기본값 사용이라 통과. */
function invalidFieldLabels(settings: Record<string, string>): string[] {
  return FIELDS.filter((f) => {
    if ((f.type !== "number" && f.type !== "range") || (f.min === undefined && f.max === undefined)) return false;
    const raw = (settings[f.name] ?? "").trim();
    if (raw === "") return false;
    const n = Number(raw);
    if (!Number.isInteger(n)) return true;
    return (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max);
  }).map((f) => `${f.label}(${f.min ?? ""}~${f.max ?? ""})`);
}

/**
 * 표시 판단용 설정 뷰 — 레거시 CHROMAKEY_MODE("0"/"1")를 셀렉트와 같은 값으로 정규화하고, 미설정이면
 * 기본 "mediapipe"로 채운다. 셀렉트만 정규화하고 showIf는 원값을 보면 "크로마키"로 표시되는데 세부 항목이 숨는다.
 */
function viewSettings(settings: Record<string, string>): Record<string, string> {
  return { ...settings, CHROMAKEY_MODE: normalizeSelectValue("CHROMAKEY_MODE", settings.CHROMAKEY_MODE) || "mediapipe" };
}

export default function CaptureSettingPage() {
  const { selectedDevice, settings, update: updateSetting, save, loading, saving, message } = useAdminDeviceSettings();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validationError, setValidationError] = useState("");
  const view = viewSettings(settings);
  const mode = view.CHROMAKEY_MODE;

  const handleSave = () => {
    const invalid = invalidFieldLabels(settings);
    if (invalid.length > 0) {
      setValidationError(`범위를 벗어난 값이 있어 저장하지 않았습니다: ${invalid.join(", ")}`);
      return;
    }
    setValidationError("");
    save(FIELD_NAMES);
  };

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

      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 py-6 space-y-4">
          {FIELDS.filter((field) => !field.showIf || field.showIf(view)).map((field) => (
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
                ) : field.type === "range" ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      value={settings[field.name] || String(field.default ?? field.min ?? 0)}
                      onChange={(e) => updateSetting(field.name, e.target.value)}
                      className="flex-1 accent-blue-500"
                    />
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={settings[field.name] || ""}
                      onChange={(e) => updateSetting(field.name, e.target.value)}
                      placeholder={String(field.default ?? "")}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm text-right focus:outline-none focus:border-blue-500"
                    />
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

          {mode !== "off" && (
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

      {validationError && (
        <div className="p-4 rounded-lg bg-red-900/50 border border-red-500 text-red-300">{validationError}</div>
      )}

      {message && (
        <div className={`p-4 rounded-lg ${message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-[#2a2a2a]">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>

      {previewOpen && (
        <BackgroundRemovalPreviewDialog
          mode={mode === "chromakey" || mode === "chromakey-yuv" ? mode : "mediapipe"}
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
          yuvChromaColor={parseRgbString(settings.CHROMAKEY_YUV_RGB || "0,255,0")}
          onYuvChromaColorChange={(rgb) => updateSetting("CHROMAKEY_YUV_RGB", rgb)}
          yuvSimilarity={clampPercent(parseIntSafe(settings.CHROMAKEY_YUV_SIMILARITY || "", 30), 1)}
          onYuvSimilarityChange={(n) => updateSetting("CHROMAKEY_YUV_SIMILARITY", String(n))}
          yuvSmoothness={clampPercent(parseIntSafe(settings.CHROMAKEY_YUV_SMOOTHNESS || "", 10))}
          onYuvSmoothnessChange={(n) => updateSetting("CHROMAKEY_YUV_SMOOTHNESS", String(n))}
          yuvSpill={clampPercent(parseIntSafe(settings.CHROMAKEY_YUV_SPILL || "", 0))}
          onYuvSpillChange={(n) => updateSetting("CHROMAKEY_YUV_SPILL", String(n))}
          yuvOpacity={clampPercent(parseIntSafe(settings.CHROMAKEY_YUV_OPACITY || "", 100))}
          onYuvOpacityChange={(n) => updateSetting("CHROMAKEY_YUV_OPACITY", String(n))}
          yuvContrast={clampSigned(parseIntSafe(settings.CHROMAKEY_YUV_CONTRAST || "", 0))}
          onYuvContrastChange={(n) => updateSetting("CHROMAKEY_YUV_CONTRAST", String(n))}
          yuvBrightness={clampSigned(parseIntSafe(settings.CHROMAKEY_YUV_BRIGHTNESS || "", 0))}
          onYuvBrightnessChange={(n) => updateSetting("CHROMAKEY_YUV_BRIGHTNESS", String(n))}
          yuvGamma={clampSigned(parseIntSafe(settings.CHROMAKEY_YUV_GAMMA || "", 0))}
          onYuvGammaChange={(n) => updateSetting("CHROMAKEY_YUV_GAMMA", String(n))}
          threshold={clampPercent(parseIntSafe(settings.CAPTURE_THRESHOLD || "", 15))}
          onThresholdChange={(n) => updateSetting("CAPTURE_THRESHOLD", String(n))}
          feather={clampPercent(parseIntSafe(settings.CAPTURE_SMOOTHNESS || "", 35), 1)}
          onFeatherChange={(n) => updateSetting("CAPTURE_SMOOTHNESS", String(n))}
          maskBlur={clampSigned(parseIntSafe(settings.CAPTURE_MASK_BLUR || "", 100), 0, 200)}
          onMaskBlurChange={(n) => updateSetting("CAPTURE_MASK_BLUR", String(n))}
          edgeShift={clampSigned(parseIntSafe(settings.CAPTURE_EDGE_SHIFT || "", 0))}
          onEdgeShiftChange={(n) => updateSetting("CAPTURE_EDGE_SHIFT", String(n))}
          temporal={clampPercent(parseIntSafe(settings.CAPTURE_TEMPORAL || "", 0))}
          onTemporalChange={(n) => updateSetting("CAPTURE_TEMPORAL", String(n))}
          roi={(settings.CAPTURE_ROI || "on") !== "off"}
          onRoiChange={(v) => updateSetting("CAPTURE_ROI", v ? "on" : "off")}
          roiMargin={clampPercent(parseIntSafe(settings.CAPTURE_ROI_MARGIN || "", 22))}
          onRoiMarginChange={(n) => updateSetting("CAPTURE_ROI_MARGIN", String(n))}
          processScale={parseSegmentProcessScale(settings.CAPTURE_PROCESS_SCALE || "")}
          onProcessScaleChange={(v) => updateSetting("CAPTURE_PROCESS_SCALE", v)}
          handRescue={clampPercent(parseIntSafe(settings.CAPTURE_HAND_RESCUE || "", 50))}
          onHandRescueChange={(n) => updateSetting("CAPTURE_HAND_RESCUE", String(n))}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
