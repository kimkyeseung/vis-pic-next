"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DeviceConfig, BGImage } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { fillGradientFromCSS } from "@/lib/canvas";

export function CameraSection({
  config,
  photos,
  maxPhotos,
  minPhotos,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  onCapture,
  onNext,
  onPrev,
}: {
  config: DeviceConfig;
  photos: string[];
  maxPhotos: number;
  minPhotos: number;
  selectedBackground: number | null;
  backgroundImages: BGImage[];
  imageBaseUrl: string;
  onCapture: (dataUrl: string, frames?: string[]) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmenterRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [segmenterStatus, setSegmenterStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const bgRemovalMode = config.bgRemovalMode;

  const chromaKey = useMemo(() => {
    const [r, g, b] = config.chromakeyRgb.split(",").map(Number);
    return { r: r ?? 0, g: g ?? 255, b: b ?? 0 };
  }, [config.chromakeyRgb]);

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
      vid.play();
      bgSourceRef.current = vid;
      return () => { vid.pause(); vid.src = ""; };
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { bgSourceRef.current = img; };
      img.src = url;
    }
  }, [selectedBackground, backgroundImages, imageBaseUrl, bgRemovalMode]);

  useEffect(() => {
    if (bgRemovalMode !== "mediapipe") {
      setSegmenterStatus("idle");
      return;
    }
    let cancelled = false;
    setSegmenterStatus("loading");

    async function initSegmenter() {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        if (cancelled) return;
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite",
          },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
        });
        if (cancelled) return;
        segmenterRef.current = segmenter;
        setSegmenterStatus("ready");
      } catch (err) {
        console.error("MediaPipe initialization failed:", err);
        if (!cancelled) setSegmenterStatus("error");
      }
    }

    initSegmenter();
    return () => {
      cancelled = true;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, [bgRemovalMode]);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (bgSourceRef.current) {
      ctx.drawImage(bgSourceRef.current, 0, 0, w, h);
    } else if (selectedBackground !== null && selectedBackground < 0) {
      const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === selectedBackground);
      if (fb) fillGradientFromCSS(ctx, w, h, fb.gradient);
      else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, w, h); }
    } else {
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, w, h);
    }
  }, [selectedBackground]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      const e = err as DOMException;
      if (e.name === "NotAllowedError") {
        setCameraError("카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.");
      } else if (e.name === "NotFoundError") {
        setCameraError("연결된 카메라가 없습니다.");
      } else if (e.name === "NotReadableError") {
        setCameraError("카메라가 다른 프로그램에서 사용 중입니다.");
      } else {
        setCameraError(`카메라를 사용할 수 없습니다 (${e.name || e.message})`);
      }
    }
  };

  useEffect(() => {
    startCamera();
    const video = videoRef.current;
    return () => {
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    const offscreen = document.createElement("canvas");
    const HARD = 50 * 50;
    const SOFT = 100 * 100;

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

      if (display.width !== w) display.width = w;
      if (display.height !== h) display.height = h;

      const ctx = display.getContext("2d")!;

      if (bgRemovalMode === "off") {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      if (offscreen.width !== w) offscreen.width = w;
      if (offscreen.height !== h) offscreen.height = h;
      const offCtx = offscreen.getContext("2d")!;

      offCtx.drawImage(video, 0, 0, w, h);

      let processed = false;

      if (bgRemovalMode === "mediapipe" && segmenterRef.current) {
        try {
          const result = segmenterRef.current.segmentForVideo(video, performance.now());
          const masks = result.confidenceMasks;
          if (masks && masks.length > 0) {
            const personIdx = masks.length > 1 ? 1 : 0;
            const mask = masks[personIdx].getAsFloat32Array();
            const imageData = offCtx.getImageData(0, 0, w, h);
            const data = imageData.data;
            for (let i = 0; i < mask.length; i++) {
              data[i * 4 + 3] = Math.round(mask[i] * 255);
            }
            offCtx.putImageData(imageData, 0, 0);
            processed = true;
          }
        } catch (err) {
          console.error("Segmentation error:", err);
        }
      } else if (bgRemovalMode === "chromakey") {
        const imageData = offCtx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const { r: kr, g: kg, b: kb } = chromaKey;
        for (let i = 0; i < data.length; i += 4) {
          const dr = data[i] - kr;
          const dg = data[i + 1] - kg;
          const db = data[i + 2] - kb;
          const distSq = dr * dr + dg * dg + db * db;
          if (distSq < HARD) {
            data[i + 3] = 0;
          } else if (distSq < SOFT) {
            data[i + 3] = Math.round(((Math.sqrt(distSq) - 50) / 50) * 255);
          }
        }
        offCtx.putImageData(imageData, 0, 0);
        processed = true;
      }

      if (processed) {
        drawBackground(ctx, w, h);
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
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedBackground, chromaKey, bgRemovalMode, drawBackground]);

  const capturePhoto = useCallback(() => {
    if (countdown !== null || photos.length >= maxPhotos) return;
    let count = config.captureSeconds;
    setCountdown(count);
    const frames: string[] = [];

    if (displayCanvasRef.current) {
      frames.push(displayCanvasRef.current.toDataURL("image/jpeg", 0.85));
    }

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
        if (displayCanvasRef.current) {
          frames.push(displayCanvasRef.current.toDataURL("image/jpeg", 0.85));
        }
      } else {
        clearInterval(interval);
        setCountdown(null);

        if (displayCanvasRef.current) {
          frames.push(displayCanvasRef.current.toDataURL("image/jpeg", 0.85));
          const dataUrl = displayCanvasRef.current.toDataURL("image/jpeg", 0.92);
          onCapture(dataUrl, frames);
        }

        setFlash(true);
        setTimeout(() => setFlash(false), 200);
      }
    }, 1000);
  }, [countdown, photos.length, maxPhotos, config.captureSeconds, onCapture]);

  const canProceed = photos.length >= minPhotos;

  return (
    <section className="w-full h-full flex relative z-10">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {flash && <div className="fixed inset-0 bg-white z-50 pointer-events-none animate-flash" />}

      <div className="flex-[7.5] flex items-center justify-center p-8">
        <div className="camera-preview w-full max-w-5xl aspect-video relative">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
              <span className="text-6xl mb-5 opacity-30">&#128247;</span>
              <p className="text-white/60 mb-6">{cameraError}</p>
              <div className="flex gap-3">
                <button
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                  onClick={() => { setCameraError(null); startCamera(); }}
                >
                  다시 시도
                </button>
                <button
                  className="px-6 py-3 bg-blue-600/80 hover:bg-blue-500 text-white rounded-xl transition-colors"
                  onClick={() => {
                    const c = document.createElement("canvas");
                    c.width = 640; c.height = 480;
                    const ctx = c.getContext("2d")!;
                    const colors = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#34495e"];
                    const color = colors[photos.length % colors.length];
                    ctx.fillStyle = color;
                    ctx.fillRect(0, 0, 640, 480);
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 80px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(`${photos.length + 1}`, 320, 240);
                    onCapture(c.toDataURL("image/jpeg", 0.9));
                  }}
                >
                  테스트 사진 추가
                </button>
              </div>
            </div>
          ) : (
            <canvas ref={displayCanvasRef} className="camera-video" />
          )}
          {bgRemovalMode === "mediapipe" && segmenterStatus === "loading" && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white text-sm px-4 py-2 rounded-lg">
              AI 모델 로딩 중...
            </div>
          )}
          {bgRemovalMode === "mediapipe" && segmenterStatus === "error" && (
            <div className="absolute bottom-4 left-4 bg-red-900/80 text-white text-sm px-4 py-2 rounded-lg">
              AI 모델 로드 실패
            </div>
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-[200px] font-extrabold text-white animate-countdown" key={countdown} style={{ textShadow: "0 0 60px rgba(255,255,255,0.5)" }}>
                {countdown}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-[2.5] p-8 flex flex-col">
        <h3 className="text-2xl font-bold text-white mb-8">
          촬영 ({photos.length}/{maxPhotos})
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {Array.from({ length: maxPhotos }, (_, i) => (
            <div key={i} className="aspect-[4/3] bg-black/30 rounded-xl flex items-center justify-center border-2 border-white/10 overflow-hidden">
              {photos[i] ? (
                <img src={photos[i]} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white/30 text-2xl">{i + 1}</span>
              )}
            </div>
          ))}
        </div>

        <button
          className="service-button w-full py-5 rounded-2xl text-xl mb-6"
          onClick={capturePhoto}
          style={countdown !== null || photos.length >= maxPhotos ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          &#128248; 촬영하기
        </button>

        <div className="mt-auto flex flex-col gap-3">
          <button className="service-button nav-button w-full" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
            &#9664; 이전으로
          </button>
          <button
            className="service-button nav-button w-full"
            onClick={onNext}
            style={!canProceed ? { opacity: 0.5, pointerEvents: "none" } : {}}
          >
            다음으로 &#9654;
          </button>
        </div>
      </div>
    </section>
  );
}
