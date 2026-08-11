"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { drawCoverSource } from "@/lib/canvas";

// 미리보기 합성 캔버스 내부 해상도(4:3). CSS로 다이얼로그 크기에 맞춰 늘린다.
const PREVIEW_W = 800;
const PREVIEW_H = 600;
// 크로마키 키잉용 오프스크린 해상도(촬영 화면과 동일한 절충값).
const KEY_W = 640;
const KEY_H = 480;

const isVideoFile = (filename: string) =>
  filename.endsWith(".mp4") || filename.endsWith(".webm");

interface EffectPreviewDialogProps {
  imageBaseUrl: string;
  backgroundFilename: string;
  effectFilename: string;
  mode: string;
  blendMode: string;
  transition: string;
  transitionMs: number;
  chromaColor: string;
  chromaSimilarity: number;
  chromaSmoothness: number;
  durationMs: number;
  onClose: () => void;
}

/**
 * 배경 이펙트의 재생 방식(dissolve/chromakey/transition)을 촬영 화면과 동일한 합성 규칙으로
 * 미리 보여준다. 카메라(사람)는 생략하고 "배경 → 이펙트"만 그린다.
 *  · dissolve/chromakey : 트리거 시 durationMs 동안 1회 재생(페이드 인/아웃).
 *  · transition        : 트리거 시 배경↔영상 토글(cut/크로스페이드), 다시 트리거하면 복귀.
 */
export default function EffectPreviewDialog({
  imageBaseUrl,
  backgroundFilename,
  effectFilename,
  mode,
  blendMode,
  transition,
  transitionMs,
  chromaColor,
  chromaSimilarity,
  chromaSmoothness,
  durationMs,
  onClose,
}: EffectPreviewDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 배경·이펙트 소스는 JSX가 아니라 명령형으로 생성한다 — 크로마키의 getImageData가
  // 캔버스를 읽으므로, 교차 출처(Supabase Storage) 리소스는 crossOrigin을 src보다 먼저
  // 설정해 CORS 모드로 로드해야 한다. JSX <video src crossOrigin>는 속성 적용 순서가
  // 보장되지 않아 no-cors로 로드→캔버스 오염→getImageData 예외가 날 수 있다.
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const effectVideoRef = useRef<HTMLVideoElement | null>(null);
  const keyCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 합성 루프(무-deps)가 최신 상태를 읽도록 ref로 유지.
  const effectVisibleRef = useRef(false);
  const alphaRef = useRef(0);
  const transitionActiveRef = useRef(false);
  const transitionStartRef = useRef(0);
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false); // dissolve/chromakey 재생 중 표시
  const [transitioned, setTransitioned] = useState(false); // transition 토글 상태 표시

  const bgIsVideo = isVideoFile(backgroundFilename);

  const stop = useCallback(() => {
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    effectVisibleRef.current = false;
    setPlaying(false);
  }, []);

  // 트리거 발동 — 촬영 화면의 제스처 트리거와 동일한 분기.
  const trigger = useCallback(() => {
    if (mode === "transition") {
      transitionActiveRef.current = !transitionActiveRef.current;
      transitionStartRef.current = performance.now();
      setTransitioned(transitionActiveRef.current);
      return;
    }
    const v = effectVideoRef.current;
    if (!v) return;
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    effectVisibleRef.current = true;
    setPlaying(true);
    try { v.currentTime = 0; } catch {}
    v.play().catch(() => {});
    if (durationMs > 0) effectTimerRef.current = setTimeout(stop, durationMs);
  }, [mode, durationMs, stop]);

  // 배경 소스(이미지/영상)를 명령형으로 로드 — crossOrigin을 src보다 먼저 설정한다.
  useEffect(() => {
    bgSourceRef.current = null;
    const url = `${imageBaseUrl}/${backgroundFilename}`;
    if (bgIsVideo) {
      const vid = document.createElement("video");
      vid.crossOrigin = "anonymous";
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.src = url;
      vid.play().catch(() => {});
      bgSourceRef.current = vid;
      return () => { vid.pause(); vid.src = ""; bgSourceRef.current = null; };
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { bgSourceRef.current = img; };
    img.src = url;
    return () => { bgSourceRef.current = null; };
  }, [imageBaseUrl, backgroundFilename, bgIsVideo]);

  // 이펙트 영상을 명령형으로 로드 — 크로마키 getImageData가 오염 없이 읽도록 CORS 모드로 로드.
  // transition은 배경으로 계속 쓰이므로 루프 재생, dissolve/chromakey는 트리거 시 1회 재생.
  useEffect(() => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = `${imageBaseUrl}/${effectFilename}`;
    const onEnded = () => { if (mode !== "transition") stop(); };
    v.addEventListener("ended", onEnded);
    if (mode === "transition") { v.loop = true; v.play().catch(() => {}); }
    effectVideoRef.current = v;
    return () => {
      v.removeEventListener("ended", onEnded);
      v.pause();
      v.src = "";
      effectVideoRef.current = null;
    };
  }, [imageBaseUrl, effectFilename, mode, stop]);

  // 키잉된 이펙트 프레임 1장을 오프스크린에 만든다(촬영 화면 drawChromaOnce와 동일 규칙).
  const drawChromaKeyed = useCallback((): HTMLCanvasElement | null => {
    const v = effectVideoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    let c = keyCanvasRef.current;
    if (!c) { c = document.createElement("canvas"); keyCanvasRef.current = c; }
    if (c.width !== KEY_W) c.width = KEY_W;
    if (c.height !== KEY_H) c.height = KEY_H;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx || !drawCoverSource(cx, v, KEY_W, KEY_H)) return null;
    const [kr, kg, kb] = chromaColor.split(",").map((n) => parseInt(n.trim(), 10) || 0);
    const simDist = Math.max(1, chromaSimilarity);
    const softDist = simDist * (1 + Math.max(0, chromaSmoothness) / 50);
    const softBand = Math.max(1e-6, softDist - simDist);
    const HARD = simDist * simDist;
    const SOFT = softDist * softDist;
    let img: ImageData;
    try { img = cx.getImageData(0, 0, KEY_W, KEY_H); } catch { return null; }
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr;
      const dg = d[i + 1] - kg;
      const db = d[i + 2] - kb;
      const distSq = dr * dr + dg * dg + db * db;
      if (distSq < HARD) d[i + 3] = 0;
      else if (distSq < SOFT) d[i + 3] = Math.round(((Math.sqrt(distSq) - simDist) / softBand) * 255);
    }
    cx.putImageData(img, 0, 0);
    return c;
  }, [chromaColor, chromaSimilarity, chromaSmoothness]);

  // 합성 루프. 촬영 화면과 동일하게 "배경 → 이펙트" 순으로 그린다(사람 생략).
  useEffect(() => {
    let raf = 0;
    const w = PREVIEW_W;
    const h = PREVIEW_H;
    const render = () => {
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bgSource = bgSourceRef.current;
      const effVideo = effectVideoRef.current;

      // ── 배경 (transition은 여기서 배경 자체를 토글) ──
      if (mode === "transition" && effVideo && effVideo.readyState >= 2 && bgSource) {
        const active = transitionActiveRef.current;
        const toSource = active ? effVideo : bgSource;
        const fromSource = active ? bgSource : effVideo;
        const dur = transition === "cut" ? 0 : transitionMs;
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
      } else if (bgSource && drawCoverSource(ctx, bgSource, w, h)) {
        // 그려짐
      } else {
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, w, h);
      }

      // ── 이펙트 레이어 (dissolve/chromakey만) ──
      const target = mode !== "transition" && effectVisibleRef.current ? 1 : 0;
      alphaRef.current += (target - alphaRef.current) * 0.18; // ~250ms 이징
      const alpha = alphaRef.current;
      if (alpha >= 0.01) {
        if (mode === "dissolve" && effVideo && effVideo.readyState >= 2 && effVideo.videoWidth) {
          const op = blendMode === "normal" ? "source-over" : blendMode;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.globalCompositeOperation = op as GlobalCompositeOperation;
          drawCoverSource(ctx, effVideo, w, h);
          ctx.restore();
        } else if (mode === "chromakey") {
          const keyed = drawChromaKeyed();
          if (keyed) {
            ctx.save();
            ctx.globalAlpha = alpha;
            drawCoverSource(ctx, keyed, w, h);
            ctx.restore();
          }
        }
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [mode, blendMode, transition, transitionMs, drawChromaKeyed]);

  // 열릴 때 한 번 자동 발동(트랜지션 제외 — 토글이라 사용자가 눌러 확인).
  useEffect(() => {
    if (mode === "transition") return;
    const id = setTimeout(trigger, 500);
    return () => { clearTimeout(id); stop(); transitionActiveRef.current = false; };
  }, [mode, trigger, stop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modeLabel =
    mode === "dissolve" ? "디졸브 (블렌드 오버레이)"
      : mode === "chromakey" ? "크로마키 (키색 제거)"
        : "트랜지션 (배경 전환)";

  return (
    // 전체 화면 오버레이가 아니라 편집 다이얼로그 오른쪽에 붙는 고정 패널.
    // position:fixed라 다이얼로그 내용을 스크롤해도 미리보기는 제자리에 고정된다.
    // 배경이 없어(투명) 편집 다이얼로그를 가리지 않으므로 옵션을 바꾸며 실시간으로 확인할 수 있다.
    <div
      className="fixed right-4 top-1/2 z-[60] flex max-h-[90vh] max-w-md -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-gray-800 shadow-2xl ring-1 ring-black/50"
      style={{ left: "calc(50% + 17rem)" }}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="flex items-center justify-between border-b border-gray-700 p-4">
          <h3 className="text-base font-bold text-white">
            이펙트 미리보기 <span className="ml-2 text-sm font-normal text-gray-400">{modeLabel}</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="닫기">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "4 / 3" }}>
            <canvas ref={canvasRef} className="h-full w-full object-contain" />
          </div>

          <p className="mt-3 text-center text-sm text-gray-400">
            {mode === "transition"
              ? (transitioned ? "이펙트 영상으로 전환됨 — 다시 누르면 원배경으로 복귀합니다." : "제스처를 취하면 배경이 이펙트 영상으로 전환됩니다.")
              : (playing ? "재생 중… (최대 재생 시간이 지나면 사라집니다.)" : "재생 버튼을 눌러 이펙트를 확인하세요.")}
          </p>
          <p className="mt-1 text-center text-xs text-gray-500">
            촬영 화면과 동일한 합성 규칙입니다. 실제로는 이 위에 촬영된 사람이 겹칩니다.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 border-t border-gray-700 p-4">
          <button
            onClick={trigger}
            className="rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-500"
          >
            {mode === "transition" ? (transitioned ? "원배경으로 복귀" : "이펙트로 전환") : "▶ 재생"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-700 px-5 py-2 text-gray-200 hover:bg-gray-600"
          >
            닫기
          </button>
        </div>
    </div>
  );
}
