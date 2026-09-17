"use client";

import { useEffect, useRef, useState } from "react";
import { applyChromaKey } from "@/lib/chromakey";
import { applyChromaKeyYuv } from "@/lib/chromakeyYuv";
import {
  bakeAlphaMask,
  bboxToFrame,
  createMaskBaker,
  handRectsFromLandmarks,
  nextRoi,
  rectsToCrop,
  ROI_INPUT_SIZE,
  type MaskTuning,
  type NormRect,
  type Roi,
} from "@/lib/segmentMask";
import { segmentProcessScaleFor } from "@/lib/deviceConfig";
import type { SegmentProcessScale } from "@/types";

// 크로마키 임계값은 감도(similarity)에서 파생한다 — useCameraCapture와 동일 규칙.
/**
 * mediapipe 추론 스로틀 간격(ms) 선택지 — 이 간격이 지나지 않으면 직전 마스크를 재사용한다.
 * 서비스 화면의 추론 스로틀(useSegmentationDebugSettings / SegmentationDebugPanel)과 같은 값을
 * 써서, 미리보기에서 고른 간격을 실제 촬영 화면에 그대로 대응시킬 수 있게 한다.
 */
export const INFERENCE_INTERVAL_OPTIONS = [10, 20, 50, 100, 150, 200];
/** 기본 간격 — rAF 주기(≈16.7ms)보다 짧아 사실상 매 프레임 추론한다. */
export const DEFAULT_INFERENCE_INTERVAL_MS = 10;

/** 손 위치 갱신 간격(ms). 서비스 화면(useHandGestureCapture)과 같은 값. */
const HAND_INTERVAL_MS = 200;

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
  maskBlur,
  edgeShift,
  temporal,
  roi,
  roiMargin,
  processScale,
  handRescue,
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
  /** 경계 블러 세기(0-200%) */
  maskBlur: number;
  /** 경계 두께(-100~100) */
  edgeShift: number;
  /** 시간축 평활(0-100%) */
  temporal: number;
  /** 인물 추적 크롭 사용 여부 */
  roi: boolean;
  /** 추적 여유(0-100%) */
  roiMargin: number;
  /** 처리 해상도 배율 */
  processScale: SegmentProcessScale;
  /** 손 구제 세기(0-100%) */
  handRescue: number;
  /** mediapipe 추론 스로틀 간격(ms) — INFERENCE_INTERVAL_OPTIONS 중 하나 */
  inferenceInterval: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const segmenterRef = useRef<Segmenter>(null);
  // mediapipe 추론은 무거우므로 스로틀링해서 재사용한다 (useCameraCapture와 동일한 이유).
  // 추론마다 프레임 전체를 덮는 soft-alpha 마스크를 이 캔버스에 한 번만 굽고(블러 포함),
  // 매 프레임에는 GPU 합성(destination-in)으로만 적용한다.
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskReadyRef = useRef(false);
  // 다음 추론에 쓸 인물 주변 크롭(전체 프레임 픽셀 좌표). null이면 프레임 전체를 본다.
  const roiRef = useRef<Roi | null>(null);
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
  const maskTuningRef = useRef<MaskTuning>({ blur: maskBlur, edgeShift, temporal, roi, roiMargin, handRescue });
  // 손 구제를 미리보기에서도 그대로 보려면 여기서도 손 위치를 알아야 한다. 서비스 화면은
  // 촬영 트리거용 제스처 인식기(useHandGestureCapture)의 부산물을 쓰지만, 미리보기엔 그게 없어
  // 랜드마크 전용으로 따로 띄운다(구제 세기가 0이면 아예 만들지 않는다).
  const handRectsRef = useRef<NormRect[]>([]);
  const handRecognizerRef = useRef<{ recognizeForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: { x: number; y: number }[][] }; close: () => void } | null>(null);
  const processScaleRef = useRef(processScale);
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
  useEffect(() => {
    maskTuningRef.current = { blur: maskBlur, edgeShift, temporal, roi, roiMargin, handRescue };
  }, [maskBlur, edgeShift, temporal, roi, roiMargin, handRescue]);
  useEffect(() => { processScaleRef.current = processScale; }, [processScale]);

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
            // 손 구제 미리보기용 랜드마크 인식기. 서비스 화면과 같은 모델·파일셋을 재사용한다.
            // 실패해도 미리보기 자체는 돌아가야 하므로 조용히 넘어간다(구제만 안 보임).
            try {
              const { GestureRecognizer } = await import("@mediapipe/tasks-vision");
              const gr = await GestureRecognizer.createFromOptions(vision, {
                baseOptions: { modelAssetPath: "/static/mediapipe/model/gesture_recognizer.task" },
                runningMode: "VIDEO",
                numHands: 2,
              });
              if (cancelled) gr.close();
              else handRecognizerRef.current = gr as unknown as typeof handRecognizerRef.current;
            } catch { /* 손 구제 미리보기 없이 진행 */ }
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
        // ROI 추론 입력(정사각 고정) — 크기가 매 프레임 같아야 MediaPipe가 텐서를 다시 안 잡는다.
        // 마스크 ImageData도 크기가 같은 동안 재사용한다(추론마다 수 MB 할당을 피한다).
        let roiCanvas: HTMLCanvasElement | null = null;
        let maskImage: ImageData | null = null;
        const baker = createMaskBaker();
        let lastHandInfer = 0;

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
          const scale = segmentProcessScaleFor(processScaleRef.current, w);
          const pw = Math.max(1, Math.round(w * scale));
          const ph = Math.max(1, Math.round(h * scale));
          if (offscreen.width !== pw) offscreen.width = pw;
          if (offscreen.height !== ph) offscreen.height = ph;

          const offCtx = offscreen.getContext("2d")!;
          offCtx.drawImage(video, 0, 0, pw, ph);

          let processed = false;

          // 손 위치 갱신(200ms 간격) — 구제 세기가 0이면 인식기를 만들지도 않는다.
          if (mode === "mediapipe" && handRecognizerRef.current && maskTuningRef.current.handRescue > 0) {
            const t = performance.now();
            if (t - lastHandInfer >= HAND_INTERVAL_MS) {
              lastHandInfer = t;
              try {
                const res = handRecognizerRef.current.recognizeForVideo(video, t);
                handRectsRef.current = handRectsFromLandmarks(res.landmarks ?? []);
              } catch { /* 인식 실패는 무시 — 구제만 빠진다 */ }
            }
          }

          if (mode === "mediapipe" && segmenterRef.current) {
            // 촬영 화면(useCameraCapture)·송출(CameraStreamer)과 같은 마스크 파이프라인 —
            // ROI 크롭 추론 + 공간 블러(src/lib/segmentMask.ts). 미리보기가 실제 화면과 다르게
            // 보이면 슬라이더를 아무리 맞춰도 소용이 없으므로 세 경로가 같은 코드를 쓴다.
            const now = performance.now();
            // 다음 추론이 볼 크롭. 해상도가 바뀌면 이전 ROI가 프레임 밖을 가리킬 수 있어 버린다.
            const prev = roiRef.current;
            const crop =
              prev && prev.x >= 0 && prev.y >= 0 && prev.x + prev.w <= w && prev.y + prev.h <= h
                ? prev
                : null;
            if (!crop) roiRef.current = null;
            // 마스크 캔버스 좌표계에서 이번 크롭이 차지하는 자리(= 되붙일 위치).
            const dest = crop
              ? { x: (crop.x * pw) / w, y: (crop.y * ph) / h, w: (crop.w * pw) / w, h: (crop.h * ph) / h }
              : null;
            const rescueStrength = maskTuningRef.current.handRescue / 100;
            const rescue = rescueStrength > 0
              ? { rects: rectsToCrop(handRectsRef.current, w, h, crop), strength: rescueStrength }
              : undefined;

            if (now - lastInferenceTimeRef.current >= inferenceIntervalRef.current || !maskReadyRef.current) {
              let input: HTMLCanvasElement = offscreen; // 크롭이 없으면 이미 그려 둔 pw×ph 프레임
              if (crop) {
                if (!roiCanvas) {
                  roiCanvas = document.createElement("canvas");
                  roiCanvas.width = ROI_INPUT_SIZE;
                  roiCanvas.height = ROI_INPUT_SIZE;
                }
                const rctx = roiCanvas.getContext("2d")!;
                rctx.imageSmoothingEnabled = true;
                rctx.imageSmoothingQuality = "high";
                rctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, ROI_INPUT_SIZE, ROI_INPUT_SIZE);
                input = roiCanvas;
              }
              const result = segmenterRef.current.segmentForVideo(input, now);
              const masks = result.confidenceMasks;
              if (masks && masks.length > 0) {
                const arr = masks[0].getAsFloat32Array() as Float32Array;
                const mw = (masks[0].width as number | undefined) ?? (crop ? ROI_INPUT_SIZE : pw);
                const mh = (masks[0].height as number | undefined) ?? (crop ? ROI_INPUT_SIZE : ph);
                if (!maskImage || maskImage.width !== mw || maskImage.height !== mh) maskImage = new ImageData(mw, mh);
                // 미리보기는 멀티클래스 모델만 쓴다 → masks[0]=배경(전경 = 1 - v).
                const bbox = bakeAlphaMask(arr, maskImage.data, mw, mh, {
                  fgIsMask0: false,
                  thresh: thresholdRef.current / 100,
                  feather: Math.max(featherRef.current, 1) / 100,
                  rescue,
                });
                let mc = maskCanvasRef.current;
                if (!mc) { mc = document.createElement("canvas"); maskCanvasRef.current = mc; }
                // 마스크 캔버스는 ROI 유무와 무관하게 항상 프레임 전체(pw×ph)를 덮는다.
                baker.bake(mc, maskImage, pw, ph, dest, maskTuningRef.current);
                lastInferenceTimeRef.current = now;
                maskReadyRef.current = true;
                // 다음 추론용 크롭 갱신. 전경을 못 찾았으면 전체 프레임에서 다시 찾는다.
                roiRef.current = bbox
                  ? nextRoi(bboxToFrame(bbox, mw, mh, crop, w, h), w, h, crop, maskTuningRef.current)
                  : null;
              }
            }

            const mc = maskCanvasRef.current;
            if (maskReadyRef.current && mc) {
              offCtx.save();
              offCtx.globalCompositeOperation = "destination-in";
              offCtx.drawImage(mc, 0, 0, pw, ph);
              offCtx.restore();
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
      handRecognizerRef.current?.close();
      handRecognizerRef.current = null;
      handRectsRef.current = [];
      maskReadyRef.current = false;
      roiRef.current = null;
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
