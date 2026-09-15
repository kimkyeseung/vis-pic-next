"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BGImage, BgRemovalMode } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import {
  DEFAULT_EFFECT_GESTURE,
  DEFAULT_EFFECT_DURATION,
  DEFAULT_EFFECT_TRANSITION_MS,
  DEFAULT_EFFECT_CHROMA_COLOR,
  DEFAULT_EFFECT_CHROMA_SIMILARITY,
  DEFAULT_EFFECT_CHROMA_SMOOTHNESS,
  normalizeEffectMode,
  normalizeEffectBlendMode,
  normalizeEffectTransition,
} from "@/constants/images";
import { fillGradientFromCSS, drawCoverSource } from "@/lib/canvas";
import { applyChromaKey } from "@/lib/chromakey";

// 크로마키 이펙트 오버레이를 키잉하는 캔버스 해상도(4:3). 프레임마다 getImageData를 돌리므로
// 프리뷰 원해상도 대신 이 크기로 다운스케일해 부담을 줄이고, CSS로 프리뷰에 맞춰 늘린다.
const EFFECT_CHROMA_W = 640;
const EFFECT_CHROMA_H = 480;

// mode/blendMode/transition은 normalizeEffect*(constants/images.ts)가 검증한 값이지만 함수
// 시그니처 자체가 string을 반환해 여기서도 string으로 둔다(실제 허용값은 EFFECT_MODES 등 참고).
export type BgEffectInfo = {
  src: string;
  durationMs: number;
  gesture: string;
  mode: string;
  blendMode: string;
  transition: string;
  transitionMs: number;
  chromaRgb: [number, number, number];
  chromaSimilarity: number;
  chromaSmoothness: number;
};

/**
 * 선택된 배경 소스(이미지/동영상) 로딩 + 배경별 제스처 트리거 이펙트 영상(dissolve/transition/
 * chromakey) 오버레이를 담당한다. 레이어 순서는 항상 **배경 → 이펙트 → 사람** — `drawBackground`가
 * 배경(+transition 전환)을, `drawEffectLayer`가 그 위에 이펙트를 그린다(사람은 호출부가 더 위에 그림).
 *
 * `effectVisibleRef`/`backEffectRef`/`effectTimerRef`/`effectDurationRef`/`effectStartedAtRef`/
 * `stopEffect`를 외부로 노출하는 이유: `capturePhoto`(useCameraCapture)가 "촬영 카운트다운 중엔
 * 이펙트를 붙잡아 두었다가 남은 시간만큼만 이어 재생"하는 로직에서 이 내부 상태를 직접 다룬다 —
 * 두 훅이 이 지점에서만 의도적으로 결합되어 있다.
 */
export function useBackgroundCompositing({
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  bgRemovalMode,
  countdownRef,
}: {
  selectedBackground: number | null;
  backgroundImages: BGImage[];
  imageBaseUrl: string;
  bgRemovalMode: BgRemovalMode;
  countdownRef: React.RefObject<number | null>;
}): {
  currentBgEffect: BgEffectInfo | null;
  currentBgEffectRef: React.RefObject<BgEffectInfo | null>;
  effectGestureRef: React.RefObject<string>;
  onEffectTriggerRef: React.RefObject<() => void>;
  bgSourceRef: React.RefObject<HTMLImageElement | HTMLVideoElement | null>;
  backEffectRef: React.RefObject<HTMLVideoElement | null>;
  effectVisibleRef: React.RefObject<boolean>;
  effectAlphaRef: React.RefObject<number>;
  effectTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  effectDurationRef: React.RefObject<number>;
  effectStartedAtRef: React.RefObject<number>;
  stopEffect: () => void;
  drawBackground: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  drawEffectLayer: (ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) => void;
} {
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

  // 동작 트리거 이펙트 영상 — 현재 선택된 배경에 붙은 이펙트가 있으면 모드에 따라 반영.
  // 레이어 순서는 항상 배경 → 이펙트 → 사람(카메라). 즉 이펙트는 사람 뒤에서 합성된다.
  //  · dissolve  : 배경 위에 블렌드(globalCompositeOperation)로 1회 재생
  //  · chromakey : 키 색상을 제거한 프레임을 배경 위에 1회 재생
  //  · transition: 트리거 시 배경↔영상 토글(크로스페이드). 다시 트리거하면 원배경 복귀.
  const backEffectRef = useRef<HTMLVideoElement | null>(null);  // dissolve/chromakey 프레임 소스(명령형 <video>)
  const effectCanvasRef = useRef<HTMLCanvasElement | null>(null); // chromakey 키잉 결과(오프스크린)
  const effectBgVideoRef = useRef<HTMLVideoElement | null>(null); // transition 배경용 이펙트 영상(루프)
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectDurationRef = useRef(0);
  // 이펙트가 실제로 시작된 시각(performance.now()) — 촬영으로 붙잡아 두었다가 풀어줄 때
  // 남은 재생 시간(설정된 지속시간 - 경과 시간)을 계산해 원래 지속시간만큼만 재생되게 한다.
  const effectStartedAtRef = useRef(0);
  // 합성 루프(무-deps)가 최신 표시 상태를 읽도록 ref로 보관 + 페이드용 현재 알파(0~1).
  const effectVisibleRef = useRef(false);
  const effectAlphaRef = useRef(0);
  // transition 토글 상태: active=배경이 이펙트 영상으로 전환됨. startedAt=현재 전환 시작 시각(크로스페이드 진행 계산).
  const transitionActiveRef = useRef(false);
  const transitionStartRef = useRef(0);
  const [effectVisible, setEffectVisible] = useState(false);
  useEffect(() => { effectVisibleRef.current = effectVisible; }, [effectVisible]);
  const currentBgEffect = useMemo((): BgEffectInfo | null => {
    if (selectedBackground === null || selectedBackground <= 0) return null;
    const bg = backgroundImages.find((b) => b.id === selectedBackground);
    if (!bg?.effectFilename) return null;
    const [r, g, b] = (bg.effectChromaColor || DEFAULT_EFFECT_CHROMA_COLOR).split(",").map(Number);
    return {
      src: `${imageBaseUrl}/${bg.effectFilename}`,
      durationMs: (bg.effectDuration ?? DEFAULT_EFFECT_DURATION) * 1000,
      gesture: bg.effectGesture || DEFAULT_EFFECT_GESTURE,
      mode: normalizeEffectMode(bg.effectMode),
      blendMode: normalizeEffectBlendMode(bg.effectBlendMode),
      transition: normalizeEffectTransition(bg.effectTransition),
      transitionMs: bg.effectTransitionMs ?? DEFAULT_EFFECT_TRANSITION_MS,
      chromaRgb: [r ?? 0, g ?? 255, b ?? 0] as [number, number, number],
      chromaSimilarity: bg.effectChromaSimilarity ?? DEFAULT_EFFECT_CHROMA_SIMILARITY,
      chromaSmoothness: bg.effectChromaSmoothness ?? DEFAULT_EFFECT_CHROMA_SMOOTHNESS,
    };
  }, [selectedBackground, backgroundImages, imageBaseUrl]);
  useEffect(() => { effectDurationRef.current = currentBgEffect?.durationMs ?? 0; }, [currentBgEffect]);
  // 감지/그리기 루프(무-deps)가 최신 값을 읽도록 ref로 보관.
  const effectGestureRef = useRef<string>(DEFAULT_EFFECT_GESTURE);
  useEffect(() => { effectGestureRef.current = currentBgEffect?.gesture ?? DEFAULT_EFFECT_GESTURE; }, [currentBgEffect]);
  const currentBgEffectRef = useRef(currentBgEffect);
  useEffect(() => { currentBgEffectRef.current = currentBgEffect; }, [currentBgEffect]);

  // chromakey 오버레이: 이펙트 영상 프레임을 캔버스에 그리고 키 색상을 제거한다(메인 크로마키와 동일 파생 규칙).
  // 프레임 1장만 그리며, 반복은 아래 effectVisible 기반 useEffect 루프가 담당한다(자기참조 rAF 회피).
  const drawChromaOnce = useCallback(() => {
    const v = backEffectRef.current;
    const info = currentBgEffectRef.current;
    if (!v || !info || v.readyState < 2 || !v.videoWidth) return;
    let c = effectCanvasRef.current;
    if (!c) { c = document.createElement("canvas"); effectCanvasRef.current = c; }
    if (c.width !== EFFECT_CHROMA_W) c.width = EFFECT_CHROMA_W;
    if (c.height !== EFFECT_CHROMA_H) c.height = EFFECT_CHROMA_H;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx || !drawCoverSource(cx, v, EFFECT_CHROMA_W, EFFECT_CHROMA_H)) return;
    const img = cx.getImageData(0, 0, EFFECT_CHROMA_W, EFFECT_CHROMA_H);
    const [kr, kg, kb] = info.chromaRgb;
    applyChromaKey(img.data, EFFECT_CHROMA_W, EFFECT_CHROMA_H, { r: kr, g: kg, b: kb }, info.chromaSimilarity, info.chromaSmoothness);
    cx.putImageData(img, 0, 0);
  }, []);

  // chromakey 이펙트가 보이는 동안에만 키잉 프레임을 매 프레임 갱신한다.
  useEffect(() => {
    if (!effectVisible || currentBgEffect?.mode !== "chromakey") return;
    let raf = 0;
    const loop = () => { drawChromaOnce(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [effectVisible, currentBgEffect, drawChromaOnce]);

  const stopEffect = useCallback(() => {
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    // 재생만 멈추고 현재 프레임/키잉 결과는 남겨 둔다 — 합성 루프의 알파 페이드아웃이 자연스럽게 사라지게 한다.
    backEffectRef.current?.pause();
    setEffectVisible(false);
  }, []);

  // dissolve/chromakey 1회 재생: 처음부터 재생 + 오버레이 표시. 지정 시간 경과 또는 영상 종료(onEnded) 시 정지.
  const playEffect = useCallback(() => {
    const v = backEffectRef.current;
    const durationMs = effectDurationRef.current;
    if (!v || durationMs <= 0) return;
    // 이미 재생 중(화면에 보이는 상태)이면 재트리거는 무시한다. currentTime을 0으로 되감으면
    // 방금까지 꽉 차 보이던 이펙트가 빈 시작 프레임으로 리셋돼, 그 직후 촬영하면 사진에
    // 효과가 안 담긴 것처럼 보이는 문제가 있었다(재생 중엔 그대로 두고 흘러가게 둔다).
    if (effectVisibleRef.current) return;
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    setEffectVisible(true);
    effectStartedAtRef.current = performance.now();
    try { v.currentTime = 0; } catch {}
    // 카운트다운 중 재트리거면 duration 타이머·onEnded로 중간에 꺼지지 않게 loop로 유지한다.
    // (capturePhoto가 스냅샷 후 loop 해제·정리 — 재발동 시에도 사진에 이펙트가 담기도록.)
    const holding = countdownRef.current !== null;
    v.loop = holding;
    const p = v.play();
    if (p) p.catch(() => {});
    if (!holding) effectTimerRef.current = setTimeout(stopEffect, durationMs);
  }, [stopEffect, countdownRef]);

  // 트리거 발동 시 모드별 분기: transition은 배경 토글, 그 외는 오버레이 1회 재생.
  const onEffectTrigger = useCallback(() => {
    const info = currentBgEffectRef.current;
    if (!info) return;
    if (info.mode === "transition") {
      transitionActiveRef.current = !transitionActiveRef.current;
      transitionStartRef.current = performance.now();
    } else {
      playEffect();
    }
  }, [playEffect]);

  // 제스처 감지 루프가 최신 트리거 핸들러를 참조하도록 유지 (루프 재생성 없이)
  const onEffectTriggerRef = useRef<() => void>(() => {});
  useEffect(() => { onEffectTriggerRef.current = onEffectTrigger; }, [onEffectTrigger]);

  // 선택된 배경(이미지/동영상) 소스를 로드한다.
  useEffect(() => {
    bgSourceRef.current = null;
    if (bgRemovalMode === "off") return;
    if (selectedBackground === null || selectedBackground <= 0) return;
    const bgInfo = backgroundImages.find((b) => b.id === selectedBackground);
    if (!bgInfo) return;

    const url = `${imageBaseUrl}/${bgInfo.filename}`;
    const isVideo = bgInfo.filename.endsWith(".mp4") || bgInfo.filename.endsWith(".webm");

    if (isVideo) {
      const vid = document.createElement("video");
      vid.crossOrigin = "anonymous";
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.src = url;
      // play() 실패(소스 미지원 등) 시 unhandled rejection 방지
      vid.play().catch(() => {});
      bgSourceRef.current = vid;
      return () => { vid.pause(); vid.src = ""; };
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { bgSourceRef.current = img; };
      img.src = url;
    }
  }, [selectedBackground, backgroundImages, imageBaseUrl, bgRemovalMode]);

  // transition 모드일 때 배경으로 쓸 이펙트 영상을 루프 재생으로 준비한다.
  useEffect(() => {
    effectBgVideoRef.current = null;
    transitionActiveRef.current = false;
    const info = currentBgEffect;
    if (!info || info.mode !== "transition") return;
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.src = info.src;
    vid.play().catch(() => {});
    effectBgVideoRef.current = vid;
    return () => { vid.pause(); vid.src = ""; effectBgVideoRef.current = null; };
  }, [currentBgEffect]);

  // dissolve/chromakey 프레임 소스 영상을 명령형으로 생성한다. 크로마키는 drawChromaOnce가
  // getImageData로 픽셀을 읽고, dissolve는 표시 캔버스에 그려져 toDataURL 캡처에 들어가므로,
  // 교차 출처(Supabase) 영상은 crossOrigin을 src보다 먼저 지정해 CORS 모드로 로드해야 캔버스
  // 오염(SecurityError) 없이 키잉·캡처가 된다. (JSX <video src crossOrigin>은 속성 적용 순서가
  // 보장되지 않아 no-cors로 로드→오염될 수 있어 명령형으로 만든다.)
  useEffect(() => {
    backEffectRef.current = null;
    const info = currentBgEffect;
    if (!info || (info.mode !== "dissolve" && info.mode !== "chromakey")) return;
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = info.src;
    v.addEventListener("ended", stopEffect);
    backEffectRef.current = v;
    return () => {
      v.removeEventListener("ended", stopEffect);
      v.pause();
      v.src = "";
      backEffectRef.current = null;
    };
  }, [currentBgEffect, stopEffect]);

  // 배경/모드가 바뀌면 재생 중이던 이펙트와 전환 상태를 정리한다. 프레임 소스 <video>는 위 effect가
  // src/모드 변경 시 새로 만들며 재생이 멈추므로, 여기서는 타이머/토글만 정리하고 표시 상태 리셋은
  // 콜백으로 미룬다(effect 본문 동기 setState 회피).
  useEffect(() => {
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    transitionActiveRef.current = false;
    const t = setTimeout(() => setEffectVisible(false), 0);
    return () => clearTimeout(t);
  }, [currentBgEffect?.src, currentBgEffect?.mode]);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const src = bgSourceRef.current;
    const info = currentBgEffectRef.current;
    const eff = effectBgVideoRef.current;

    // transition 모드: 원배경(src)과 이펙트 영상(eff)을 토글 전환. 진행 중이면 크로스페이드.
    if (info && info.mode === "transition" && eff && src) {
      const active = transitionActiveRef.current;
      const toSource: CanvasImageSource = active ? eff : src;
      const fromSource: CanvasImageSource = active ? src : eff;
      const dur = info.transition === "cut" ? 0 : info.transitionMs;
      const progress = dur <= 0 ? 1 : Math.max(0, Math.min(1, (performance.now() - transitionStartRef.current) / dur));
      if (progress >= 1) {
        if (!drawCoverSource(ctx, toSource, w, h)) drawCoverSource(ctx, fromSource, w, h);
      } else {
        drawCoverSource(ctx, fromSource, w, h);
        ctx.save();
        ctx.globalAlpha = progress;
        drawCoverSource(ctx, toSource, w, h);
        ctx.restore();
      }
      return;
    }

    // 일반: 선택된 배경(이미지/동영상)을 cover로 그린다.
    if (src) {
      if (!drawCoverSource(ctx, src, w, h)) ctx.drawImage(src, 0, 0, w, h);
    } else if (selectedBackground !== null && selectedBackground < 0) {
      const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === selectedBackground);
      if (fb) fillGradientFromCSS(ctx, w, h, fb.gradient);
      else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, w, h); }
    } else {
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, w, h);
    }
  }, [selectedBackground]);

  // 이펙트 레이어(배경 위·사람 아래)를 주어진 알파로 그린다. 알파 이징(진행)은 호출부(프리뷰 루프)가
  // 담당하고, 이 함수는 그리기만 한다 — 프리뷰 루프와 고해상도 캡처가 함께 재사용한다.
  const drawEffectLayer = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) => {
    const info = currentBgEffectRef.current;
    if (!info || alpha < 0.01) return;
    if (info.mode === "dissolve") {
      const v = backEffectRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      // "normal"은 캔버스 합성 연산 "source-over"에 대응. 그 외(screen/lighten/…)는 그대로 유효.
      const op = info.blendMode === "normal" ? "source-over" : info.blendMode;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = op as GlobalCompositeOperation;
      drawCoverSource(ctx, v, w, h);
      ctx.restore();
    } else if (info.mode === "chromakey") {
      const ec = effectCanvasRef.current;
      if (!ec) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawCoverSource(ctx, ec, w, h);
      ctx.restore();
    }
  }, []);

  return {
    currentBgEffect,
    currentBgEffectRef,
    effectGestureRef,
    onEffectTriggerRef,
    bgSourceRef,
    backEffectRef,
    effectVisibleRef,
    effectAlphaRef,
    effectTimerRef,
    effectDurationRef,
    effectStartedAtRef,
    stopEffect,
    drawBackground,
    drawEffectLayer,
  };
}
