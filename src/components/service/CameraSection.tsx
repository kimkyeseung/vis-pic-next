"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DeviceConfig, BGImage, Sticker } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { fillGradientFromCSS } from "@/lib/canvas";
import { AVAILABLE_STICKERS } from "@/constants/stickers";
import { useFrameSender } from "@/hooks/useSceneSync";
import { createSoundPlayer, type SoundPlayer } from "@/lib/sounds";
import { CircularTimer } from "@/components/service/CircularTimer";
import { useLanguage } from "@/i18n/LanguageContext";
import type { MessageKey } from "@/i18n/translations";

type ConfidenceMask = {
  getAsFloat32Array: () => Float32Array;
  width?: number;
  height?: number;
};

// GIF 중간 프레임 캡처: ~180ms 간격(재생 10fps와 매칭), 800px 다운스케일.
// 최근 24장만 유지해 메모리·GIF 파일 크기(~2.5MB)를 제한한다.
const GIF_FRAME_INTERVAL_MS = 180;
const GIF_MAX_FRAMES = 24;
const GIF_FRAME_WIDTH = 800;

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
  onBackgroundSelect,
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
  onBackgroundSelect: (bg: number) => void;
}) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmenterRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  // mediapipe 추론(segmentForVideo)은 무거우므로 매 프레임 돌리지 않고 스로틀링해서
  // 재사용한다 — 화면 갱신(최대 60fps)과 AI 추론(간격은 INFERENCE_INTERVAL_MS)을 분리해 끊김을 줄인다.
  const lastMaskRef = useRef<{ data: Float32Array; w: number; h: number } | null>(null);
  const lastInferenceTimeRef = useRef(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<{ key: MessageKey; reason?: string } | null>(null);
  const [flash, setFlash] = useState(false);
  // 촬영 직후 촬영본을 0.5초간 프리뷰로 보여준다.
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const capturedPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [segmenterStatus, setSegmenterStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [segmenterError, setSegmenterError] = useState<string | null>(null);
  const [cameraDeviceDiag, setCameraDeviceDiag] = useState<string | null>(null);
  const [autoTimer, setAutoTimer] = useState<number | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [stickerTab, setStickerTab] = useState<"emoji" | "image">("emoji");
  const [dbStickerImages, setDbStickerImages] = useState<Array<{ id: number; filename: string; name: string }>>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ ox: number; oy: number }>({ ox: 0, oy: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const stickerImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  // 스티커는 별도 캔버스 레이어에 60fps로 그린다 — 메인 합성 루프(배경제거)에
  // 묶이면 드래그가 세그멘테이션 처리 속도로 끊기고, stickers가 루프 effect
  // deps에 들어가면 mousemove마다 루프가 재생성되어 버벅인다.
  const stickerCanvasRef = useRef<HTMLCanvasElement>(null);
  const stickersRef = useRef(stickers);
  useEffect(() => { stickersRef.current = stickers; }, [stickers]);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const frameChannelRef = useFrameSender(syncEnabled);
  const lastFrameSentRef = useRef(0);
  // 손바닥(Open_Palm) 제스처 인식기 + 최신 촬영 핸들러 참조 (감지 루프가 재생성 없이 호출)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gestureRef = useRef<any>(null);
  const handleManualCaptureRef = useRef<() => void>(() => {});

  type TouchGesture =
    | { mode: "drag"; stickerId: string; touchId: number; ox: number; oy: number; startX: number; startY: number; didMove: boolean }
    | { mode: "pinch"; stickerId: string; touch1Id: number; touch2Id: number; initialDist: number; initialScale: number };
  const touchGestureRef = useRef<TouchGesture | null>(null);
  const TAP_THRESHOLD = 10;

  const bgRemovalMode = config.bgRemovalMode;
  // 관리자 설정(0-100%) → confidence 스케일(0-1). FEATHER는 0으로 나누기 방지를 위해 최소 1%로 clamp됨(useDeviceSetup 참고).
  const segmentThresh = config.segmentThreshold / 100;
  const segmentFeather = config.segmentFeather / 100;

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
      return;
    }
    let cancelled = false;

    async function initSegmenter() {
      if (!cancelled) setSegmenterStatus("loading");
      // MediaPipe WASM이 초기화 중 stdout/stderr로 찍는 내부 로그를 무시한다.
      const noop = () => {};
      const origLog = console.log;
      const origInfo = console.info;
      const origWarn = console.warn;
      console.log = noop;
      console.info = noop;
      console.warn = noop;
      try {
        // WASM 파일 접근 가능 여부 먼저 확인
        const wasmCheck = await fetch("/static/mediapipe/wasm/vision_wasm_internal.wasm", { method: "HEAD" }).catch((e) => { throw new Error(`WASM fetch failed: ${e.message}`); });
        if (!wasmCheck.ok) throw new Error(`WASM HTTP ${wasmCheck.status}: /static/mediapipe/wasm/vision_wasm_internal.wasm`);
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        if (cancelled) { console.log = origLog; console.info = origInfo; console.warn = origWarn; return; }
        const vision = await FilesetResolver.forVisionTasks(
          "/static/mediapipe/wasm"
        );
        if (cancelled) { console.log = origLog; console.info = origInfo; console.warn = origWarn; return; }
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "/static/mediapipe/model/selfie_multiclass_256x256.tflite",
          },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (cancelled) { segmenter.close(); console.log = origLog; console.info = origInfo; console.warn = origWarn; return; }
        segmenterRef.current = segmenter;
        setSegmenterStatus("ready");
      } catch (err) {
        console.error("MediaPipe initialization failed:", err);
        if (!cancelled) {
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          setSegmenterError(msg);
          setSegmenterStatus("error");
        }
      } finally {
        console.log = origLog;
        console.info = origInfo;
        console.warn = origWarn;
      }
    }

    initSegmenter();
    return () => {
      cancelled = true;
      segmenterRef.current?.close();
      segmenterRef.current = null;
      lastMaskRef.current = null;
      lastInferenceTimeRef.current = 0;
    };
  }, [bgRemovalMode]);

  // 손바닥(Open_Palm) 제스처 인식기 초기화 — 배경 제거 모드와 무관하게 항상 동작.
  // 배경제거용 ImageSegmenter와 같은 tasks-vision 패키지·WASM 파일셋을 재사용한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // WASM 초기화 중 내부 stdout/stderr 로그 억제 (세그멘터 init과 동일 처리)
      const noop = () => {};
      const origLog = console.log, origInfo = console.info, origWarn = console.warn;
      console.log = noop; console.info = noop; console.warn = noop;
      try {
        const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks("/static/mediapipe/wasm");
        if (cancelled) return;
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/static/mediapipe/model/gesture_recognizer.task" },
          runningMode: "VIDEO",
          numHands: 1,
        });
        if (cancelled) { recognizer.close(); return; }
        gestureRef.current = recognizer;
      } catch {
        // 초기화 실패 시 제스처 촬영만 비활성 — 버튼 촬영은 그대로 동작
      } finally {
        console.log = origLog; console.info = origInfo; console.warn = origWarn;
      }
    })();
    return () => {
      cancelled = true;
      gestureRef.current?.close();
      gestureRef.current = null;
    };
  }, []);

  // 손바닥을 펼쳐 보이면 "촬영하기" 버튼 클릭과 동일하게 촬영을 트리거한다.
  // - 세그멘터와 동시 구동 부하를 줄이려 추론은 스로틀링.
  // - HOLD_MS 이상 유지돼야 발동(순간 오탐 방지).
  // - 한 번 촬영하면 손을 내렸다(비-손바닥 프레임) 다시 펴야 재발동(연속 오발 방지).
  //   촬영 중(countdown)에는 capturePhoto 내부 가드가 재트리거를 막는다.
  useEffect(() => {
    let raf = 0;
    const GESTURE_INTERVAL_MS = 200;
    const HOLD_MS = 500;
    const MIN_SCORE = 0.6;
    let lastInfer = 0;
    let palmSince = 0;
    let armed = true;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const recognizer = gestureRef.current;
      const video = videoRef.current;
      if (!recognizer || !video || video.readyState < 2 || !video.videoWidth) return;
      const now = performance.now();
      if (now - lastInfer < GESTURE_INTERVAL_MS) return;
      lastInfer = now;

      let isPalm = false;
      try {
        const res = recognizer.recognizeForVideo(video, now);
        const g = res.gestures?.[0]?.[0];
        isPalm = g?.categoryName === "Open_Palm" && g.score >= MIN_SCORE;
      } catch {
        return;
      }

      if (isPalm) {
        if (palmSince === 0) palmSince = now;
        if (armed && now - palmSince >= HOLD_MS) {
          armed = false;
          handleManualCaptureRef.current();
        }
      } else {
        palmSince = 0;
        armed = true;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

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

  const startCamera = useCallback(async () => {
    for (let attempt = 0; ; attempt++) {
      // 기존 스트림 먼저 정리
      stopCamera();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        cameraStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(null);
        return;
      } catch (err) {
        const e = err as DOMException;
        if (e.name === "NotReadableError" && attempt === 0) {
          // 다른 컨텍스트가 아직 카메라를 점유 중 → 800ms 후 한 번 재시도
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        if (e.name === "NotAllowedError") {
          setCameraError({ key: "camera.errPermission" });
        } else if (e.name === "NotFoundError") {
          setCameraError({ key: "camera.errNotFound" });
          // 진단: 브라우저 레벨 장치 목록 + OS 레벨 장치 목록 수집
          navigator.mediaDevices?.enumerateDevices().then(async (devices) => {
            const videoInputs = devices.filter((d) => d.kind === "videoinput");
            const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
            let osCameras: string[] = [];
            if (isTauri) {
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                osCameras = await invoke<string[]>("get_cameras");
              } catch { /* ignore */ }
            }
            const diag = `브라우저 장치: ${videoInputs.length}개 | OS 장치: ${osCameras.length > 0 ? osCameras.join(", ") : "없음"}`;
            setCameraDeviceDiag(diag);
          }).catch(() => {});
        } else if (e.name === "NotReadableError") {
          setCameraError({ key: "camera.errBusy" });
        } else {
          setCameraError({ key: "camera.errGeneric", reason: e.name || e.message });
        }
        return;
      }
    }
  }, [stopCamera]);

  useEffect(() => {
    let active = true;
    (async () => {
      await startCamera();
      // 획득이 (재시도 대기 등으로) 늦어지는 동안 언마운트됐다면, 뒤늦게 잡힌
      // 스트림을 정리한다. 안 그러면 카메라가 계속 점유돼 CameraStreamer가
      // 재획득하지 못하고 서브 모니터가 멈춘다.
      if (!active) stopCamera();
    })();
    return () => {
      active = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // DB 스티커 이미지 목록 로드
  useEffect(() => {
    fetch(`/api/image/list/3/?device_id=${config.deviceId}`)
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

  // pxScale: 표시 캔버스(display) 대비 축소 배율 — 다운스케일 스냅샷에서 스티커
  // 상대 크기가 유지되도록 픽셀 단위 크기에 곱한다.
  const drawStickers = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, pxScale = 1) => {
    stickersRef.current.forEach((s) => {
      if (s.src) {
        const img = stickerImgCacheRef.current.get(s.src);
        if (img) {
          const size = Math.round(s.scale * 120 * pxScale);
          ctx.drawImage(img, s.x * w - size / 2, s.y * h - size / 2, size, size);
        }
      } else if (s.emoji) {
        const fontSize = Math.round(s.scale * 72 * pxScale);
        ctx.font = `${fontSize}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.emoji, s.x * w, s.y * h);
      }
    });
  }, []);

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
  }, [drawStickers]);

  // 스티커 전용 오버레이 캔버스 루프 — 메인 합성 루프와 독립적으로 60fps 렌더
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const display = displayCanvasRef.current;
      const layer = stickerCanvasRef.current;
      if (!display || !layer || !display.width || !display.height) return;
      if (layer.width !== display.width) layer.width = display.width;
      if (layer.height !== display.height) layer.height = display.height;
      const ctx = layer.getContext("2d")!;
      ctx.clearRect(0, 0, layer.width, layer.height);
      drawStickers(ctx, layer.width, layer.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drawStickers]);

  useEffect(() => {
    const offscreen = document.createElement("canvas");
    const HARD = 50 * 50;
    const SOFT = 100 * 100;
    // 배경제거(마스크 계산 + getImageData/putImageData) 처리 해상도를 낮춰 프레임 드롭을 줄인다.
    // 최종 표시/캡처는 여전히 네이티브 해상도(display 캔버스)로 업스케일되므로 화질 손실은
    // 가장자리 마스크 정밀도 정도로 미미하고, 기존 FEATHER 블렌딩이 이를 더 가려준다.
    const PROCESS_SCALE = 0.5;
    // mediapipe 추론(segmentForVideo)은 화면 갱신보다 훨씬 무거우므로 초당 최대 이 간격으로만
    // 실행하고, 그 사이 프레임은 직전 마스크를 재사용한다 (사람 실루엣은 프레임 간 급변하지 않음).
    const INFERENCE_INTERVAL_MS = 200;

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

        if (frameChannelRef.current) {
          const now = performance.now();
          if (now - lastFrameSentRef.current > 100) {
            lastFrameSentRef.current = now;
            const dataUrl = snapshotWithStickers(0.5);
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

      offCtx.drawImage(video, 0, 0, pw, ph);

      let processed = false;

      if (bgRemovalMode === "mediapipe" && segmenterRef.current) {
        try {
          const now = performance.now();
          if (now - lastInferenceTimeRef.current >= INFERENCE_INTERVAL_MS || !lastMaskRef.current) {
            // 다운스케일된 offscreen을 입력으로 넘겨 마스크 자체를 더 작게 받는다
            // (video를 그대로 넘기면 마스크가 네이티브 해상도로 나와 다운스케일 효과가 없어짐)
            const result = segmenterRef.current.segmentForVideo(offscreen, now);
            const masks = result.confidenceMasks as ConfidenceMask[] | undefined;
            if (masks && masks.length > 0) {
              // WASM 힙 위의 뷰일 수 있으므로 다음 segmentForVideo 호출 전까지만
              // 안전하다고 가정하지 않고 복사해서 다음 추론 전까지 여러 프레임에서 재사용한다.
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
            const imageData = offCtx.getImageData(0, 0, pw, ph);
            const data = imageData.data;
            // multiclass model: masks[0]=background, masks[1..N]=hair/skin/face/clothes/other
            // foreground confidence = 1 - background confidence → preserves dark clothing
            const bgMask = cached.data;
            const maskW = cached.w;
            const maskH = cached.h;
            const THRESH = segmentThresh;
            const FEATHER = segmentFeather;
            if (bgMask.length === pw * ph) {
              for (let i = 0; i < bgMask.length; i++) {
                const fgConf = 1 - bgMask[i];
                const softAlpha = Math.max(0, Math.min(1, (fgConf - THRESH) / FEATHER));
                data[i * 4 + 3] = Math.round(softAlpha * 255);
              }
            } else {
              for (let y = 0; y < ph; y++) {
                const maskY = Math.min(maskH - 1, Math.floor((y / ph) * maskH));
                for (let x = 0; x < pw; x++) {
                  const maskX = Math.min(maskW - 1, Math.floor((x / pw) * maskW));
                  const fgConf = 1 - (bgMask[maskY * maskW + maskX] ?? 0);
                  const softAlpha = Math.max(0, Math.min(1, (fgConf - THRESH) / FEATHER));
                  data[(y * pw + x) * 4 + 3] = Math.round(softAlpha * 255);
                }
              }
            }
            offCtx.putImageData(imageData, 0, 0);
            processed = true;
          }
        } catch (err) {
          console.error("Segmentation error:", err);
        }
      } else if (bgRemovalMode === "chromakey") {
        const imageData = offCtx.getImageData(0, 0, pw, ph);
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

      // 스티커는 별도 캔버스 레이어에서 그린다 (송출 프레임에는 snapshotWithStickers로 합성)

      // syncEnabled 시 ~30fps로 합성 프레임을 output 창에 전송
      if (frameChannelRef.current) {
        const now = performance.now();
        if (now - lastFrameSentRef.current > 100) {
          lastFrameSentRef.current = now;
          const dataUrl = snapshotWithStickers(0.5);
          if (dataUrl) frameChannelRef.current?.postMessage({ type: "frame", dataUrl });
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedBackground, chromaKey, bgRemovalMode, segmentThresh, segmentFeather, drawBackground, frameChannelRef, snapshotWithStickers]);

  // 카운트다운 도중 언마운트(이전/다음 이동 등) 시 타이머가 살아남아
  // onCapture가 화면 전환 후에 실행되는 것을 막는다.
  const captureTimersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  useEffect(() => () => {
    captureTimersRef.current.forEach((t) => clearInterval(t));
    captureTimersRef.current = [];
    if (capturedPreviewTimerRef.current) clearTimeout(capturedPreviewTimerRef.current);
  }, []);

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
        const dataUrl = snapshotWithStickers(0.92);
        if (dataUrl) {
          onCapture(dataUrl, frames);
          // 촬영본 0.5초 프리뷰
          setCapturedPreview(dataUrl);
          if (capturedPreviewTimerRef.current) clearTimeout(capturedPreviewTimerRef.current);
          capturedPreviewTimerRef.current = setTimeout(() => setCapturedPreview(null), 500);
        }

        // 촬영 순간 셔터음 재생 + 플래시
        soundRef.current?.playShutter();
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
      }
    }, 1000);

    captureTimersRef.current.push(frameTimer, interval);
  }, [countdown, photos.length, maxPhotos, config.captureSeconds, onCapture, snapshotWithStickers]);

  // 자동 촬영 타이머 — setState는 전부 타이머 콜백에서 수행
  useEffect(() => {
    if (photos.length >= maxPhotos || countdown !== null) return;
    const seconds = config.cameraAutoTimerSeconds;
    if (seconds <= 0) return;

    const deadline = Date.now() + seconds * 1000;
    const init = setTimeout(() => setAutoTimer(seconds), 0);
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

    return () => {
      clearTimeout(init);
      if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    };
  }, [photos.length, maxPhotos, countdown, config.cameraAutoTimerSeconds, capturePhoto]);

  const handleManualCapture = useCallback(() => {
    if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    setAutoTimer(null);
    capturePhoto();
  }, [capturePhoto]);

  // 제스처 감지 루프가 최신 촬영 핸들러를 참조하도록 유지 (루프 재생성 없이)
  useEffect(() => { handleManualCaptureRef.current = handleManualCapture; }, [handleManualCapture]);

  const addSticker = useCallback((opts: { emoji?: string; src?: string }) => {
    const newSticker: Sticker = {
      id: `${Date.now()}-${Math.random()}`,
      ...opts,
      x: 0.5,
      y: 0.5,
      scale: 1,
    };
    onStickersChange([...stickers, newSticker]);
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
  const showBgStrip = bgRemovalMode !== "off";
  const bgOptions = backgroundImages.length > 0 ? backgroundImages : FALLBACK_BACKGROUNDS;

  return (
    <section className="w-full h-full flex relative z-10">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {flash && <div className="fixed inset-0 bg-white z-50 pointer-events-none animate-flash" />}

      {/* 좌측: 카메라 미리보기 + 배경 선택 스트립 */}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-4 px-6 py-4">
        <div
          className="camera-preview w-full aspect-video relative"
          style={{ maxWidth: showBgStrip ? "calc((100vh - 180px) * 16 / 9)" : "calc((100vh - 64px) * 16 / 9)" }}
        >
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
                  className="absolute group"
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
                    <img src={s.src} alt="sticker" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", opacity: 0 }} />
                  ) : (
                    <span style={{ color: "transparent" }}>{s.emoji}</span>
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
              <p className="text-white/60 mb-2">{t(cameraError.key, { reason: cameraError.reason ?? "" })}</p>
              <p className="text-white/40 text-xs mb-6 max-w-xs text-center min-h-[1em]">
                {cameraDeviceDiag ?? "장치 확인 중..."}
              </p>
              <div className="flex gap-3">
                <button
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                  onClick={() => startCamera()}
                >
                  {t("common.retry")}
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
            <>
              <canvas ref={displayCanvasRef} className="camera-video" />
              {/* 스티커 전용 레이어: 메인 합성 루프와 분리되어 60fps로 부드럽게 이동 */}
              <canvas ref={stickerCanvasRef} className="camera-video absolute inset-0 pointer-events-none" />
            </>
          )}
          {/* 촬영 직후 촬영본 0.5초 프리뷰 (카메라 위에 덮어씀) */}
          {capturedPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedPreview} alt="captured" className="absolute inset-0 w-full h-full object-cover z-30 rounded-[17px]" />
          )}
          {bgRemovalMode === "mediapipe" && segmenterStatus === "loading" && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white text-sm px-4 py-2 rounded-lg">
              {t("camera.aiLoading")}
            </div>
          )}
          {bgRemovalMode === "mediapipe" && segmenterStatus === "error" && (
            <div className="absolute bottom-4 left-4 bg-red-900/80 text-white text-sm px-4 py-2 rounded-lg max-w-xs">
              <div>{t("camera.aiError")}</div>
              {segmenterError && <div className="text-xs mt-1 opacity-80 break-all">{segmenterError}</div>}
            </div>
          )}
          {autoTimer !== null && countdown === null && photos.length < maxPhotos && (
            <CircularTimer value={autoTimer} total={config.cameraAutoTimerSeconds} size={72} />
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[200px] font-extrabold text-white animate-countdown" key={countdown} style={{ textShadow: "0 0 60px rgba(255,255,255,0.5)" }}>
                {countdown}
              </span>
            </div>
          )}
        </div>

        {/* 배경 선택 스트립: 촬영 중 실시간 배경 변경 */}
        {showBgStrip && (
          <div className="w-full flex justify-center shrink-0">
            <div className="flex gap-3 overflow-x-auto px-2 py-2 max-w-full">
              {bgOptions.map((bg) => {
                const isSelected = selectedBackground === bg.id;
                const isDb = "filename" in bg;
                const isVideo = isDb && (bg.filename.endsWith(".mp4") || bg.filename.endsWith(".webm"));
                return (
                  <button
                    key={bg.id}
                    className={`relative w-28 aspect-video shrink-0 rounded-xl overflow-hidden transition-all duration-200 ${
                      isSelected
                        ? "ring-[3px] ring-white shadow-lg scale-[1.06]"
                        : "ring-1 ring-white/20 opacity-60 hover:opacity-100"
                    }`}
                    style={isDb ? undefined : { background: bg.gradient }}
                    onClick={() => onBackgroundSelect(bg.id)}
                  >
                    {isDb && (isVideo ? (
                      <video src={`${imageBaseUrl}/${bg.filename}`} className="w-full h-full object-cover" muted loop autoPlay playsInline />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${imageBaseUrl}/${bg.filename}`} alt={bg.name} className="w-full h-full object-cover" />
                    ))}
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white text-lg font-bold">
                        &#10003;
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 우측: 촬영 컨트롤 패널 */}
      <div className="w-80 shrink-0 p-6 flex flex-col border-l border-white/10 bg-black/20">
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="text-xl font-bold text-white">{t("camera.title")}</h3>
          <span className="text-white/60 text-sm font-semibold tabular-nums">
            {photos.length} / {maxPhotos}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          {Array.from({ length: maxPhotos }, (_, i) => (
            <div
              key={i}
              className={`aspect-[4/3] bg-black/30 rounded-xl flex items-center justify-center border-2 overflow-hidden ${
                i === photos.length ? "border-white/50" : "border-white/10"
              }`}
            >
              {photos[i] ? (
                <img src={photos[i]} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white/30 text-xl">{i + 1}</span>
              )}
            </div>
          ))}
        </div>

        <button
          className="service-button w-full py-5 rounded-2xl text-xl mb-6"
          onClick={handleManualCapture}
          style={countdown !== null || photos.length >= maxPhotos ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          &#128248; {t("camera.shoot")}
        </button>

        {/* 스티커 패널 (상시 노출) */}
        <div className="flex-1 min-h-0 flex flex-col mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/80 text-sm font-semibold">✨ {t("camera.sticker")}</span>
            {stickers.length > 0 && (
              <button
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
                onClick={() => onStickersChange([])}
              >
                {t("camera.clearStickers")}
              </button>
            )}
          </div>

          <div className="flex gap-1 mb-2">
            {(["emoji", "image"] as const).map((tab) => (
              <button
                key={tab}
                className={`flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${stickerTab === tab ? "bg-white/20 text-white" : "text-white/50 hover:text-white/70"}`}
                onClick={() => setStickerTab(tab)}
              >
                {tab === "emoji" ? t("camera.stickerEmoji") : t("camera.stickerImage")}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-black/20 rounded-2xl p-2">
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
                  {t("camera.noStickers")}
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
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
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <button className="service-button nav-button w-full" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
            &#9664; {t("common.prev")}
          </button>
          <button
            className="service-button nav-button w-full"
            onClick={onNext}
            style={!canProceed ? { opacity: 0.5, pointerEvents: "none" } : {}}
          >
            {t("common.next")} &#9654;
          </button>
        </div>
      </div>
    </section>
  );
}
