"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_EFFECT_DURATION,
  DEFAULT_EFFECT_GESTURE,
  DEFAULT_EFFECT_MODE,
  DEFAULT_EFFECT_BLEND_MODE,
  DEFAULT_EFFECT_TRANSITION,
  DEFAULT_EFFECT_TRANSITION_MS,
  DEFAULT_EFFECT_CHROMA_COLOR,
  DEFAULT_EFFECT_CHROMA_SIMILARITY,
  DEFAULT_EFFECT_CHROMA_SMOOTHNESS,
} from "@/constants/images";

interface EffectImage {
  id: number;
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
}

/**
 * 배경(type 1) 이미지 전용 — 동작(제스처) 트리거 시 재생되는 이펙트 영상의 업로드/제거와
 * 재생 방식별 파라미터(제스처·모드·블렌드·트랜지션·크로마키) 상태를 담당한다. `EditDialog`는
 * 저장 시 이 훅의 값들을 PATCH 본문에 얹기만 하고, 실제 업로드·삭제 API 호출은 여기서 처리한다.
 */
export function useBackgroundEffectForm(image: EffectImage) {
  const [effectFilename, setEffectFilename] = useState<string | null>(image.effectFilename ?? null);
  const [effectDuration, setEffectDuration] = useState<string>(
    String(image.effectDuration ?? DEFAULT_EFFECT_DURATION)
  );
  const [effectGesture, setEffectGesture] = useState<string>(image.effectGesture || DEFAULT_EFFECT_GESTURE);
  const [effectMode, setEffectMode] = useState<string>(image.effectMode || DEFAULT_EFFECT_MODE);
  const [effectBlendMode, setEffectBlendMode] = useState<string>(image.effectBlendMode || DEFAULT_EFFECT_BLEND_MODE);
  const [effectTransition, setEffectTransition] = useState<string>(image.effectTransition || DEFAULT_EFFECT_TRANSITION);
  const [effectTransitionMs, setEffectTransitionMs] = useState<string>(
    String(image.effectTransitionMs ?? DEFAULT_EFFECT_TRANSITION_MS)
  );
  const [effectChromaColor, setEffectChromaColor] = useState<string>(image.effectChromaColor || DEFAULT_EFFECT_CHROMA_COLOR);
  const [effectChromaSimilarity, setEffectChromaSimilarity] = useState<number>(
    image.effectChromaSimilarity ?? DEFAULT_EFFECT_CHROMA_SIMILARITY
  );
  const [effectChromaSmoothness, setEffectChromaSmoothness] = useState<number>(
    image.effectChromaSmoothness ?? DEFAULT_EFFECT_CHROMA_SMOOTHNESS
  );
  const [effectBusy, setEffectBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const effectInputRef = useRef<HTMLInputElement>(null);

  const handleEffectUpload = async (file: File) => {
    setEffectBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("duration", effectDuration);
      const res = await fetch(`/api/admin/images/${image.id}/effect/`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.effectFilename) throw new Error(data.error || "upload failed");
      setEffectFilename(data.effectFilename);
    } catch (error) {
      console.error("Failed to upload effect video:", error);
      alert(error instanceof Error ? error.message : "이펙트 영상 업로드에 실패했습니다.");
    } finally {
      setEffectBusy(false);
      if (effectInputRef.current) effectInputRef.current.value = "";
    }
  };

  const handleEffectRemove = async () => {
    setEffectBusy(true);
    try {
      const res = await fetch(`/api/admin/images/${image.id}/effect/`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
      setEffectFilename(null);
    } catch (error) {
      console.error("Failed to remove effect video:", error);
      alert("이펙트 영상 제거에 실패했습니다.");
    } finally {
      setEffectBusy(false);
    }
  };

  // showPreview는 호출부(EditDialog)의 Escape 핸들러가 "미리보기가 열려 있으면 EditDialog는
  // 닫지 않는다" 가드로도 쓴다 — 실제 미리보기 닫기는 EffectPreviewDialog 자신의 Escape
  // 핸들러(별도 리스너)가 onClose로 처리하므로, 여기서 중복으로 리스너를 달지 않는다.
  return {
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
    effectBusy, showPreview, setShowPreview,
    effectInputRef,
    handleEffectUpload, handleEffectRemove,
  };
}
