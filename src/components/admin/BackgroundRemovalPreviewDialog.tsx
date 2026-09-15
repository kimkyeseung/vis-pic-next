"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { applyChromaKey } from "@/lib/chromakey";
import { applyChromaKeyYuv } from "@/lib/chromakeyYuv";

// 크로마키 임계값은 감도(similarity)에서 파생한다 — CameraSection.tsx와 동일 규칙.
// 배경제거 처리 해상도를 낮춰 프레임 드롭을 줄인다 (CameraSection.tsx와 동일한 이유).
const PROCESS_SCALE = 0.5;
// mediapipe 추론은 화면 갱신보다 훨씬 무거우므로 이 간격으로만 실행하고 재사용한다.
const INFERENCE_INTERVAL_MS = 200;

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

function rgbStringToHex(rgb: string): string {
  const parts = rgb.split(",").map((n) => parseInt(n.trim(), 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "#00ff00";
  return `#${parts.map((n) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgbString(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "0,255,0";
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).join(",");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Segmenter = any;

export function BackgroundRemovalPreviewDialog({
  mode,
  chromaColor,
  onChromaColorChange,
  similarity,
  onSimilarityChange,
  smoothness,
  onSmoothnessChange,
  spill,
  onSpillChange,
  choke,
  onChokeChange,
  lumaIndependent,
  onLumaIndependentChange,
  yuvChromaColor,
  onYuvChromaColorChange,
  yuvSimilarity,
  onYuvSimilarityChange,
  yuvSmoothness,
  onYuvSmoothnessChange,
  yuvSpill,
  onYuvSpillChange,
  yuvOpacity,
  onYuvOpacityChange,
  yuvContrast,
  onYuvContrastChange,
  yuvBrightness,
  onYuvBrightnessChange,
  yuvGamma,
  onYuvGammaChange,
  threshold,
  onThresholdChange,
  feather,
  onFeatherChange,
  onClose,
}: {
  mode: "mediapipe" | "chromakey" | "chromakey-yuv";
  chromaColor: { r: number; g: number; b: number };
  onChromaColorChange: (rgb: string) => void;
  similarity: number;
  onSimilarityChange: (n: number) => void;
  smoothness: number;
  onSmoothnessChange: (n: number) => void;
  spill: number;
  onSpillChange: (n: number) => void;
  choke: number;
  onChokeChange: (n: number) => void;
  lumaIndependent: boolean;
  onLumaIndependentChange: (v: boolean) => void;
  yuvChromaColor: { r: number; g: number; b: number };
  onYuvChromaColorChange: (rgb: string) => void;
  yuvSimilarity: number;
  onYuvSimilarityChange: (n: number) => void;
  yuvSmoothness: number;
  onYuvSmoothnessChange: (n: number) => void;
  yuvSpill: number;
  onYuvSpillChange: (n: number) => void;
  yuvOpacity: number;
  onYuvOpacityChange: (n: number) => void;
  yuvContrast: number;
  onYuvContrastChange: (n: number) => void;
  yuvBrightness: number;
  onYuvBrightnessChange: (n: number) => void;
  yuvGamma: number;
  onYuvGammaChange: (n: number) => void;
  threshold: number;
  onThresholdChange: (n: number) => void;
  feather: number;
  onFeatherChange: (n: number) => void;
  onClose: () => void;
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

  const [colorPickerOpen, setColorPickerOpen] = useState(false);
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
              baseOptions: { modelAssetPath: "/static/mediapipe/model/selfie_multiclass_256x256.tflite" },
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
            if (now - lastInferenceTimeRef.current >= INFERENCE_INTERVAL_MS || !lastMaskRef.current) {
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

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-xl p-6 border border-gray-700 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">
            배경 제거 미리보기 ({mode === "mediapipe" ? "AI 배경 제거" : mode === "chromakey-yuv" ? "크로마키 (OBS 방식)" : "크로마키"})
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none" aria-label="닫기">
            &times;
          </button>
        </div>

        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
            style={{ cursor: eyedropper ? "crosshair" : "default" }}
            onClick={handleEyedrop}
          />

          {eyedropper && status === "ready" && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full pointer-events-none">
              화면을 클릭해 색 추출 · 해제: 스포이드 버튼 or Esc
            </div>
          )}

          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">
              {mode === "mediapipe" ? "AI 모델과 카메라를 여는 중..." : "카메라를 여는 중..."}
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center text-red-300 text-sm text-center px-6">
              {errorMessage || "카메라를 사용할 수 없습니다."}
            </div>
          )}
        </div>

        <p className="text-gray-500 text-xs mt-3 mb-4">
          체커보드 무늬로 보이는 부분이 실제로 제거되는 영역입니다. 아래 값을 조절하면 바로 반영됩니다.
        </p>

        {mode === "chromakey" ? (
          <div className="space-y-3">
            <div className="relative flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">키 색상</label>
              <button
                type="button"
                onClick={() => setColorPickerOpen((v) => !v)}
                className="w-10 h-10 rounded-lg border border-gray-600 shrink-0 cursor-pointer"
                style={{ backgroundColor: `rgb(${chromaColor.r},${chromaColor.g},${chromaColor.b})` }}
                aria-label="색상 선택"
              />
              <span className="text-gray-400 text-sm font-mono">
                {chromaColor.r},{chromaColor.g},{chromaColor.b}
              </span>
              <button
                type="button"
                onClick={() => setEyedropper((v) => !v)}
                title="화면을 클릭해 색 추출"
                className={`ml-auto shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  eyedropper
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600"
                }`}
              >
                &#128167; 스포이드
              </button>

              {colorPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColorPickerOpen(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-20 p-3 bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
                    <HexColorPicker
                      color={rgbStringToHex(`${chromaColor.r},${chromaColor.g},${chromaColor.b}`)}
                      onChange={(hex) => onChromaColorChange(hexToRgbString(hex))}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">감도 ({similarity})</label>
              <input
                type="range"
                min={1}
                max={100}
                value={similarity}
                onChange={(e) => onSimilarityChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">감도가 높을수록 키 색과 더 먼 색까지 제거됩니다.</p>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">경계 부드러움 ({smoothness})</label>
              <input
                type="range"
                min={0}
                max={100}
                value={smoothness}
                onChange={(e) => onSmoothnessChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다.</p>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">스필 제거 ({spill})</label>
              <input
                type="range"
                min={0}
                max={100}
                value={spill}
                onChange={(e) => onSpillChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">인물 테두리에 남는 키 색 번짐(초록/파랑기)을 눌러 제거합니다.</p>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">경계 침식 ({choke})</label>
              <input
                type="range"
                min={0}
                max={100}
                value={choke}
                onChange={(e) => onChokeChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">인물 마스크 경계를 안쪽으로 깎아 가장자리 프린지를 제거합니다.</p>
            <label className="flex items-center gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={lumaIndependent}
                onChange={(e) => onLumaIndependentChange(e.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
              <span className="text-gray-400 text-sm">밝기 무시 키잉 (그늘/얼룩진 그린스크린 보정)</span>
            </label>
            <p className="text-gray-500 text-xs">밝기 차이를 무시하고 색만 비교합니다. 조명이 불균일해 그늘/밝은 부분이 한 감도로 안 빠질 때 켜세요.</p>
          </div>
        ) : mode === "chromakey-yuv" ? (
          <div className="space-y-3">
            <div className="relative flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">키 색상</label>
              <button
                type="button"
                onClick={() => setColorPickerOpen((v) => !v)}
                className="w-10 h-10 rounded-lg border border-gray-600 shrink-0 cursor-pointer"
                style={{ backgroundColor: `rgb(${yuvChromaColor.r},${yuvChromaColor.g},${yuvChromaColor.b})` }}
                aria-label="색상 선택"
              />
              <span className="text-gray-400 text-sm font-mono">
                {yuvChromaColor.r},{yuvChromaColor.g},{yuvChromaColor.b}
              </span>
              <button
                type="button"
                onClick={() => setEyedropper((v) => !v)}
                title="화면을 클릭해 색 추출"
                className={`ml-auto shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  eyedropper
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600"
                }`}
              >
                &#128167; 스포이드
              </button>

              {colorPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColorPickerOpen(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-20 p-3 bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
                    <HexColorPicker
                      color={rgbStringToHex(`${yuvChromaColor.r},${yuvChromaColor.g},${yuvChromaColor.b}`)}
                      onChange={(hex) => onYuvChromaColorChange(hexToRgbString(hex))}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">감도 ({yuvSimilarity})</label>
              <input
                type="range"
                min={1}
                max={100}
                value={yuvSimilarity}
                onChange={(e) => onYuvSimilarityChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">감도가 높을수록 키 색과 더 먼 색까지 제거됩니다.</p>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">경계 부드러움 ({yuvSmoothness})</label>
              <input
                type="range"
                min={0}
                max={100}
                value={yuvSmoothness}
                onChange={(e) => onYuvSmoothnessChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다.</p>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">스필 제거 ({yuvSpill})</label>
              <input
                type="range"
                min={0}
                max={100}
                value={yuvSpill}
                onChange={(e) => onYuvSpillChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">인물 테두리에 남는 키 색 번짐(초록/파랑기)을 눌러 제거합니다.</p>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">투명도 ({yuvOpacity})</label>
              <input
                type="range"
                min={0}
                max={100}
                value={yuvOpacity}
                onChange={(e) => onYuvOpacityChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">결과 전체의 투명도 배율입니다. 100이면 원본 그대로입니다.</p>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">대비 ({yuvContrast})</label>
              <input
                type="range"
                min={-100}
                max={100}
                value={yuvContrast}
                onChange={(e) => onYuvContrastChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">명암 ({yuvBrightness})</label>
              <input
                type="range"
                min={-100}
                max={100}
                value={yuvBrightness}
                onChange={(e) => onYuvBrightnessChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">감마 ({yuvGamma})</label>
              <input
                type="range"
                min={-100}
                max={100}
                value={yuvGamma}
                onChange={(e) => onYuvGammaChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-gray-500 text-xs">대비/명암/감마는 결과 화면 전체의 색감을 보정합니다. 0이면 변화 없음입니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">경계 침식 ({threshold}%)</label>
              <input
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => onThresholdChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-gray-400 text-sm w-40 shrink-0">경계 부드러움 ({feather}%)</label>
              <input
                type="range"
                min={1}
                max={100}
                value={feather}
                onChange={(e) => onFeatherChange(Number(e.target.value))}
                className="flex-1"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
