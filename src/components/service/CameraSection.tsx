"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DeviceConfig, BGImage, Sticker } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { fillGradientFromCSS } from "@/lib/canvas";
import { AVAILABLE_STICKERS } from "@/constants/stickers";
import { useFrameSender } from "@/hooks/useSceneSync";

export function CameraSection({
  config,
  photos,
  maxPhotos,
  minPhotos,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  stickers,
  syncEnabled = false,
  onCapture,
  onNext,
  onPrev,
  onStickersChange,
}: {
  config: DeviceConfig;
  photos: string[];
  maxPhotos: number;
  minPhotos: number;
  selectedBackground: number | null;
  backgroundImages: BGImage[];
  imageBaseUrl: string;
  stickers: Sticker[];
  syncEnabled?: boolean;
  onCapture: (dataUrl: string, frames?: string[]) => void;
  onNext: () => void;
  onPrev: () => void;
  onStickersChange: (stickers: Sticker[]) => void;
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
  const [autoTimer, setAutoTimer] = useState<number | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [stickerTab, setStickerTab] = useState<"emoji" | "image">("emoji");
  const [dbStickerImages, setDbStickerImages] = useState<Array<{ id: number; filename: string; name: string }>>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ ox: number; oy: number }>({ ox: 0, oy: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const stickerImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const frameChannelRef = useFrameSender(syncEnabled);
  const lastFrameSentRef = useRef(0);

  type TouchGesture =
    | { mode: "drag"; stickerId: string; touchId: number; ox: number; oy: number; startX: number; startY: number; didMove: boolean }
    | { mode: "pinch"; stickerId: string; touch1Id: number; touch2Id: number; initialDist: number; initialScale: number };
  const touchGestureRef = useRef<TouchGesture | null>(null);
  const TAP_THRESHOLD = 10;

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

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async (retryMs?: number) => {
    // 기존 스트림 먼저 정리
    stopCamera();

    if (retryMs) {
      await new Promise((r) => setTimeout(r, retryMs));
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraError(null);
    } catch (err) {
      const e = err as DOMException;
      if (e.name === "NotAllowedError") {
        setCameraError("카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.");
      } else if (e.name === "NotFoundError") {
        setCameraError("연결된 카메라가 없습니다.");
      } else if (e.name === "NotReadableError") {
        // 다른 컨텍스트가 아직 카메라를 점유 중 → 800ms 후 한 번 재시도
        if (!retryMs) {
          startCamera(800);
        } else {
          setCameraError("카메라가 다른 프로그램에서 사용 중입니다. 잠시 후 다시 시도하세요.");
        }
      } else {
        setCameraError(`카메라를 사용할 수 없습니다 (${e.name || e.message})`);
      }
    }
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  // DB 스티커 이미지 목록 로드
  useEffect(() => {
    fetch(`/api/image/list/3?device_id=${config.deviceId}`)
      .then((r) => r.json())
      .then((data) => setDbStickerImages(data.images || []))
      .catch(() => {});
  }, [config.deviceId]);

  // 이미지 스티커 프리로드
  useEffect(() => {
    stickers.forEach((s) => {
      if (s.src && !stickerImgCacheRef.current.has(s.src)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => stickerImgCacheRef.current.set(s.src!, img);
        img.src = s.src;
      }
    });
  }, [stickers]);

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

      // 스티커 렌더링
      stickers.forEach((s) => {
        if (s.src) {
          const img = stickerImgCacheRef.current.get(s.src);
          if (img) {
            const size = Math.round(s.scale * 120);
            ctx.drawImage(img, s.x * w - size / 2, s.y * h - size / 2, size, size);
          }
        } else if (s.emoji) {
          const fontSize = Math.round(s.scale * 72);
          ctx.font = `${fontSize}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(s.emoji, s.x * w, s.y * h);
        }
      });

      // syncEnabled 시 ~30fps로 합성 프레임을 output 창에 전송
      if (frameChannelRef.current) {
        const now = performance.now();
        if (now - lastFrameSentRef.current > 33) {
          lastFrameSentRef.current = now;
          createImageBitmap(display).then((bitmap) => {
            frameChannelRef.current?.postMessage({ type: "frame", bitmap });
          }).catch(() => {});
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedBackground, chromaKey, bgRemovalMode, drawBackground, stickers, frameChannelRef]);

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

  const startAutoTimer = useCallback(() => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    const seconds = config.cameraAutoTimerSeconds;
    if (seconds <= 0) return;
    setAutoTimer(seconds);
    const deadline = Date.now() + seconds * 1000;
    autoTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      if (remaining <= 0) {
        if (autoTimerRef.current) clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
        setAutoTimer(null);
        capturePhoto();
      } else {
        setAutoTimer(remaining);
      }
    }, 1000);
  }, [config.cameraAutoTimerSeconds, capturePhoto]);

  useEffect(() => {
    if (photos.length >= maxPhotos || countdown !== null) return;
    startAutoTimer();
    return () => {
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, [photos.length, maxPhotos, countdown, startAutoTimer]);

  const handleManualCapture = useCallback(() => {
    if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    setAutoTimer(null);
    capturePhoto();
  }, [capturePhoto]);

  const addSticker = useCallback((opts: { emoji?: string; src?: string }) => {
    const newSticker: Sticker = {
      id: `${Date.now()}-${Math.random()}`,
      ...opts,
      x: 0.5,
      y: 0.5,
      scale: 1,
    };
    onStickersChange([...stickers, newSticker]);
    setShowStickerPicker(false);
  }, [stickers, onStickersChange]);

  const removeSticker = useCallback((id: string) => {
    onStickersChange(stickers.filter((s) => s.id !== id));
  }, [stickers, onStickersChange]);

  const handleStickerMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const sticker = stickers.find((s) => s.id === id);
    if (!sticker) return;
    dragOffsetRef.current = {
      ox: e.clientX / rect.width - sticker.x,
      oy: e.clientY / rect.height - sticker.y,
    };
    setDraggingId(id);
  }, [stickers]);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingId) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, e.clientX / rect.width - dragOffsetRef.current.ox));
    const y = Math.max(0, Math.min(1, e.clientY / rect.height - dragOffsetRef.current.oy));
    onStickersChange(stickers.map((s) => s.id === draggingId ? { ...s, x, y } : s));
  }, [draggingId, stickers, onStickersChange]);

  const handleOverlayMouseUp = useCallback(() => {
    setDraggingId(null);
  }, []);

  // ── 터치 핸들러 ──────────────────────────────────────────
  const handleStickerTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const sticker = stickers.find((s) => s.id === id);
    if (!sticker) return;
    const t = e.touches[0];
    touchGestureRef.current = {
      mode: "drag",
      stickerId: id,
      touchId: t.identifier,
      ox: t.clientX / rect.width - sticker.x,
      oy: t.clientY / rect.height - sticker.y,
      startX: t.clientX,
      startY: t.clientY,
      didMove: false,
    };
    setDraggingId(id);
  }, [stickers]);

  const handleOverlayTouchMove = useCallback((e: React.TouchEvent) => {
    const gesture = touchGestureRef.current;
    if (!gesture) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();

    if (gesture.mode === "drag") {
      if (e.touches.length === 2) {
        // 드래그 → 핀치 전환
        const sticker = stickers.find((s) => s.id === gesture.stickerId);
        if (!sticker) return;
        const t1 = e.touches[0], t2 = e.touches[1];
        touchGestureRef.current = {
          mode: "pinch",
          stickerId: gesture.stickerId,
          touch1Id: t1.identifier,
          touch2Id: t2.identifier,
          initialDist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
          initialScale: sticker.scale,
        };
        return;
      }
      const t = Array.from(e.touches).find((t) => t.identifier === gesture.touchId);
      if (!t) return;
      const moved = Math.hypot(t.clientX - gesture.startX, t.clientY - gesture.startY);
      if (moved > TAP_THRESHOLD) gesture.didMove = true;
      const x = Math.max(0, Math.min(1, t.clientX / rect.width - gesture.ox));
      const y = Math.max(0, Math.min(1, t.clientY / rect.height - gesture.oy));
      onStickersChange(stickers.map((s) => s.id === gesture.stickerId ? { ...s, x, y } : s));

    } else if (gesture.mode === "pinch" && e.touches.length >= 2) {
      const t1 = Array.from(e.touches).find((t) => t.identifier === gesture.touch1Id);
      const t2 = Array.from(e.touches).find((t) => t.identifier === gesture.touch2Id);
      if (!t1 || !t2) return;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const newScale = Math.max(0.3, Math.min(5, (dist / gesture.initialDist) * gesture.initialScale));
      onStickersChange(stickers.map((s) => s.id === gesture.stickerId ? { ...s, scale: newScale } : s));
    }
  }, [stickers, onStickersChange]);

  const handleOverlayTouchEnd = useCallback((e: React.TouchEvent) => {
    const gesture = touchGestureRef.current;
    if (!gesture) return;

    if (e.touches.length === 0) {
      // 탭 감지: 움직임이 없었으면 선택 토글 (삭제 버튼 표시)
      if (gesture.mode === "drag" && !gesture.didMove) {
        setSelectedStickerId((prev) => prev === gesture.stickerId ? null : gesture.stickerId);
      }
      touchGestureRef.current = null;
      setDraggingId(null);
    } else if (gesture.mode === "pinch" && e.touches.length === 1) {
      // 핀치 → 드래그로 복귀
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const sticker = stickers.find((s) => s.id === gesture.stickerId);
      if (!sticker) return;
      const t = e.touches[0];
      touchGestureRef.current = {
        mode: "drag",
        stickerId: gesture.stickerId,
        touchId: t.identifier,
        ox: t.clientX / rect.width - sticker.x,
        oy: t.clientY / rect.height - sticker.y,
        startX: t.clientX,
        startY: t.clientY,
        didMove: false,
      };
    }
  }, [stickers]);

  const canProceed = photos.length >= minPhotos;

  return (
    <section className="w-full h-full flex relative z-10">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {flash && <div className="fixed inset-0 bg-white z-50 pointer-events-none animate-flash" />}

      <div className="flex-[7.5] flex items-center justify-center p-8">
        <div className="camera-preview w-full max-w-5xl aspect-video relative">
          {/* 스티커 드래그 오버레이 */}
          <div
            ref={overlayRef}
            className="absolute inset-0 z-10"
            style={{ cursor: draggingId ? "grabbing" : "default", touchAction: "none" }}
            onMouseMove={handleOverlayMouseMove}
            onMouseUp={handleOverlayMouseUp}
            onMouseLeave={handleOverlayMouseUp}
            onTouchMove={handleOverlayTouchMove}
            onTouchEnd={handleOverlayTouchEnd}
            onClick={() => setSelectedStickerId(null)}
          >
            {stickers.map((s) => {
              const isSelected = selectedStickerId === s.id;
              return (
                <div
                  key={s.id}
                  className="absolute"
                  style={{
                    left: `${s.x * 100}%`,
                    top: `${s.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    cursor: draggingId === s.id ? "grabbing" : "grab",
                    userSelect: "none",
                    touchAction: "none",
                    width: s.src ? `${s.scale * 80}px` : undefined,
                    height: s.src ? `${s.scale * 80}px` : undefined,
                    fontSize: s.emoji ? `${s.scale * 48}px` : undefined,
                    lineHeight: 1,
                    outline: isSelected ? "2px dashed rgba(255,255,255,0.7)" : undefined,
                    borderRadius: "4px",
                  }}
                  onMouseDown={(e) => handleStickerMouseDown(e, s.id)}
                  onTouchStart={(e) => handleStickerTouchStart(e, s.id)}
                >
                  {s.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.src} alt="sticker" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                  ) : (
                    s.emoji
                  )}
                  {/* 데스크톱: hover 시 삭제 / 터치: 탭 선택 후 삭제 */}
                  <button
                    className={`absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full text-sm flex items-center justify-center leading-none shadow-md transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                    style={{ pointerEvents: "auto" }}
                    onMouseDown={(e) => { e.stopPropagation(); removeSticker(s.id); setSelectedStickerId(null); }}
                    onTouchStart={(e) => { e.stopPropagation(); removeSticker(s.id); setSelectedStickerId(null); }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
              <span className="text-6xl mb-5 opacity-30">&#128247;</span>
              <p className="text-white/60 mb-6">{cameraError}</p>
              <div className="flex gap-3">
                <button
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                  onClick={() => startCamera()}
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
          onClick={handleManualCapture}
          style={countdown !== null || photos.length >= maxPhotos ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          &#128248; 촬영하기
        </button>

        {/* 스티커 버튼 */}
        <div className="relative mb-4">
          <button
            className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
            style={{ background: showStickerPicker ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.1)", color: "#fff" }}
            onClick={() => setShowStickerPicker((v) => !v)}
          >
            ✨ 스티커 추가
          </button>
          {showStickerPicker && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-black/80 border border-white/20 rounded-2xl p-3 backdrop-blur-sm">
              {/* 탭 */}
              <div className="flex gap-1 mb-3">
                {(["emoji", "image"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${stickerTab === tab ? "bg-white/20 text-white" : "text-white/50 hover:text-white/70"}`}
                    onClick={() => setStickerTab(tab)}
                  >
                    {tab === "emoji" ? "이모지" : "이미지"}
                  </button>
                ))}
              </div>

              {stickerTab === "emoji" && (
                <div className="grid grid-cols-4 gap-2">
                  {AVAILABLE_STICKERS.map((def) => (
                    <button
                      key={def.emoji}
                      className="aspect-square flex items-center justify-center text-2xl rounded-xl hover:bg-white/20 transition-colors"
                      onClick={() => addSticker({ emoji: def.emoji })}
                      title={def.label}
                    >
                      {def.emoji}
                    </button>
                  ))}
                </div>
              )}

              {stickerTab === "image" && (
                dbStickerImages.length === 0 ? (
                  <p className="text-center text-white/40 text-xs py-4">
                    업로드된 스티커가 없습니다
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {dbStickerImages.map((img) => (
                      <button
                        key={img.id}
                        className="aspect-square rounded-xl overflow-hidden hover:ring-2 hover:ring-white/50 transition-all bg-white/5"
                        onClick={() => addSticker({ src: `${imageBaseUrl}/${img.filename}` })}
                        title={img.name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${imageBaseUrl}/${img.filename}`}
                          alt={img.name}
                          className="w-full h-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                )
              )}

              {stickers.length > 0 && (
                <button
                  className="mt-2 w-full text-xs text-white/40 hover:text-white/70 transition-colors py-1"
                  onClick={() => { onStickersChange([]); setShowStickerPicker(false); }}
                >
                  전체 삭제
                </button>
              )}
            </div>
          )}
        </div>

        {autoTimer !== null && countdown === null && photos.length < maxPhotos && (
          <div className="text-center text-gray-400 text-sm mb-4">
            자동 촬영까지 <span className="text-white font-semibold">{autoTimer}</span>초
          </div>
        )}

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
