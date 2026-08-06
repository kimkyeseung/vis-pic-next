"use client";

import { useEffect, useRef } from "react";
import { useFrameSender } from "@/hooks/useSceneSync";
import { fillGradientFromCSS } from "@/lib/canvas";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { suppressMediapipeLogs } from "@/lib/suppressMediapipeLogs";
import type { BGImage, BgRemovalMode } from "@/types";

type Segmenter = {
  segmentForVideo: (source: HTMLVideoElement | HTMLCanvasElement, ts: number) => {
    confidenceMasks?: Array<{ getAsFloat32Array: () => Float32Array; width?: number; height?: number }>;
  };
  close: () => void;
};

// 배경제거 처리 해상도를 낮춰 서브 화면 송출 루프의 부하를 줄인다 (CameraSection.tsx와 동일한 이유).
const PROCESS_SCALE = 0.5;
// mediapipe 추론은 화면 갱신보다 훨씬 무거우므로 이 간격으로만 실행하고 재사용한다.
const INFERENCE_INTERVAL_MS = 200;

/**
 * 헤드리스 카메라 송출 컴포넌트.
 * UI 없이 카메라를 열고 서브 화면으로 프레임을 보낸다.
 * CameraSection이 활성화되지 않은 스텝(대기·결제·프레임 선택·배경 선택·완료 등)에서 사용.
 * selectedBackground가 설정된 경우 배경 합성(크로마키 또는 MediaPipe)을 적용한다.
 * enabled는 카메라 장치 점유(웜업), sendFrames는 서브 화면 프레임 전송을 각각 제어한다 —
 * 카메라를 미리 켜두면 서브모니터를 켜는 즉시 화면이 출력된다.
 */
export function CameraStreamer({
  enabled,
  sendFrames = true,
  selectedBackground = null,
  backgroundImages = [],
  imageBaseUrl = "",
  bgRemovalMode = "off",
  chromakeyRgb = "0,255,0",
  chromakeySimilarity = 50,
  segmentThreshold = 15,
  segmentFeather = 35,
}: {
  enabled: boolean;
  sendFrames?: boolean;
  selectedBackground?: number | null;
  backgroundImages?: BGImage[];
  imageBaseUrl?: string;
  bgRemovalMode?: BgRemovalMode;
  chromakeyRgb?: string;
  /** 크로마키 감도(색상 허용 거리, 1-100). 메인 촬영 화면과 동일한 관리자 설정값. */
  chromakeySimilarity?: number;
  /** AI 배경제거 경계 침식 (0-100%). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentThreshold?: number;
  /** AI 배경제거 경계 부드러움 (0-100%). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentFeather?: number;
}) {
  const frameChannelRef = useFrameSender(enabled && sendFrames);
  const lastSentRef = useRef(0);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const segmenterRef = useRef<Segmenter | null>(null);
  // mediapipe 추론은 무거우므로 스로틀링해서 재사용한다 (CameraSection.tsx와 동일한 이유)
  const lastMaskRef = useRef<{ data: Float32Array; w: number; h: number } | null>(null);
  const lastInferenceTimeRef = useRef(0);

  // 애니메이션 루프에서 최신 값을 읽기 위한 ref
  const selectedBgRef = useRef(selectedBackground);
  const bgRemovalModeRef = useRef(bgRemovalMode);
  const chromakeyRgbRef = useRef(chromakeyRgb);
  const chromakeySimilarityRef = useRef(chromakeySimilarity);
  // 관리자 설정(0-100%)을 confidence 스케일(0-1)로 변환해 보관. FEATHER는 0으로 나누기 방지를 위해 최소 1%.
  const segmentThreshRef = useRef(segmentThreshold / 100);
  const segmentFeatherRef = useRef(Math.max(segmentFeather, 1) / 100);
  useEffect(() => { selectedBgRef.current = selectedBackground; }, [selectedBackground]);
  useEffect(() => { bgRemovalModeRef.current = bgRemovalMode; }, [bgRemovalMode]);
  useEffect(() => { chromakeyRgbRef.current = chromakeyRgb; }, [chromakeyRgb]);
  useEffect(() => { chromakeySimilarityRef.current = chromakeySimilarity; }, [chromakeySimilarity]);
  useEffect(() => { segmentThreshRef.current = segmentThreshold / 100; }, [segmentThreshold]);
  useEffect(() => { segmentFeatherRef.current = Math.max(segmentFeather, 1) / 100; }, [segmentFeather]);

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
      // play() 실패(소스 미지원 등) 시 unhandled rejection 방지
      vid.play().catch(() => {});
      bgSourceRef.current = vid;
      return () => { vid.pause(); vid.src = ""; };
    } else {
      let stale = false;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { if (!stale) bgSourceRef.current = img; };
      img.src = url;
      return () => { stale = true; };
    }
  }, [selectedBackground, backgroundImages, imageBaseUrl]);

  // MediaPipe 세그멘터 초기화
  useEffect(() => {
    suppressMediapipeLogs();
    if (bgRemovalMode !== "mediapipe") {
      segmenterRef.current?.close();
      segmenterRef.current = null;
      lastMaskRef.current = null;
      lastInferenceTimeRef.current = 0;
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
      lastMaskRef.current = null;
      lastInferenceTimeRef.current = 0;
    };
  }, [bgRemovalMode]);

  // 카메라 캡처 & 프레임 전송 루프
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
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

    // 촬영 단계(CameraSection)가 카메라를 막 놓은 직후엔 OS가 아직 장치를 물고
    // 있어 NotReadableError가 날 수 있다 → 잠시 후 재시도한다. 재시도가 없으면
    // 서브 모니터가 촬영 마지막 프레임에 멈춘 채 복구되지 않는다 (CameraSection과 동일 대응).
    const acquireStream = async (): Promise<MediaStream | null> => {
      for (let attempt = 0; !cancelled; attempt++) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            // 촬영(CameraSection)과 동일하게 4:3(960×720)으로 요청해 서브 모니터 미러 비율을 일치시킨다.
            video: { width: { ideal: 960 }, height: { ideal: 720 }, aspectRatio: { ideal: 4 / 3 } },
          });
        } catch (err) {
          const e = err as DOMException;
          if (e.name === "NotReadableError" && attempt < 2 && !cancelled) {
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          return null;
        }
      }
      return null;
    };

    acquireStream().then((s) => {
      if (!s) return;
      // 언마운트 후 늦게 도착한 스트림은 즉시 정리해 카메라 점유 누수를 막는다
      if (cancelled) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      video.srcObject = s;

        const tick = () => {
          animFrame = requestAnimationFrame(tick);
          if (video.readyState < 2 || !video.videoWidth) return;
          // 전송 대상이 없으면 합성 연산을 생략하고 카메라만 켜둔 채 대기
          if (!frameChannelRef.current) return;

          const w = video.videoWidth;
          const h = video.videoHeight;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          const pw = Math.max(1, Math.round(w * PROCESS_SCALE));
          const ph = Math.max(1, Math.round(h * PROCESS_SCALE));
          if (offscreen.width !== pw) offscreen.width = pw;
          if (offscreen.height !== ph) offscreen.height = ph;

          const mode = bgRemovalModeRef.current;
          const sbg = selectedBgRef.current;
          const hasBg = sbg !== null;

          if (!hasBg || mode === "off") {
            drawRaw(w, h);
          } else if (mode === "chromakey") {
            offCtx.drawImage(video, 0, 0, pw, ph);
            const imgData = offCtx.getImageData(0, 0, pw, ph);
            const d = imgData.data;
            const [kr, kg, kb] = chromakeyRgbRef.current.split(",").map(Number);
            const simDist = Math.max(1, chromakeySimilarityRef.current);
            const HARD = simDist * simDist;
            const SOFT = (simDist * 2) * (simDist * 2);
            for (let i = 0; i < d.length; i += 4) {
              const dr = d[i] - (kr ?? 0);
              const dg = d[i + 1] - (kg ?? 255);
              const db = d[i + 2] - (kb ?? 0);
              const distSq = dr * dr + dg * dg + db * db;
              if (distSq < HARD) d[i + 3] = 0;
              else if (distSq < SOFT) d[i + 3] = Math.round(((Math.sqrt(distSq) - simDist) / simDist) * 255);
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
              offCtx.drawImage(video, 0, 0, pw, ph);

              const now = performance.now();
              if (now - lastInferenceTimeRef.current >= INFERENCE_INTERVAL_MS || !lastMaskRef.current) {
                // 다운스케일된 offscreen을 입력으로 넘겨 마스크 자체를 더 작게 받는다
                const result = segmenterRef.current.segmentForVideo(offscreen, now);
                const masks = result.confidenceMasks;
                if (masks && masks.length > 0) {
                  lastMaskRef.current = {
                    data: masks[0].getAsFloat32Array().slice(),
                    w: masks[0].width ?? pw,
                    h: masks[0].height ?? ph,
                  };
                  lastInferenceTimeRef.current = now;
                }
              }

              const cached = lastMaskRef.current;
              if (cached) {
                const imgData = offCtx.getImageData(0, 0, pw, ph);
                const d = imgData.data;
                const bgMask = cached.data;
                const maskW = cached.w;
                const maskH = cached.h;
                const THRESH = segmentThreshRef.current;
                const FEATHER = segmentFeatherRef.current;
                if (bgMask.length === pw * ph) {
                  for (let i = 0; i < bgMask.length; i++) {
                    const alpha = Math.max(0, Math.min(1, (1 - bgMask[i] - THRESH) / FEATHER));
                    d[i * 4 + 3] = Math.round(alpha * 255);
                  }
                } else {
                  for (let y = 0; y < ph; y++) {
                    const my = Math.min(maskH - 1, Math.floor((y / ph) * maskH));
                    for (let x = 0; x < pw; x++) {
                      const mx = Math.min(maskW - 1, Math.floor((x / pw) * maskW));
                      const alpha = Math.max(0, Math.min(1, (1 - (bgMask[my * maskW + mx] ?? 0) - THRESH) / FEATHER));
                      d[(y * pw + x) * 4 + 3] = Math.round(alpha * 255);
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
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrame);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [enabled, frameChannelRef]);

  return null;
}
