"use client";

import { useEffect, useRef, useState } from "react";
import { applyChromaKey } from "@/lib/chromakey";
import { applyChromaKeyYuv } from "@/lib/chromakeyYuv";

// 크로마키 임계값은 감도(similarity)에서 파생한다 — CameraSection.tsx와 동일 규칙.
// 배경제거 처리 해상도를 낮춰 프레임 드롭을 줄인다 (CameraSection.tsx와 동일한 이유).
const PROCESS_SCALE = 0.5;
/**
 * mediapipe 추론 스로틀 간격(ms) 선택지 — 이 간격이 지나지 않으면 직전 마스크를 재사용한다.
 * 서비스 화면의 추론 스로틀(useSegmentationDebugSettings / SegmentationDebugPanel)과 같은 값을
 * 써서, 미리보기에서 고른 간격을 실제 촬영 화면에 그대로 대응시킬 수 있게 한다.
 */
export const INFERENCE_INTERVAL_OPTIONS = [10, 20, 50, 100, 150, 200];
/** 기본 간격 — rAF 주기(≈16.7ms)보다 짧아 사실상 매 프레임 추론한다. */
export const DEFAULT_INFERENCE_INTERVAL_MS = 10;

// 제거된 영역이 잘 보이도록 체커보드 패턴을 배경으로 그린다
const CHECKER_SIZE = 20;

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  for (let y = 0; y < h; y += CHECKER_SIZE) {
    for (let x = 0; x < w; x += CHECKER_SIZE) {
      const isEven = ((x / CHECKER_SIZE) + (y / CHECKER_SIZE)) % 2 === 0;
      ctx.fillStyle = isEven ? "#3a3a3a" : "#2a2a2a";
      ctx.fillRect(x, y, CHECKER_SIZE, CHECKER_SIZE);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Segmenter = any;

/**
 * 관리자 배경제거 미리보기 다이얼로그의 카메라 캡처·실시간 키잉 루프 + 스포이드를 담당한다.
 * 슬라이더 UI(ChromaKeyControls/ChromaKeyYuvControls/MediapipeControls)는 이 훅이 반환하는
 * `videoRef`/`canvasRef`/`status`/`eyedropper`만 필요로 할 뿐 이 파일 내부를 몰라도 된다.
 *
 * 슬라이더 값은 전부 `*Ref`로 미러링해서 받는다 — 조작할 때마다 이 rAF 루프(mode가 바뀔 때만
 * 재시작)를 재생성하지 않기 위함이다.
 */
export function usePreviewCamera({
  mode,
  chromaColor,
  onChromaColorChange,
  similarity,
  smoothness,
  spill,
  choke,
  lumaIndependent,
  yuvChromaColor,
  onYuvChromaColorChange,
  yuvSimilarity,
  yuvSmoothness,
  yuvSpill,
  yuvOpacity,
  yuvContrast,
  yuvBrightness,
  yuvGamma,
  threshold,
  feather,
  inferenceInterval,
}: {
  mode: "mediapipe" | "chromakey" | "chromakey-yuv";
  chromaColor: { r: number; g: number; b: number };
  onChromaColorChange: (rgb: string) => void;
  similarity: number;
  smoothness: number;
  spill: number;
  choke: number;
  lumaIndependent: boolean;
  yuvChromaColor: { r: number; g: number; b: number };
  onYuvChromaColorChange: (rgb: string) => void;
  yuvSimilarity: number;
  yuvSmoothness: number;
  yuvSpill: number;
  yuvOpacity: number;
  yuvContrast: number;
  yuvBrightness: number;
  yuvGamma: number;
  threshold: number;
  feather: number;
  /** mediapipe 추론 스로틀 간격(ms) — INFERENCE_INTERVAL_OPTIONS 중 하나 */
  inferenceInterval: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const segmenterRef = useRef<Segmenter>(null);
  // mediapipe 추론은 무거우므로 스로틀링해서 재사용한다 (CameraSection.tsx와 동일한 이유)
  const lastMaskRef = useRef<{ data: Float32Array; w: number; h: number } | null>(null);
  const lastInferenceTimeRef = useRef(0);

  // rAF 루프가 최신 값을 읽도록 ref로 미러링 (슬라이더 조작마다 이펙트/루프를 재시작하지 않기 위함)
  const chromaColorRef = useRef(chromaColor);
  const similarityRef = useRef(similarity);
  const smoothnessRef = useRef(smoothness);
  const spillRef = useRef(spill);
  const chokeRef = useRef(choke);
  const lumaRef = useRef(lumaIndependent);
  const yuvChromaColorRef = useRef(yuvChromaColor);
  const yuvSimilarityRef = useRef(yuvSimilarity);
  const yuvSmoothnessRef = useRef(yuvSmoothness);
  const yuvSpillRef = useRef(yuvSpill);
  const yuvOpacityRef = useRef(yuvOpacity);
  const yuvContrastRef = useRef(yuvContrast);
  const yuvBrightnessRef = useRef(yuvBrightness);
  const yuvGammaRef = useRef(yuvGamma);
  const thresholdRef = useRef(threshold);
  const featherRef = useRef(feather);
  const inferenceIntervalRef = useRef(inferenceInterval);
  useEffect(() => { chromaColorRef.current = chromaColor; }, [chromaColor]);
  useEffect(() => { similarityRef.current = similarity; }, [similarity]);
  useEffect(() => { smoothnessRef.current = smoothness; }, [smoothness]);
  useEffect(() => { spillRef.current = spill; }, [spill]);
  useEffect(() => { chokeRef.current = choke; }, [choke]);
  useEffect(() => { lumaRef.current = lumaIndependent; }, [lumaIndependent]);
  useEffect(() => { yuvChromaColorRef.current = yuvChromaColor; }, [yuvChromaColor]);
  useEffect(() => { yuvSimilarityRef.current = yuvSimilarity; }, [yuvSimilarity]);
  useEffect(() => { yuvSmoothnessRef.current = yuvSmoothness; }, [yuvSmoothness]);
  useEffect(() => { yuvSpillRef.current = yuvSpill; }, [yuvSpill]);
  useEffect(() => { yuvOpacityRef.current = yuvOpacity; }, [yuvOpacity]);
  useEffect(() => { yuvContrastRef.current = yuvContrast; }, [yuvContrast]);
  useEffect(() => { yuvBrightnessRef.current = yuvBrightness; }, [yuvBrightness]);
  useEffect(() => { yuvGammaRef.current = yuvGamma; }, [yuvGamma]);
  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
  useEffect(() => { featherRef.current = feather; }, [feather]);
  useEffect(() => { inferenceIntervalRef.current = inferenceInterval; }, [inferenceInterval]);

  const [eyedropper, setEyedropper] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // 스포이드: 미리보기 클릭 지점의 원본 카메라 색을 추출해 키 색상으로 설정.
  // 표시 캔버스는 미러+제거(체커보드 합성)이므로 그게 아니라 원본 video에서 샘플하고 좌우 미러를 보정한다.
  const handleEyedrop = (e: React.MouseEvent) => {
    if (!eyedropper) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sx = Math.min(vw - 1, Math.max(0, Math.round((1 - nx) * vw))); // 표시 미러 보정
    const sy = Math.min(vh - 1, Math.max(0, Math.round(ny * vh)));
    const s = document.createElement("canvas");
    s.width = 1;
    s.height = 1;
    const sctx = s.getContext("2d")!;
    sctx.drawImage(video, sx, sy, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = sctx.getImageData(0, 0, 1, 1).data;
    if (mode === "chromakey-yuv") onYuvChromaColorChange(`${r},${g},${b}`);
    else onChromaColorChange(`${r},${g},${b}`);
    // 스포이드 모드는 유지 — 여러 번 찍어볼 수 있게 한다. 해제는 버튼 재클릭 or Esc.
  };

  // 스포이드 활성 중 Esc로 해제.
  useEffect(() => {
    if (!eyedropper) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEyedropper(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eyedropper]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (mode === "mediapipe") {
          const noop = () => {};
          const origLog = console.log, origInfo = console.info, origWarn = console.warn;
          console.log = noop; console.info = noop; console.warn = noop;
          try {
            const wasmCheck = await fetch("/static/mediapipe/wasm/vision_wasm_internal.wasm", { method: "HEAD" });
            if (!wasmCheck.ok) throw new Error(`AI 모델 파일을 찾을 수 없습니다 (HTTP ${wasmCheck.status})`);
            const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
            if (cancelled) return;
            const vision = await FilesetResolver.forVisionTasks("/static/mediapipe/wasm");
            if (cancelled) return;
            const segmenter = await ImageSegmenter.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "/static/mediapipe/model/selfie_multiclass_256x256.tflite",
                // 서비스 화면 기본값(useSegmentationDebugSettings)과 동일하게 GPU(WebGL) 델리게이트를 쓴다.
                // 생략하면 MediaPipe 기본값인 CPU(XNNPACK)로 떨어져 미리보기만 훨씬 느려진다.
                delegate: "GPU",
              },
              runningMode: "VIDEO",
              outputCategoryMask: false,
              outputConfidenceMasks: true,
            });
            if (cancelled) { segmenter.close(); return; }
            segmenterRef.current = segmenter;
          } finally {
            console.log = origLog; console.info = origInfo; console.warn = origWarn;
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("ready");

        const offscreen = document.createElement("canvas");
        offscreenRef.current = offscreen;

        const processFrame = () => {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.videoWidth === 0) {
            animFrameRef.current = requestAnimationFrame(processFrame);
            return;
          }

          const w = video.videoWidth;
          const h = video.videoHeight;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          const pw = Math.max(1, Math.round(w * PROCESS_SCALE));
          const ph = Math.max(1, Math.round(h * PROCESS_SCALE));
          if (offscreen.width !== pw) offscreen.width = pw;
          if (offscreen.height !== ph) offscreen.height = ph;

          const offCtx = offscreen.getContext("2d")!;
          offCtx.drawImage(video, 0, 0, pw, ph);

          let processed = false;

          if (mode === "mediapipe" && segmenterRef.current) {
            const now = performance.now();
            if (now - lastInferenceTimeRef.current >= inferenceIntervalRef.current || !lastMaskRef.current) {
              // 다운스케일된 offscreen을 입력으로 넘겨 마스크 자체를 더 작게 받는다
              const result = segmenterRef.current.segmentForVideo(offscreen, now);
              const masks = result.confidenceMasks;
              if (masks && masks.length > 0) {
                lastMaskRef.current = {
                  data: (masks[0].getAsFloat32Array() as Float32Array).slice(),
                  w: masks[0].width ?? pw,
                  h: masks[0].height ?? ph,
                };
                lastInferenceTimeRef.current = now;
              }
            }

            const cached = lastMaskRef.current;
            if (cached) {
              const imageData = offCtx.getImageData(0, 0, pw, ph);
              const data = imageData.data;
              const bgMask = cached.data;
              const THRESH = thresholdRef.current / 100;
              const FEATHER = Math.max(featherRef.current, 1) / 100;
              if (bgMask.length === pw * ph) {
                for (let i = 0; i < bgMask.length; i++) {
                  const fgConf = 1 - bgMask[i];
                  const softAlpha = Math.max(0, Math.min(1, (fgConf - THRESH) / FEATHER));
                  data[i * 4 + 3] = Math.round(softAlpha * 255);
                }
              }
              offCtx.putImageData(imageData, 0, 0);
              processed = true;
            }
          } else if (mode === "chromakey") {
            const imageData = offCtx.getImageData(0, 0, pw, ph);
            applyChromaKey(
              imageData.data, pw, ph,
              chromaColorRef.current,
              similarityRef.current,
              smoothnessRef.current,
              spillRef.current,
              chokeRef.current,
              lumaRef.current,
            );
            offCtx.putImageData(imageData, 0, 0);
            processed = true;
          } else if (mode === "chromakey-yuv") {
            const imageData = offCtx.getImageData(0, 0, pw, ph);
            applyChromaKeyYuv(
              imageData.data, pw, ph,
              yuvChromaColorRef.current,
              yuvSimilarityRef.current,
              yuvSmoothnessRef.current,
              yuvSpillRef.current,
              yuvOpacityRef.current,
              yuvContrastRef.current,
              yuvBrightnessRef.current,
              yuvGammaRef.current,
            );
            offCtx.putImageData(imageData, 0, 0);
            processed = true;
          }

          const ctx = canvas.getContext("2d")!;
          if (processed) {
            drawCheckerboard(ctx, w, h);
            ctx.save();
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(offscreen, 0, 0, w, h);
            ctx.restore();
          } else {
            ctx.save();
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, w, h);
            ctx.restore();
          }

          animFrameRef.current = requestAnimationFrame(processFrame);
        };
        animFrameRef.current = requestAnimationFrame(processFrame);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "카메라를 열 수 없습니다.");
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      segmenterRef.current?.close();
      segmenterRef.current = null;
      lastMaskRef.current = null;
      lastInferenceTimeRef.current = 0;
    };
  }, [mode]);

  return {
    videoRef, canvasRef,
    status, errorMessage,
    eyedropper, setEyedropper,
    handleEyedrop,
  };
}
