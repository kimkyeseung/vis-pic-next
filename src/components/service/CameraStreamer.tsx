"use client";

import { useEffect, useRef } from "react";
import { useFrameSender } from "@/hooks/useSceneSync";
import { fillGradientFromCSS } from "@/lib/canvas";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import type { BGImage, BgRemovalMode } from "@/types";

type Segmenter = {
  segmentForVideo: (video: HTMLVideoElement, ts: number) => {
    confidenceMasks?: Array<{ getAsFloat32Array: () => Float32Array; width?: number; height?: number }>;
  };
  close: () => void;
};

const HARD = 50 * 50;
const SOFT = 100 * 100;

/**
 * 헤드리스 카메라 송출 컴포넌트.
 * UI 없이 카메라를 열고 서브 화면으로 프레임을 보낸다.
 * CameraSection이 활성화되지 않은 스텝(결제·프레임 선택·배경 선택·완료 등)에서 사용.
 * selectedBackground가 설정된 경우 배경 합성(크로마키 또는 MediaPipe)을 적용한다.
 */
export function CameraStreamer({
  enabled,
  selectedBackground = null,
  backgroundImages = [],
  imageBaseUrl = "",
  bgRemovalMode = "off",
  chromakeyRgb = "0,255,0",
}: {
  enabled: boolean;
  selectedBackground?: number | null;
  backgroundImages?: BGImage[];
  imageBaseUrl?: string;
  bgRemovalMode?: BgRemovalMode;
  chromakeyRgb?: string;
}) {
  const frameChannelRef = useFrameSender(enabled);
  const lastSentRef = useRef(0);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const segmenterRef = useRef<Segmenter | null>(null);

  // 애니메이션 루프에서 최신 값을 읽기 위한 ref
  const selectedBgRef = useRef(selectedBackground);
  const bgRemovalModeRef = useRef(bgRemovalMode);
  const chromakeyRgbRef = useRef(chromakeyRgb);
  useEffect(() => { selectedBgRef.current = selectedBackground; }, [selectedBackground]);
  useEffect(() => { bgRemovalModeRef.current = bgRemovalMode; }, [bgRemovalMode]);
  useEffect(() => { chromakeyRgbRef.current = chromakeyRgb; }, [chromakeyRgb]);

  // 배경 이미지/비디오 로드
  useEffect(() => {
    bgSourceRef.current = null;
    if (!selectedBackground || selectedBackground <= 0) return;
    const bgInfo = backgroundImages.find((b) => b.id === selectedBackground);
    if (!bgInfo || !imageBaseUrl) return;

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
  }, [selectedBackground, backgroundImages, imageBaseUrl]);

  // MediaPipe 세그멘터 초기화
  useEffect(() => {
    if (bgRemovalMode !== "mediapipe") {
      segmenterRef.current?.close();
      segmenterRef.current = null;
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks("/static/mediapipe/wasm");
        if (cancelled) return;
        const seg = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/static/mediapipe/model/selfie_multiclass_256x256.tflite" },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (cancelled) { seg.close(); return; }
        segmenterRef.current = seg as unknown as Segmenter;
      } catch {
        // 초기화 실패 시 raw 카메라로 폴백
      }
    })();

    return () => {
      cancelled = true;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, [bgRemovalMode]);

  // 카메라 캡처 & 프레임 전송 루프
  useEffect(() => {
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let animFrame = 0;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d")!;

    const drawBg = (w: number, h: number) => {
      const sbg = selectedBgRef.current;
      if (bgSourceRef.current) {
        ctx.drawImage(bgSourceRef.current, 0, 0, w, h);
      } else if (sbg !== null && sbg < 0) {
        const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === sbg);
        if (fb) fillGradientFromCSS(ctx, w, h, fb.gradient);
        else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, w, h); }
      } else {
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, w, h);
      }
    };

    const drawRaw = (w: number, h: number) => {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    };

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        stream = s;
        video.srcObject = s;

        const tick = () => {
          animFrame = requestAnimationFrame(tick);
          if (video.readyState < 2 || !video.videoWidth) return;

          const w = video.videoWidth;
          const h = video.videoHeight;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          if (offscreen.width !== w) offscreen.width = w;
          if (offscreen.height !== h) offscreen.height = h;

          const mode = bgRemovalModeRef.current;
          const sbg = selectedBgRef.current;
          const hasBg = sbg !== null;

          if (!hasBg || mode === "off") {
            drawRaw(w, h);
          } else if (mode === "chromakey") {
            offCtx.drawImage(video, 0, 0, w, h);
            const imgData = offCtx.getImageData(0, 0, w, h);
            const d = imgData.data;
            const [kr, kg, kb] = chromakeyRgbRef.current.split(",").map(Number);
            for (let i = 0; i < d.length; i += 4) {
              const dr = d[i] - (kr ?? 0);
              const dg = d[i + 1] - (kg ?? 255);
              const db = d[i + 2] - (kb ?? 0);
              const distSq = dr * dr + dg * dg + db * db;
              if (distSq < HARD) d[i + 3] = 0;
              else if (distSq < SOFT) d[i + 3] = Math.round(((Math.sqrt(distSq) - 50) / 50) * 255);
            }
            offCtx.putImageData(imgData, 0, 0);
            drawBg(w, h);
            ctx.save();
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(offscreen, 0, 0, w, h);
            ctx.restore();
          } else if (mode === "mediapipe" && segmenterRef.current) {
            try {
              const result = segmenterRef.current.segmentForVideo(video, performance.now());
              const masks = result.confidenceMasks;
              if (masks && masks.length > 0) {
                offCtx.drawImage(video, 0, 0, w, h);
                const imgData = offCtx.getImageData(0, 0, w, h);
                const d = imgData.data;
                const bgMask = masks[0].getAsFloat32Array();
                const maskW = masks[0].width ?? w;
                const maskH = masks[0].height ?? h;
                const THRESH = 0.15;
                const FEATHER = 0.35;
                if (bgMask.length === w * h) {
                  for (let i = 0; i < bgMask.length; i++) {
                    const alpha = Math.max(0, Math.min(1, (1 - bgMask[i] - THRESH) / FEATHER));
                    d[i * 4 + 3] = Math.round(alpha * 255);
                  }
                } else {
                  for (let y = 0; y < h; y++) {
                    const my = Math.min(maskH - 1, Math.floor((y / h) * maskH));
                    for (let x = 0; x < w; x++) {
                      const mx = Math.min(maskW - 1, Math.floor((x / w) * maskW));
                      const alpha = Math.max(0, Math.min(1, (1 - (bgMask[my * maskW + mx] ?? 0) - THRESH) / FEATHER));
                      d[(y * w + x) * 4 + 3] = Math.round(alpha * 255);
                    }
                  }
                }
                offCtx.putImageData(imgData, 0, 0);
                drawBg(w, h);
                ctx.save();
                ctx.translate(w, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(offscreen, 0, 0, w, h);
                ctx.restore();
              } else {
                drawRaw(w, h);
              }
            } catch {
              drawRaw(w, h);
            }
          } else {
            // MediaPipe 아직 로딩 중 → raw 카메라로 폴백
            drawRaw(w, h);
          }

          const now = performance.now();
          if (frameChannelRef.current && now - lastSentRef.current > 100) {
            lastSentRef.current = now;
            frameChannelRef.current.postMessage({
              type: "frame",
              dataUrl: canvas.toDataURL("image/jpeg", 0.5),
            });
          }
        };

        animFrame = requestAnimationFrame(tick);
      })
      .catch(() => {});

    return () => {
      cancelAnimationFrame(animFrame);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [enabled, frameChannelRef]);

  return null;
}
