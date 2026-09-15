"use client";

import type { FrameInfoEntry } from "@/types";
import { modeSettingPrefix } from "@/lib/printLayout";

/**
 * 인화 설정 페이지 좌측 2번 카드 — 등록된 촬영 모드 목록(선택·삭제), 커스텀 NxM 모드 추가,
 * 선택된 모드의 레이아웃(사진 크기·간격)·여백 설정 입력까지 한 카드에서 다룬다.
 */
export function ShootingModesCard({
  modes,
  effectiveModeInfo,
  previewMode,
  setPreviewMode,
  overflowModes,
  removeMode,
  customModeInput,
  updateCustomModeInput,
  customModeError,
  handleAddCustomMode,
  settings,
  setSettings,
}: {
  modes: string[];
  effectiveModeInfo: Record<string, FrameInfoEntry>;
  previewMode: string | null;
  setPreviewMode: (mode: string) => void;
  overflowModes: Set<string>;
  removeMode: (mode: string) => void;
  customModeInput: string;
  updateCustomModeInput: (v: string) => void;
  customModeError: string;
  handleAddCustomMode: () => void;
  settings: Record<string, string>;
  setSettings: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const inputClass = "w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm">2</span>
        촬영 모드
      </h3>

      {modes.length === 0 ? (
        <p className="text-gray-500 text-sm py-2">등록된 모드가 없습니다.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {modes.map((mode) => {
            const info = effectiveModeInfo[mode];
            const isSelected = previewMode === mode;
            return (
              <div
                key={mode}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-600/20 border-blue-500"
                    : "bg-gray-700/50 border-gray-600 hover:border-gray-500"
                }`}
                onClick={() => setPreviewMode(mode)}
              >
                <div
                  className="w-10 h-10 grid gap-0.5 p-1 bg-gray-800 rounded flex-shrink-0"
                  style={{
                    gridTemplateColumns: `repeat(${info.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${info.rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: info.count }).map((_, i) => (
                    <div key={i} className="bg-gray-500 rounded-sm" />
                  ))}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium">{mode}</span>
                  <span className="text-gray-400 text-sm">{info.label}</span>
                  <span className={`px-1.5 py-0.5 text-xs rounded ${
                    info.orientation === "landscape"
                      ? "bg-amber-600/30 text-amber-300"
                      : "bg-indigo-600/30 text-indigo-300"
                  }`}>
                    {info.orientation === "landscape" ? "가로 인쇄" : "세로 인쇄"}
                  </span>
                  {overflowModes.has(mode) && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-red-600/30 text-red-300 font-semibold">
                      ⚠ 범위 초과
                    </span>
                  )}
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); removeMode(mode); }}
                  className="px-3 py-1 bg-red-600/80 text-white text-sm rounded-lg hover:bg-red-500 transition-colors flex-shrink-0"
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500 mb-2">
          행×열 형식으로 입력 (예: <code className="text-gray-400">2x3</code> = 2행 3열, 6컷)
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customModeInput}
            onChange={(e) => updateCustomModeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomMode(); }}
            placeholder="예: 2x3, 4x1, 3x2"
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
          />
          <button
            onClick={handleAddCustomMode}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            + 추가
          </button>
        </div>
        {customModeError && (
          <p className="text-red-400 text-xs mt-1">{customModeError}</p>
        )}
      </div>

      {previewMode && (() => {
        const prefix = modeSettingPrefix(previewMode);
        return (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {previewMode} 레이아웃 설정 (cm)
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { suffix: "WIDTH", label: "사진 가로 크기" },
                { suffix: "HEIGHT", label: "사진 세로 크기 (4:3 자동)" },
                { suffix: "HGAP", label: "사진 간 가로 간격" },
                { suffix: "VGAP", label: "사진 간 세로 간격" },
              ].map(({ suffix, label }) => {
                const key = prefix + suffix;
                // 사진은 4:3 고정 — 가로를 바꾸면 세로(= 가로 × 3/4)를 함께 갱신하고,
                // 세로 입력은 비활성화해 비율이 항상 유지되게 한다.
                const isHeight = suffix === "HEIGHT";
                return (
                  <div key={suffix}>
                    <label className="block text-gray-500 text-xs mb-1">{label}</label>
                    <input
                      type="number"
                      value={settings[key] || ""}
                      onChange={(e) =>
                        setSettings((prev) =>
                          suffix === "WIDTH"
                            ? { ...prev, [key]: e.target.value, [prefix + "HEIGHT"]: heightFor43(e.target.value) }
                            : { ...prev, [key]: e.target.value },
                        )
                      }
                      placeholder="0"
                      step="0.1"
                      min="0"
                      disabled={isHeight}
                      className={inputClass}
                    />
                  </div>
                );
              })}
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-1">
              여백 설정
            </p>
            <p className="text-gray-500 text-xs mb-1">
              ※ 상단/하단 또는 좌측/우측 여백은 동시에 설정할 수 없습니다.
            </p>
            <p className="text-gray-500 text-xs mb-3">
              ※ 값을 비우면 자동 중앙 정렬됩니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { suffix: "MARGIN_TOP", label: "상단 여백", opposite: "MARGIN_BOTTOM" },
                { suffix: "MARGIN_BOTTOM", label: "하단 여백", opposite: "MARGIN_TOP" },
                { suffix: "MARGIN_LEFT", label: "좌측 여백", opposite: "MARGIN_RIGHT" },
                { suffix: "MARGIN_RIGHT", label: "우측 여백", opposite: "MARGIN_LEFT" },
              ].map(({ suffix, label, opposite }) => {
                const key = prefix + suffix;
                const disabled = (settings[prefix + opposite] ?? "").trim() !== "";
                return (
                  <div key={suffix}>
                    <label className="block text-gray-500 text-xs mb-1">{label}</label>
                    <input
                      type="number"
                      value={settings[key] || ""}
                      onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={disabled ? "반대쪽 여백 사용 중" : "자동 (중앙 정렬)"}
                      step="0.1"
                      min="0"
                      disabled={disabled}
                      className={inputClass}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/**
 * 사진은 4:3(가로:세로)이므로, 가로 크기(cm 문자열)로 세로 크기를 계산한다(세로 = 가로 × 3/4).
 * 값이 비었거나 유효하지 않으면 빈 문자열. 소수 둘째 자리에서 반올림.
 */
function heightFor43(wStr: string): string {
  const w = parseFloat(wStr);
  if (!Number.isFinite(w) || w <= 0) return "";
  return String(Math.round(w * 0.75 * 100) / 100);
}
