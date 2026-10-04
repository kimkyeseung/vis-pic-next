"use client";

import { useEffect, useState } from "react";
import EffectPreviewDialog from "./EffectPreviewDialog";
import { BACKGROUND_IMAGE_TYPE, FRAME_IMAGE_TYPE, DEFAULT_EFFECT_DURATION } from "@/constants/images";
import { useImageEditForm } from "./useImageEditForm";
import { useBackgroundEffectForm } from "./useBackgroundEffectForm";
import { FrameFocalSection } from "./FrameFocalSection";
import { BackgroundEffectSection } from "./BackgroundEffectSection";

interface Image {
  id: number;
  name: string;
  filename: string;
  imageType: number;
  effectFilename?: string | null;
  effectDuration?: number | null;
  effectGesture?: string | null;
  effectMode?: string | null;
  effectBlendMode?: string | null;
  effectTransition?: string | null;
  effectTransitionMs?: number | null;
  effectChromaColor?: string | null;
  effectChromaSimilarity?: number | null;
  effectChromaSmoothness?: number | null;
  focalX?: number;
  focalY?: number;
}

interface EditDialogProps {
  image: Image;
  imageBaseUrl: string;
  onClose: () => void;
  onSaved: () => void;
}

const isVideo = (filename: string) =>
  filename.endsWith(".mp4") || filename.endsWith(".webm");

export default function EditDialog({
  image,
  imageBaseUrl,
  onClose,
  onSaved,
}: EditDialogProps) {
  const isFrame = image.imageType === FRAME_IMAGE_TYPE;
  const isBackground = image.imageType === BACKGROUND_IMAGE_TYPE;

  // 공통 폼(이름·타입) + 저장/삭제 — useImageEditForm 참고.
  const form = useImageEditForm(image, onSaved);

  // ── 프레임(인쇄 배경) 전용: 포컬(인화지 배치 기준점) ──
  const [focalX, setFocalX] = useState(typeof image.focalX === "number" ? image.focalX : 0.5);
  const [focalY, setFocalY] = useState(typeof image.focalY === "number" ? image.focalY : 0.5);

  // ── 배경 이펙트 영상(동작 트리거 시 재생) — useBackgroundEffectForm 참고. ──
  const effect = useBackgroundEffectForm(image);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 미리보기가 열려 있으면 Escape는 미리보기만 닫는다(EditDialog는 유지).
      if (e.key === "Escape" && !effect.showPreview) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, effect.showPreview]);

  const handleSave = () => form.handleSave({
    // 배경 이펙트 설정(재생시간·제스처·모드·모드별 파라미터). 배경일 때만 전송.
    ...(isBackground
      ? {
          effectDuration: parseInt(effect.effectDuration) || DEFAULT_EFFECT_DURATION,
          effectGesture: effect.effectGesture,
          effectMode: effect.effectMode,
          effectBlendMode: effect.effectBlendMode,
          effectTransition: effect.effectTransition,
          effectTransitionMs: parseInt(effect.effectTransitionMs) || 0,
          effectChromaColor: effect.effectChromaColor,
          effectChromaSimilarity: effect.effectChromaSimilarity,
          effectChromaSmoothness: effect.effectChromaSmoothness,
        }
      : {}),
    // 프레임 포컬(인화지 배치 기준점). 프레임일 때만 전송.
    ...(isFrame ? { focalX, focalY } : {}),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-700 p-5">
          <h3 className="text-lg font-bold text-white">이미지 편집</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="mx-auto h-32 overflow-hidden rounded-lg bg-gray-700">
            {isVideo(image.filename) ? (
              <video
                src={`${imageBaseUrl}/${image.filename}`}
                className="h-full w-full object-contain"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={`${imageBaseUrl}/${image.filename}`}
                alt={image.name}
                className="h-full w-full object-contain"
              />
            )}
          </div>
          <p className="truncate text-center text-xs text-gray-400">
            {image.filename}
          </p>

          <div>
            <label className="mb-2 block text-gray-300">이름</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => form.setName(e.target.value)}
              maxLength={32}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-gray-300">이미지 타입</label>
            <select
              value={form.imageType}
              onChange={(e) => form.setImageType(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="1">배경 (Background)</option>
              <option value="2">프레임 (Frame)</option>
              <option value="3">스티커 (Sticker)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              잘못된 탭에 올린 이미지를 여기서 옮길 수 있습니다.
            </p>
          </div>

          {isFrame && (
            <FrameFocalSection
              imageBaseUrl={imageBaseUrl}
              filename={image.filename}
              focalX={focalX}
              setFocalX={setFocalX}
              focalY={focalY}
              setFocalY={setFocalY}
            />
          )}

          {isBackground && (
            <BackgroundEffectSection imageBaseUrl={imageBaseUrl} effect={effect} />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-700 p-4">
          <div>
            {isFrame && (
              <button
                onClick={form.handleDelete}
                disabled={form.saving || form.deleting}
                className="rounded-lg bg-red-700/80 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
              >
                {form.deleting ? "삭제중…" : "이미지 삭제"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={form.saving || form.deleting}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={form.saving || form.deleting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {form.saving ? "저장중…" : "저장"}
            </button>
          </div>
        </div>
      </div>

      {/* 이펙트 미리보기 — 현재 선택된 재생 방식·파라미터로 배경 위에 합성해 보여준다(사람 생략). */}
      {effect.showPreview && effect.effectFilename && (
        <EffectPreviewDialog
          imageBaseUrl={imageBaseUrl}
          backgroundFilename={image.filename}
          effectFilename={effect.effectFilename}
          mode={effect.effectMode}
          blendMode={effect.effectBlendMode}
          transition={effect.effectTransition}
          transitionMs={parseInt(effect.effectTransitionMs) || 0}
          chromaColor={effect.effectChromaColor}
          chromaSimilarity={effect.effectChromaSimilarity}
          chromaSmoothness={effect.effectChromaSmoothness}
          durationMs={(parseInt(effect.effectDuration) || DEFAULT_EFFECT_DURATION) * 1000}
          onClose={() => effect.setShowPreview(false)}
        />
      )}
    </div>
  );
}
