"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { SceneState, BGImage, Sticker } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { fillGradientFromCSS } from "@/lib/canvas";
import { useSceneSyncReceiver } from "@/hooks/useSceneSync";

export default function OutputPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmenterRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const stickerImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [scene, setScene] = useState<SceneState | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useSceneSyncReceiver(useCallback((state: SceneState) => {
    setScene(state);
    // 이미지 스티커 프리로드
    state.stickers.forEach((s) => {
      if (s.src && !stickerImgCacheRef.current.has(s.src)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => stickerImgCacheRef.current.set(s.src!, img);
        img.src = s.src;
      }
    });
  }, []));

  // 카메라 시작
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
      })
      .catch(console.error);
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 배경 소스 로드
  useEffect(() => {
    bgSourceRef.current = null;
    if (!scene) return;
    const { selectedBackground, backgroundImages, imageBaseUrl, bgRemovalMode } = scene;
    if (bgRemovalMode === "off") return;
    if (selectedBackground === null || selectedBackground <= 0) return;
    const bgInfo = backgroundImages.find((b: BGImage) => b.id === selectedBackground);
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
  }, [scene?.selectedBackground, scene?.backgroundImages, scene?.imageBaseUrl, scene?.bgRemovalMode]);

  // MediaPipe 초기화
  useEffect(() => {
    if (scene?.bgRemovalMode !== "mediapipe") {
      segmenterRef.current?.close();
      segmenterRef.current = null;
      return;
    }
    let cancelled = false;
    async function init() {
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
        if (!cancelled) segmenterRef.current = segmenter;
      } catch (err) {
        console.error("MediaPipe init failed:", err);
      }
    }
    init();
    return () => {
      cancelled = true;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, [scene?.bgRemovalMode]);

  const chromaKey = useMemo(() => {
    if (!scene) return { r: 0, g: 255, b: 0 };
    const [r, g, b] = scene.chromakeyRgb.split(",").map(Number);
    return { r: r ?? 0, g: g ?? 255, b: b ?? 0 };
  }, [scene?.chromakeyRgb]);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (!scene) { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, w, h); return; }
    if (bgSourceRef.current) {
      ctx.drawImage(bgSourceRef.current, 0, 0, w, h);
    } else if (scene.selectedBackground !== null && scene.selectedBackground < 0) {
      const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === scene.selectedBackground);
      if (fb) fillGradientFromCSS(ctx, w, h, fb.gradient);
      else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, w, h); }
    } else {
      ctx.fillStyle = "#111"; ctx.fillRect(0, 0, w, h);
    }
  }, [scene?.selectedBackground]);

  // Canvas 렌더링 루프
  useEffect(() => {
    if (!cameraReady) return;
    const offscreen = document.createElement("canvas");
    const HARD = 50 * 50;
    const SOFT = 100 * 100;

    const processFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) { animFrameRef.current = requestAnimationFrame(processFrame); return; }
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx = canvas.getContext("2d")!;
      const bgRemovalMode = scene?.bgRemovalMode ?? "off";

      if (bgRemovalMode === "off") {
        drawBackground(ctx, w, h);
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
      } else {
        if (offscreen.width !== w) offscreen.width = w;
        if (offscreen.height !== h) offscreen.height = h;
        const offCtx = offscreen.getContext("2d")!;
        offCtx.drawImage(video, 0, 0, w, h);
        let processed = false;

        if (bgRemovalMode === "mediapipe" && segmenterRef.current) {
          try {
            const result = segmenterRef.current.segmentForVideo(video, performance.now());
            const masks = result.confidenceMasks;
            if (masks?.length > 0) {
              const mask = masks[masks.length > 1 ? 1 : 0].getAsFloat32Array();
              const imageData = offCtx.getImageData(0, 0, w, h);
              for (let i = 0; i < mask.length; i++) {
                imageData.data[i * 4 + 3] = Math.round(mask[i] * 255);
              }
              offCtx.putImageData(imageData, 0, 0);
              processed = true;
            }
          } catch {}
        } else if (bgRemovalMode === "chromakey") {
          const { r: kr, g: kg, b: kb } = chromaKey;
          const imageData = offCtx.getImageData(0, 0, w, h);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const dr = data[i] - kr, dg = data[i + 1] - kg, db = data[i + 2] - kb;
            const distSq = dr * dr + dg * dg + db * db;
            if (distSq < HARD) data[i + 3] = 0;
            else if (distSq < SOFT) data[i + 3] = Math.round(((Math.sqrt(distSq) - 50) / 50) * 255);
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
      }

      // 스티커 렌더링
      const stickers: Sticker[] = scene?.stickers ?? [];
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

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [cameraReady, scene?.bgRemovalMode, scene?.stickers, chromaKey, drawBackground]);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden" }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {!cameraReady && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: "1.5rem", background: "#111",
        }}>
          카메라 연결 중...
        </div>
      )}
    </div>
  );
}
