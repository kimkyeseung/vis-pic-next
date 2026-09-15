"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { DeviceConfig, BgRemovalMode } from "@/types";
import { computeCaptureSize } from "@/lib/canvas";
import { applyChromaKey } from "@/lib/chromakey";
import { applyChromaKeyYuv } from "@/lib/chromakeyYuv";
import { useAutoCaptureTimer } from "@/hooks/useAutoCaptureTimer";
import { createSoundPlayer, type SoundPlayer } from "@/lib/sounds";
import type { BgEffectInfo } from "./useBackgroundCompositing";

// GIF 중간 프레임 캡처: ~180ms 간격(재생 10fps와 매칭), 800px 다운스케일.
// 최근 24장만 유지해 메모리·GIF 파일 크기(~2.5MB)를 제한한다.
const GIF_FRAME_INTERVAL_MS = 180;
const GIF_MAX_FRAMES = 24;
const GIF_FRAME_WIDTH = 800;

// 개발(next dev = localhost) 여부. 빌드 시점에 인라인되는 상수라 SSR/클라이언트가 일치하고,
// 배포된 키오스크(production 빌드, 127.0.0.1:3001)에서는 항상 false → 손님 화면엔 계측이 안 뜬다.
const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * 카메라 합성·촬영 파이프라인의 핵심 — 프리뷰 표시 루프(processFrame, mediapipe 메인스레드
 * 핫패스·크로마키 2종 분기·FPS 계측 포함), 고해상도 촬영 합성(captureHiRes), 카운트다운·GIF
 * 프레임·셔터음(capturePhoto), 자동 촬영 타이머 연결까지 한 곳에서 다룬다.
 *
 * 다른 서브시스템 훅(`useMediapipeSegmentation`/`useBackgroundCompositing`/`useStickers`)의
 * 반환값을 입력으로 그대로 받아 조합하는 "오케스트레이션 훅"이다 — 이 파일만 보고는 각 값이
 * 정확히 어떻게 만들어지는지 알 수 없고, 대신 프레임 하나가 화면에 그려지고 촬영본이 되기까지의
 * 전체 흐름은 이 파일 안에서 끝까지 추적할 수 있다.
 */
export function useCameraCapture({
  videoRef,
  displayCanvasRef,
  config,
  photos,
  maxPhotos,
  onCapture,
  onNext,
  bgRemovalMode,
  selectedBackground,
  segmentThresh,
  segmentFeather,
  debug,
  countdown,
  setCountdown,
  maskSmoothQuality,
  maskSmoothQualityRef,
  useGpuDelegate,
  lightModelRef,
  inferenceIntervalRef,
  perfRef,
  segmenterRef,
  maskCanvasRef,
  maskReadyRef,
  lastInferenceTimeRef,
  workerRef,
  workerBusyRef,
  workerActiveRef,
  currentBgEffectRef,
  effectVisibleRef,
  effectAlphaRef,
  backEffectRef,
  effectTimerRef,
  effectDurationRef,
  effectStartedAtRef,
  stopEffect,
  drawBackground,
  drawEffectLayer,
  drawStickers,
  frameChannelRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  config: DeviceConfig;
  photos: string[];
  maxPhotos: number;
  onCapture: (dataUrl: string, frames?: string[]) => void;
  onNext: () => void;
  bgRemovalMode: BgRemovalMode;
  selectedBackground: number | null;
  /** AI 배경제거 경계 침식/부드러움(0-1 스케일, config.segmentThreshold/Feather÷100) — 호출부가
   * 한 번만 계산해 둔 값을 그대로 받는다(매 프레임 재계산 방지). */
  segmentThresh: number;
  segmentFeather: number;
  debug: boolean;
  countdown: number | null;
  setCountdown: (n: number | null) => void;
  maskSmoothQuality: "high" | "low";
  maskSmoothQualityRef: React.RefObject<"high" | "low">;
  useGpuDelegate: boolean;
  lightModelRef: React.RefObject<boolean>;
  inferenceIntervalRef: React.RefObject<number>;
  perfRef: React.RefObject<{ frames: number; lastFlush: number; inferMs: number; maskMs: number; sentAt: number }>;
  segmenterRef: React.RefObject<ImageSegmenter | null>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  maskReadyRef: React.RefObject<boolean>;
  lastInferenceTimeRef: React.RefObject<number>;
  workerRef: React.RefObject<Worker | null>;
  workerBusyRef: React.RefObject<boolean>;
  workerActiveRef: React.RefObject<boolean>;
  currentBgEffectRef: React.RefObject<BgEffectInfo | null>;
  effectVisibleRef: React.RefObject<boolean>;
  effectAlphaRef: React.RefObject<number>;
  backEffectRef: React.RefObject<HTMLVideoElement | null>;
  effectTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  effectDurationRef: React.RefObject<number>;
  effectStartedAtRef: React.RefObject<number>;
  stopEffect: () => void;
  drawBackground: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  drawEffectLayer: (ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) => void;
  drawStickers: (ctx: CanvasRenderingContext2D, w: number, h: number, pxScale?: number) => void;
  frameChannelRef: React.RefObject<{ postMessage: (msg: { type: string; dataUrl: string }) => void } | null>;
}): {
  flash: boolean;
  capturedPreview: string | null;
  perf: { fps: number; inferMs: number; maskMs: number };
  autoTimer: number | null;
  autoTimerPaused: boolean;
  toggleAutoTimerPause: () => void;
  handleManualCapture: () => void;
} {
  const animFrameRef = useRef<number>(0);
  // 촬영 순간에만 쓰는 고해상도 합성 캔버스(프리뷰 1440 상한과 별개로 원본 해상도로 캡처).
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const capturePersonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [flash, setFlash] = useState(false);
  // 촬영 직후 촬영본을 1초간 프리뷰로 보여준다.
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const capturedPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 프레임 레이트(표시 루프)와 추론/마스크 생성 시간(ms)을 perfRef(파라미터, useMediapipeSegmentation과
  // 공유)에 누적하고 0.5초마다 표시 상태로 flush.
  const [perf, setPerf] = useState({ fps: 0, inferMs: 0, maskMs: 0 });
  // 무-deps rAF 루프가 최신 debug 값을 읽도록 ref로 보관 — 디버그도 아니고 개발도 아닌
  // 손님 세션에선 0.5초마다의 setPerf 리렌더를 건너뛴다(계측 자체는 가벼워 항상 누적).
  const debugRef = useRef(debug);
  useEffect(() => { debugRef.current = debug; }, [debug]);
  const lastFrameSentRef = useRef(0);

  const chromaKey = useMemo(() => {
    const [r, g, b] = config.chromakeyRgb.split(",").map(Number);
    return { r: r ?? 0, g: g ?? 255, b: b ?? 0 };
  }, [config.chromakeyRgb]);

  const chromaKeyYuv = useMemo(() => {
    const [r, g, b] = config.chromakeyYuvRgb.split(",").map(Number);
    return { r: r ?? 0, g: g ?? 255, b: b ?? 0 };
  }, [config.chromakeyYuvRgb]);

  // 촬영·서브 모니터 송출용: 카메라 합성 캔버스 위에 스티커 레이어를 얹은 스냅샷.
  // maxWidth 지정 시 다운스케일 (GIF 중간 프레임처럼 고해상도가 필요 없는 경우)
  const composeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotWithStickers = useCallback((quality: number, maxWidth?: number): string | null => {
    const display = displayCanvasRef.current;
    if (!display || !display.width || !display.height) return null;
    const scale = maxWidth ? Math.min(1, maxWidth / display.width) : 1;
    const w = Math.round(display.width * scale);
    const h = Math.round(display.height * scale);
    let c = composeCanvasRef.current;
    if (!c) {
      c = document.createElement("canvas");
      composeCanvasRef.current = c;
    }
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(display, 0, 0, w, h);
    drawStickers(ctx, w, h, scale);
    return c.toDataURL("image/jpeg", quality);
  }, [drawStickers, displayCanvasRef]);

  // 촬영 순간에만 실행하는 고해상도 캡처(프리뷰 루프는 그대로 1440 상한 유지).
  // 원본 video(고해상도)를 다시 그리고, 프리뷰에서 만든 저해상도 마스크(maskCanvasRef)를 확대 적용해
  // "배경 → 이펙트 → 사람" 순서로 한 번만 합성한다. 실패 시 null → 호출부가 기존 경로로 폴백.
  const CAPTURE_MAX_W = 1800; // 10×15cm 인화 300DPI 기준(≈1800×1200). 그 이상은 인쇄상 무의미.
  const captureHiRes = useCallback((): string | null => {
    const video = videoRef.current;
    const display = displayCanvasRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !display || !display.width) return null;
    // 원본보다 크게 확대하지 않고(min) 최대 1800까지. 프리뷰(1440) 상한과 별개.
    const { w: TW, h: TH } = computeCaptureSize(video.videoWidth, video.videoHeight, CAPTURE_MAX_W);
    if (TW <= 0 || TH <= 0) return null;

    let c = captureCanvasRef.current;
    if (!c) { c = document.createElement("canvas"); captureCanvasRef.current = c; }
    c.width = TW; c.height = TH;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = maskSmoothQuality;

    const drawRawMirrored = () => {
      ctx.save();
      ctx.translate(TW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, TW, TH);
      ctx.restore();
    };

    if (bgRemovalMode === "off") {
      drawRawMirrored();
    } else {
      // 고해상도 사람(미러 전) 캔버스를 만든다.
      let person = capturePersonCanvasRef.current;
      if (!person) { person = document.createElement("canvas"); capturePersonCanvasRef.current = person; }
      person.width = TW; person.height = TH;
      const pctx = person.getContext("2d", { willReadFrequently: bgRemovalMode === "chromakey" || bgRemovalMode === "chromakey-yuv" });
      let built = false;
      if (pctx) {
        pctx.imageSmoothingEnabled = true;
        pctx.imageSmoothingQuality = maskSmoothQuality;
        pctx.clearRect(0, 0, TW, TH);
        pctx.drawImage(video, 0, 0, TW, TH);
        if (bgRemovalMode === "mediapipe" && maskReadyRef.current && maskCanvasRef.current) {
          // 프리뷰에서 구운 soft-alpha 마스크를 확대 적용(destination-in). 추론은 다시 안 돈다.
          pctx.save();
          pctx.globalCompositeOperation = "destination-in";
          pctx.drawImage(maskCanvasRef.current, 0, 0, TW, TH);
          pctx.restore();
          built = true;
        } else if (bgRemovalMode === "chromakey") {
          const img = pctx.getImageData(0, 0, TW, TH);
          applyChromaKey(img.data, TW, TH, chromaKey, config.chromakeySimilarity, config.chromakeySmoothness, config.chromakeySpill, config.chromakeyChoke, config.chromakeyLumaIndependent);
          pctx.putImageData(img, 0, 0);
          built = true;
        } else if (bgRemovalMode === "chromakey-yuv") {
          const img = pctx.getImageData(0, 0, TW, TH);
          applyChromaKeyYuv(img.data, TW, TH, chromaKeyYuv, config.chromakeyYuvSimilarity, config.chromakeyYuvSmoothness, config.chromakeyYuvSpill, config.chromakeyYuvOpacity, config.chromakeyYuvContrast, config.chromakeyYuvBrightness, config.chromakeyYuvGamma);
          pctx.putImageData(img, 0, 0);
          built = true;
        }
      }
      if (built && person) {
        drawBackground(ctx, TW, TH);
        drawEffectLayer(ctx, TW, TH, effectAlphaRef.current);
        ctx.save();
        ctx.translate(TW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(person, 0, 0, TW, TH);
        ctx.restore();
      } else {
        drawRawMirrored();
      }
    }

    // 스티커: 프리뷰(display) 대비 배율로 크기를 맞춘다(위치는 정규화라 무관).
    drawStickers(ctx, TW, TH, TW / display.width);
    return c.toDataURL("image/jpeg", 0.92);
  }, [bgRemovalMode, chromaKey, config.chromakeySimilarity, config.chromakeySmoothness, config.chromakeySpill, config.chromakeyChoke, config.chromakeyLumaIndependent, chromaKeyYuv, config.chromakeyYuvSimilarity, config.chromakeyYuvSmoothness, config.chromakeyYuvSpill, config.chromakeyYuvOpacity, config.chromakeyYuvContrast, config.chromakeyYuvBrightness, config.chromakeyYuvGamma, maskSmoothQuality, maskCanvasRef, maskReadyRef, drawBackground, drawEffectLayer, effectAlphaRef, drawStickers, videoRef, displayCanvasRef]);

  // dissolve/chromakey 이펙트를 배경 위·사람 아래에 그린다(사람 뒤 레이어). 표시 상태에 따라 알파를 부드럽게 페이드.
  // 배경과 동일하게 미러 없이 그린다. transition 모드는 배경 자체를 바꾸므로 여기서 그리지 않는다.
  useEffect(() => {
    const offscreen = document.createElement("canvas");

    const processFrame = () => {
      const video = videoRef.current;
      const display = displayCanvasRef.current;
      if (!video || !display || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // 표시 루프 FPS 계측 — 매 프레임 카운트하고 0.5초마다 표시 상태로 flush(디버그 오버레이용).
      {
        const p = perfRef.current;
        p.frames++;
        const tnow = performance.now();
        if (tnow - p.lastFlush >= 500) {
          if (debugRef.current || IS_DEV) {
            setPerf({
              fps: Math.round((p.frames * 1000) / (tnow - p.lastFlush)),
              inferMs: Math.round(p.inferMs * 10) / 10,
              maskMs: Math.round(p.maskMs * 10) / 10,
            });
          }
          p.frames = 0;
          p.lastFlush = tnow;
        }
      }

      // 배경제거 처리 해상도를 낮춰 프레임 드롭을 줄인다. 4K(2880+)에서는 0.25로 더 줄여
      // 처리 픽셀 수를 1/16로 낮춘다. 최종 표시는 네이티브 해상도로 업스케일되므로
      // 화질 손실은 가장자리 마스크 정밀도 정도로 미미하고 FEATHER 블렌딩이 이를 가려준다.
      const PROCESS_SCALE = w >= 2560 ? 0.25 : 0.5;

      // 프리뷰 캔버스는 최대 1440px로 제한 — 캔버스 렌더링·GPU 전송 비용을 줄인다.
      // 최종 촬영본은 이 상한과 별개로 captureHiRes()가 촬영 순간에만 원본 해상도(최대 1800px)로 합성한다.
      const MAX_PREVIEW_W = 1440;
      const previewScale = Math.min(1, MAX_PREVIEW_W / w);
      const dw = Math.round(w * previewScale);
      const dh = Math.round(h * previewScale);

      if (display.width !== dw) display.width = dw;
      if (display.height !== dh) display.height = dh;

      const ctx = display.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = maskSmoothQualityRef.current;

      if (bgRemovalMode === "off") {
        ctx.save();
        ctx.translate(dw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, dw, dh);
        ctx.restore();

        if (frameChannelRef.current) {
          const now = performance.now();
          if (now - lastFrameSentRef.current > 100) {
            lastFrameSentRef.current = now;
            const dataUrl = snapshotWithStickers(0.85, 1440);
            if (dataUrl) frameChannelRef.current.postMessage({ type: "frame", dataUrl });
          }
        }

        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const pw = Math.max(1, Math.round(w * PROCESS_SCALE));
      const ph = Math.max(1, Math.round(h * PROCESS_SCALE));
      if (offscreen.width !== pw) offscreen.width = pw;
      if (offscreen.height !== ph) offscreen.height = ph;
      const offCtx = offscreen.getContext("2d")!;
      offCtx.imageSmoothingEnabled = true;
      offCtx.imageSmoothingQuality = maskSmoothQualityRef.current;

      offCtx.drawImage(video, 0, 0, pw, ph);

      let processed = false;

      if (bgRemovalMode === "mediapipe") {
        try {
          const now = performance.now();
          if (workerActiveRef.current && workerRef.current) {
            // 워커 경로: 무거운 추론+readback을 워커가 담당하므로 메인 스레드(표시 루프)는 안 막힌다.
            // 워커가 idle일 때만 현재 프레임을 다운스케일(pw×ph)해 보낸다 — 큐 적체 방지.
            if (!workerBusyRef.current) {
              workerBusyRef.current = true;
              perfRef.current.sentAt = now;
              createImageBitmap(video, { resizeWidth: pw, resizeHeight: ph, resizeQuality: "low" })
                .then((bmp) => {
                  const worker = workerRef.current;
                  if (worker) worker.postMessage({ type: "frame", bitmap: bmp, timestamp: performance.now() }, [bmp]);
                  else bmp.close();
                })
                .catch(() => { workerBusyRef.current = false; });
            }
          } else if (segmenterRef.current) {
            // 메인 스레드 경로: 선택된 스로틀 간격(inferenceIntervalRef)마다 soft alpha 마스크를 굽는다.
            if (now - lastInferenceTimeRef.current >= inferenceIntervalRef.current || !maskReadyRef.current) {
              const inferStart = performance.now();
              const result = segmenterRef.current.segmentForVideo(offscreen, now);
              const inferEnd = performance.now();
              const masks = result.confidenceMasks;
              if (masks && masks.length > 0) {
                const mask = masks[0];
                const arr = mask.getAsFloat32Array();
                const mw = mask.width ?? pw;
                const mh = mask.height ?? ph;
                let mc = maskCanvasRef.current;
                if (!mc) { mc = document.createElement("canvas"); maskCanvasRef.current = mc; }
                if (mc.width !== mw) mc.width = mw;
                if (mc.height !== mh) mc.height = mh;
                const mctx = mc.getContext("2d")!;
                // 전경 극성: 경량 selfie는 masks[0]=전경, 멀티클래스는 masks[0]=배경(전경=1-v).
                const fgIsMask0 = lightModelRef.current;
                const mImg = mctx.createImageData(mw, mh);
                const md = mImg.data;
                const THRESH = segmentThresh;
                const FEATHER = segmentFeather;
                for (let i = 0; i < arr.length; i++) {
                  const fgConf = fgIsMask0 ? arr[i] : 1 - arr[i];
                  const softAlpha = Math.max(0, Math.min(1, (fgConf - THRESH) / FEATHER));
                  md[i * 4] = 255; md[i * 4 + 1] = 255; md[i * 4 + 2] = 255;
                  md[i * 4 + 3] = Math.round(softAlpha * 255);
                }
                mctx.putImageData(mImg, 0, 0);
                lastInferenceTimeRef.current = now;
                maskReadyRef.current = true;
                perfRef.current.inferMs = inferEnd - inferStart;
                perfRef.current.maskMs = performance.now() - inferEnd;
              }
            }
          }

          // 워커/폴백 공통: 준비된 최신 마스크를 GPU 합성(destination-in)으로 적용.
          // 마스크를 pw×ph로 확대할 때의 bilinear 보간이 경계를 더 부드럽게 해준다.
          const mc = maskCanvasRef.current;
          if (maskReadyRef.current && mc) {
            offCtx.save();
            offCtx.globalCompositeOperation = "destination-in";
            offCtx.drawImage(mc, 0, 0, pw, ph);
            offCtx.restore();
            processed = true;
          }
        } catch (err) {
          console.error("Segmentation error:", err);
        }
      } else if (bgRemovalMode === "chromakey") {
        const imageData = offCtx.getImageData(0, 0, pw, ph);
        applyChromaKey(imageData.data, pw, ph, chromaKey, config.chromakeySimilarity, config.chromakeySmoothness, config.chromakeySpill, config.chromakeyChoke, config.chromakeyLumaIndependent);
        offCtx.putImageData(imageData, 0, 0);
        processed = true;
      } else if (bgRemovalMode === "chromakey-yuv") {
        const imageData = offCtx.getImageData(0, 0, pw, ph);
        applyChromaKeyYuv(imageData.data, pw, ph, chromaKeyYuv, config.chromakeyYuvSimilarity, config.chromakeyYuvSmoothness, config.chromakeyYuvSpill, config.chromakeyYuvOpacity, config.chromakeyYuvContrast, config.chromakeyYuvBrightness, config.chromakeyYuvGamma);
        offCtx.putImageData(imageData, 0, 0);
        processed = true;
      }

      if (processed) {
        drawBackground(ctx, dw, dh);
        // 이펙트 레이어: 배경 위·사람 아래에 그려 "배경 → 이펙트 → 사람" 순서를 만든다.
        // dissolve=블렌드 합성, chromakey=키색 제거 프레임. transition은 배경 자체라 여기서 제외.
        // 알파 이징(표시/사라짐 페이드)은 여기서 진행하고, 그 알파를 캡처에서도 재사용한다.
        {
          const info = currentBgEffectRef.current;
          const target = effectVisibleRef.current && info && info.mode !== "transition" ? 1 : 0;
          effectAlphaRef.current += (target - effectAlphaRef.current) * 0.18; // ~250ms 이징
        }
        drawEffectLayer(ctx, dw, dh, effectAlphaRef.current);
        ctx.save();
        ctx.translate(dw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(offscreen, 0, 0, dw, dh);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(dw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, dw, dh);
        ctx.restore();
      }

      // 스티커는 별도 캔버스 레이어에서 그린다 (송출 프레임에는 snapshotWithStickers로 합성)

      // syncEnabled 시 ~30fps로 합성 프레임을 output 창에 전송
      if (frameChannelRef.current) {
        const now = performance.now();
        if (now - lastFrameSentRef.current > 100) {
          lastFrameSentRef.current = now;
          const dataUrl = snapshotWithStickers(0.85, 1440);
          if (dataUrl) frameChannelRef.current?.postMessage({ type: "frame", dataUrl });
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedBackground, chromaKey, config.chromakeySimilarity, config.chromakeySmoothness, config.chromakeySpill, config.chromakeyChoke, config.chromakeyLumaIndependent, chromaKeyYuv, config.chromakeyYuvSimilarity, config.chromakeyYuvSmoothness, config.chromakeyYuvSpill, config.chromakeyYuvOpacity, config.chromakeyYuvContrast, config.chromakeyYuvBrightness, config.chromakeyYuvGamma, bgRemovalMode, segmentThresh, segmentFeather, useGpuDelegate, lightModelRef, inferenceIntervalRef, maskSmoothQualityRef, perfRef, segmenterRef, maskCanvasRef, maskReadyRef, lastInferenceTimeRef, workerRef, workerBusyRef, workerActiveRef, currentBgEffectRef, effectVisibleRef, effectAlphaRef, drawBackground, drawEffectLayer, frameChannelRef, snapshotWithStickers, videoRef, displayCanvasRef]);

  // 카운트다운 도중 언마운트(이전/다음 이동 등) 시 타이머가 살아남아
  // onCapture가 화면 전환 후에 실행되는 것을 막는다.
  const captureTimersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  useEffect(() => () => {
    captureTimersRef.current.forEach((t) => clearInterval(t));
    captureTimersRef.current = [];
    if (capturedPreviewTimerRef.current) clearTimeout(capturedPreviewTimerRef.current);
    if (effectTimerRef.current) clearTimeout(effectTimerRef.current);
  }, [effectTimerRef]);

  // 촬영 효과음 플레이어 (브라우저 전용 — 마운트 후 생성)
  const soundRef = useRef<SoundPlayer | null>(null);
  useEffect(() => {
    soundRef.current = createSoundPlayer();
    return () => { soundRef.current?.dispose(); soundRef.current = null; };
  }, []);

  const capturePhoto = useCallback(() => {
    if (countdown !== null || photos.length >= maxPhotos) return;
    let count = config.captureSeconds;
    setCountdown(count);
    // 카운트다운 숫자마다 효과음을 1초씩만 재생
    soundRef.current?.playCountingTick();

    // 촬영 시작 시 dissolve/chromakey 이펙트가 재생 중이면 스냅샷까지 유지한다.
    // (스냅샷은 카운트다운 후에 찍히는데, 그 사이 durationMs·영상 종료로 이펙트가 꺼지면
    //  captureHiRes가 그릴 이펙트가 없어 사진에 안 담긴 것처럼 보이는 문제 방지.)
    const holdEffect = effectVisibleRef.current;
    if (holdEffect) {
      if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
      const ev = backEffectRef.current;
      if (ev) { ev.loop = true; ev.play().catch(() => {}); }
    }

    const frames: string[] = [];
    const pushFrame = () => {
      const snap = snapshotWithStickers(0.75, GIF_FRAME_WIDTH);
      if (snap) {
        frames.push(snap);
        if (frames.length > GIF_MAX_FRAMES) frames.shift();
      }
    };

    pushFrame();
    const frameTimer = setInterval(pushFrame, GIF_FRAME_INTERVAL_MS);

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
        soundRef.current?.playCountingTick();
      } else {
        clearInterval(interval);
        clearInterval(frameTimer);
        captureTimersRef.current = captureTimersRef.current.filter((t) => t !== interval && t !== frameTimer);
        setCountdown(null);

        pushFrame();
        const dataUrl = captureHiRes() ?? snapshotWithStickers(0.92);
        if (dataUrl) {
          onCapture(dataUrl, frames);
          // 촬영본 1초 프리뷰
          setCapturedPreview(dataUrl);
          if (capturedPreviewTimerRef.current) clearTimeout(capturedPreviewTimerRef.current);
          capturedPreviewTimerRef.current = setTimeout(() => setCapturedPreview(null), 1000);
        }

        // 스냅샷을 마쳤으면 붙잡아 둔 이펙트의 루프는 풀어주되(무한 루프 방지), 바로 끄지 않고
        // 원래 설정된 지속시간(effectDuration) 중 남은 시간만큼은 계속 재생되게 둔다 —
        // 시작 시 hold였든 카운트다운 중 재트리거로 붙잡혔든 effectStartedAtRef 기준으로 계산.
        if (holdEffect || effectVisibleRef.current) {
          const ev = backEffectRef.current;
          if (ev) ev.loop = false;
          if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
          const remaining = effectDurationRef.current - (performance.now() - effectStartedAtRef.current);
          if (remaining > 0) effectTimerRef.current = setTimeout(stopEffect, remaining);
          else stopEffect();
        }

        // 촬영 순간 셔터음 재생 + 플래시
        soundRef.current?.playShutter();
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
      }
    }, 1000);

    captureTimersRef.current.push(frameTimer, interval);
  }, [countdown, photos.length, maxPhotos, config.captureSeconds, onCapture, snapshotWithStickers, captureHiRes, effectVisibleRef, effectTimerRef, backEffectRef, effectDurationRef, effectStartedAtRef, stopEffect, setCountdown]);

  // 자동 촬영 타이머 (훅으로 분리 — 회귀 방지 이유는 useAutoCaptureTimer 참고).
  const { autoTimer, cancel: cancelAutoTimer, paused: autoTimerPaused, togglePause: toggleAutoTimerPause } = useAutoCaptureTimer({
    photosCount: photos.length,
    maxPhotos,
    countdown,
    seconds: config.cameraAutoTimerSeconds,
    onFire: capturePhoto,
  });

  const handleManualCapture = useCallback(() => {
    cancelAutoTimer();
    capturePhoto();
  }, [cancelAutoTimer, capturePhoto]);

  // 남은 촬영 횟수가 0이 되면(최대 매수 도달) 자동으로 다음 단계로 이동한다.
  // 마지막 촬영본 프리뷰(1초)를 보여준 뒤 넘어가도록 약간의 지연을 둔다.
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useEffect(() => {
    if (maxPhotos > 0 && photos.length >= maxPhotos) {
      const timer = setTimeout(() => onNextRef.current(), 1200);
      return () => clearTimeout(timer);
    }
  }, [photos.length, maxPhotos]);

  return { flash, capturedPreview, perf, autoTimer, autoTimerPaused, toggleAutoTimerPause, handleManualCapture };
}
