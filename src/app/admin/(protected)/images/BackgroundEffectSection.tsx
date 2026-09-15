"use client";

import {
  EFFECT_DURATION_RANGE,
  EFFECT_VIDEO_EXTENSIONS,
  EFFECT_TRIGGER_GESTURES,
  EFFECT_MODES,
  EFFECT_BLEND_MODES,
  EFFECT_TRANSITIONS,
  EFFECT_TRANSITION_MS_RANGE,
} from "@/constants/images";
import type { useBackgroundEffectForm } from "./useBackgroundEffectForm";

/** "R,G,B" → "#rrggbb" (color input 표시용). 형식이 어긋나면 초록. */
function rgbStringToHex(rgb: string): string {
  const parts = rgb.split(",").map((n) => parseInt(n.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return "#00ff00";
  return `#${parts.map((n) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0")).join("")}`;
}
/** "#rrggbb" → "R,G,B". 형식이 어긋나면 초록(0,255,0). */
function hexToRgbString(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "0,255,0";
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(",");
}

/**
 * 배경(type 1) 전용: 동작(V사인 등) 트리거 시 촬영 화면에 재생되는 이펙트 영상 업로드 +
 * 재생 방식(디졸브/트랜지션/크로마키)별 파라미터 입력. 상태·API 호출은 `useBackgroundEffectForm`이
 * 갖고 있고, 이 컴포넌트는 그 반환값을 그대로 props로 받아 그리기만 한다.
 */
export function BackgroundEffectSection({
  imageBaseUrl,
  effect,
}: {
  imageBaseUrl: string;
  effect: ReturnType<typeof useBackgroundEffectForm>;
}) {
  const {
    effectFilename,
    effectDuration, setEffectDuration,
    effectGesture, setEffectGesture,
    effectMode, setEffectMode,
    effectBlendMode, setEffectBlendMode,
    effectTransition, setEffectTransition,
    effectTransitionMs, setEffectTransitionMs,
    effectChromaColor, setEffectChromaColor,
    effectChromaSimilarity, setEffectChromaSimilarity,
    effectChromaSmoothness, setEffectChromaSmoothness,
    effectBusy, setShowPreview,
    effectInputRef,
    handleEffectUpload, handleEffectRemove,
  } = effect;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
      <label className="mb-1 block font-medium text-gray-200">동작 트리거 이펙트 영상</label>
      <p className="mb-3 text-sm text-gray-500">
        촬영 화면에서 지정한 <span className="text-gray-300">제스처</span>를 취하면
        아래 <span className="text-gray-300">재생 방식</span>에 따라 이 배경에 반영됩니다. ({EFFECT_VIDEO_EXTENSIONS.join(", ")})
      </p>

      {effectFilename ? (
        <div className="mb-3 flex items-center gap-3">
          <video
            src={`${imageBaseUrl}/${effectFilename}`}
            className="h-20 w-32 rounded-lg bg-black object-contain"
            muted
            loop
            autoPlay
            playsInline
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-gray-400">{effectFilename}</p>
            <button
              type="button"
              onClick={handleEffectRemove}
              disabled={effectBusy}
              className="mt-2 rounded bg-red-600/90 px-3 py-1 text-sm text-white hover:bg-red-500 disabled:opacity-50"
            >
              이펙트 제거
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-500">설정된 이펙트 영상이 없습니다.</p>
      )}

      <input
        ref={effectInputRef}
        type="file"
        accept={EFFECT_VIDEO_EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleEffectUpload(f);
        }}
        disabled={effectBusy}
        className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white hover:file:bg-blue-500 disabled:opacity-50"
      />
      {effectBusy && <p className="mt-2 text-sm text-blue-400">처리 중…</p>}

      <div className="mt-4">
        <label className="mb-1 block text-gray-300">트리거 제스처</label>
        <select
          value={effectGesture}
          onChange={(e) => setEffectGesture(e.target.value)}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
        >
          {EFFECT_TRIGGER_GESTURES.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        <p className="mt-1 text-sm text-gray-500">
          이 제스처를 취하면 영상이 재생됩니다. (손바닥은 촬영 트리거라 제외)
        </p>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-gray-300">재생 방식(모드)</label>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            disabled={!effectFilename}
            className="rounded-md bg-gray-700 px-3 py-1 text-sm text-blue-300 hover:bg-gray-600 disabled:opacity-40"
            title={effectFilename ? "선택한 재생 방식으로 미리보기" : "이펙트 영상을 먼저 업로드하세요"}
          >
            미리보기
          </button>
        </div>
        <select
          value={effectMode}
          onChange={(e) => setEffectMode(e.target.value)}
          className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
        >
          {EFFECT_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* 디졸브: 블렌드 방식 선택 */}
      {effectMode === "dissolve" && (
        <div className="mt-4">
          <label className="mb-1 block text-gray-300">블렌드 방식</label>
          <select
            value={effectBlendMode}
            onChange={(e) => setEffectBlendMode(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
          >
            {EFFECT_BLEND_MODES.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-500">
            영상을 배경 위·사람 뒤에 이 방식으로 블렌드해 재생합니다. (촬영본에도 반영)
          </p>
        </div>
      )}

      {/* 트랜지션: 전환 효과 + (페이드일 때) 전환 지속 시간 */}
      {effectMode === "transition" && (
        <>
          <div className="mt-4">
            <label className="mb-1 block text-gray-300">전환 효과</label>
            <select
              value={effectTransition}
              onChange={(e) => setEffectTransition(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            >
              {EFFECT_TRANSITIONS.map((tr) => (
                <option key={tr.value} value={tr.value}>{tr.label}</option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              제스처를 취하면 배경이 이 영상으로 전환되고, 다시 취하면 원래 배경으로 돌아옵니다.
            </p>
          </div>
          {effectTransition === "fade" && (
            <div className="mt-4">
              <label className="mb-1 block text-gray-300">전환 지속 시간(ms)</label>
              <input
                type="number"
                min={EFFECT_TRANSITION_MS_RANGE.min}
                max={EFFECT_TRANSITION_MS_RANGE.max}
                step={100}
                value={effectTransitionMs}
                onChange={(e) => setEffectTransitionMs(e.target.value)}
                className="w-32 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-sm text-gray-500">크로스페이드에 걸리는 시간. 0이면 즉시 전환됩니다.</p>
            </div>
          )}
        </>
      )}

      {/* 크로마키: 키 색상 + 감도 + 부드러움 */}
      {effectMode === "chromakey" && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-gray-300">키 색상</label>
            <input
              type="color"
              value={rgbStringToHex(effectChromaColor)}
              onChange={(e) => setEffectChromaColor(hexToRgbString(e.target.value))}
              className="h-9 w-16 cursor-pointer rounded border border-gray-600 bg-gray-700"
            />
            <span className="text-xs text-gray-400">{effectChromaColor}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-gray-300">감도 ({effectChromaSimilarity})</label>
            <input
              type="range" min={1} max={100}
              value={effectChromaSimilarity}
              onChange={(e) => setEffectChromaSimilarity(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-gray-300">경계 부드러움 ({effectChromaSmoothness})</label>
            <input
              type="range" min={0} max={100}
              value={effectChromaSmoothness}
              onChange={(e) => setEffectChromaSmoothness(Number(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </div>
          <p className="text-sm text-gray-500">
            영상에서 이 색을 제거하고 남은 부분만 배경 위·사람 뒤에 겹칩니다. (촬영본에도 반영)
          </p>
        </div>
      )}

      {/* 최대 재생 시간: 디졸브·크로마키(1회 재생)에만 적용. 트랜지션은 제스처 토글이라 제외. */}
      {effectMode !== "transition" && (
        <div className="mt-4">
          <label className="mb-1 block text-gray-300">최대 재생 시간(초)</label>
          <input
            type="number"
            min={EFFECT_DURATION_RANGE.min}
            max={EFFECT_DURATION_RANGE.max}
            value={effectDuration}
            onChange={(e) => setEffectDuration(e.target.value)}
            className="w-32 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-sm text-gray-500">
            이 시간이 지나면 재생을 멈춥니다. 영상이 더 짧으면 끝날 때 종료됩니다. (저장 시 반영)
          </p>
        </div>
      )}
    </div>
  );
}
