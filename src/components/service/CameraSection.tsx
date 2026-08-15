"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DeviceConfig, BGImage, Sticker } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import {
  DEFAULT_EFFECT_GESTURE,
  DEFAULT_EFFECT_DURATION,
  DEFAULT_EFFECT_TRANSITION_MS,
  DEFAULT_EFFECT_CHROMA_COLOR,
  DEFAULT_EFFECT_CHROMA_SIMILARITY,
  DEFAULT_EFFECT_CHROMA_SMOOTHNESS,
  normalizeEffectMode,
  normalizeEffectBlendMode,
  normalizeEffectTransition,
} from "@/constants/images";
import { getCameraResolution } from "@/constants/camera";
import { fillGradientFromCSS, computeCaptureSize, drawCoverSource } from "@/lib/canvas";
import { useFrameSender } from "@/hooks/useSceneSync";
import { useAutoCaptureTimer } from "@/hooks/useAutoCaptureTimer";
import { createSoundPlayer, type SoundPlayer } from "@/lib/sounds";
import { CircularTimer } from "@/components/service/CircularTimer";
import { useDebug } from "@/components/service/DebugContext";
import { suppressMediapipeLogs } from "@/lib/suppressMediapipeLogs";
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

// 크로마키 이펙트 오버레이를 키잉하는 캔버스 해상도(4:3). 프레임마다 getImageData를 돌리므로
// 프리뷰 원해상도 대신 이 크기로 다운스케일해 부담을 줄이고, CSS로 프리뷰에 맞춰 늘린다.
const EFFECT_CHROMA_W = 640;
const EFFECT_CHROMA_H = 480;

export function CameraSection({
  config,
  photos,
  maxPhotos,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  stickers,
  syncEnabled = false,
  onCapture,
  onNext,
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
  const { debug } = useDebug();
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmenterRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  // mediapipe 추론(segmentForVideo)은 무거우므로 매 프레임 돌리지 않고 스로틀링해서
  // 재사용한다 — 화면 갱신(최대 60fps)과 AI 추론(간격은 INFERENCE_INTERVAL_MS)을 분리해 끊김을 줄인다.
  // 추론(200ms 간격)마다 alpha 마스크를 이 캔버스에 한 번만 굽고, 매 프레임에는
  // GPU 합성(destination-in)으로만 적용한다 — per-frame getImageData/픽셀 루프 제거.
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskReadyRef = useRef(false);
  const lastInferenceTimeRef = useRef(0);
  // 촬영 순간에만 쓰는 고해상도 합성 캔버스(프리뷰 1440 상한과 별개로 원본 해상도로 캡처).
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const capturePersonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // 제스처 루프(deps [])가 촬영 진행 여부를 알 수 있도록 countdown을 ref로도 유지.
  const countdownRef = useRef<number | null>(null);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  const [cameraError, setCameraError] = useState<{ key: MessageKey; reason?: string } | null>(null);
  const [flash, setFlash] = useState(false);
  // 촬영 직후 촬영본을 1초간 프리뷰로 보여준다.
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const capturedPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [segmenterStatus, setSegmenterStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [segmenterError, setSegmenterError] = useState<string | null>(null);
  // ── 성능 계측(A) & 세그멘테이션 델리게이트 토글(B) — 운영자 디버그 모드에서만 노출 ──
  // 델리게이트: CPU(WASM) ↔ GPU(WebGL). 값이 바뀌면 아래 initSegmenter effect가 세그멘터를
  // 재생성한다. localStorage에 저장돼 앱 재시작에도 유지된다(SSR 기본 false → effect에서 복원).
  // 기본값 GPU(WebGL). 운영자가 디버그 토글로 명시적으로 CPU를 선택한 경우에만 CPU로 복원한다.
  const [useGpuDelegate, setUseGpuDelegate] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { setUseGpuDelegate(localStorage.getItem("photobooth_seg_delegate") !== "cpu"); } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const setDelegate = useCallback((gpu: boolean) => {
    setUseGpuDelegate(gpu);
    try { localStorage.setItem("photobooth_seg_delegate", gpu ? "gpu" : "cpu"); } catch {}
  }, []);
  // 프레임 레이트(표시 루프)와 추론/마스크 생성 시간(ms)을 perfRef에 누적하고 0.5초마다 표시 상태로 flush.
  const perfRef = useRef({ frames: 0, lastFlush: 0, inferMs: 0, maskMs: 0 });
  const [perf, setPerf] = useState({ fps: 0, inferMs: 0, maskMs: 0 });
  // 무-deps rAF 루프가 최신 debug 값을 읽도록 ref로 보관 — 디버그가 꺼진 손님 세션에선
  // 0.5초마다의 setPerf 리렌더를 건너뛴다(계측 자체는 가벼워 항상 누적).
  const debugRef = useRef(debug);
  useEffect(() => { debugRef.current = debug; }, [debug]);
  const [cameraDeviceDiag, setCameraDeviceDiag] = useState<string | null>(null);
  const [dbStickerImages, setDbStickerImages] = useState<Array<{ id: number; filename: string; name: string }>>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  // 세로/가로에 따라 촬영 화면 그리드를 전환한다 (인라인 grid-template이라 Tailwind portrait: 로는 못 바꿈).
  // 창(matchMedia)이 아니라 섹션 컨테이너의 실제 비율로 판단 → 관리자 미리보기(스케일된 스테이지)에서도 정확.
  const sectionRef = useRef<HTMLElement>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const update = () => setIsPortrait(el.clientHeight > el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

  // 동작 트리거 이펙트 영상 — 현재 선택된 배경에 붙은 이펙트가 있으면 모드에 따라 반영.
  // 레이어 순서는 항상 배경 → 이펙트 → 사람(카메라). 즉 이펙트는 사람 뒤에서 합성된다.
  //  · dissolve  : 배경 위에 블렌드(globalCompositeOperation)로 1회 재생
  //  · chromakey : 키 색상을 제거한 프레임을 배경 위에 1회 재생
  //  · transition: 트리거 시 배경↔영상 토글(크로스페이드). 다시 트리거하면 원배경 복귀.
  const backEffectRef = useRef<HTMLVideoElement | null>(null);  // dissolve/chromakey 프레임 소스(명령형 <video>)
  const effectCanvasRef = useRef<HTMLCanvasElement | null>(null); // chromakey 키잉 결과(오프스크린)
  const effectBgVideoRef = useRef<HTMLVideoElement | null>(null); // transition 배경용 이펙트 영상(루프)
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectDurationRef = useRef(0);
  // 합성 루프(무-deps)가 최신 표시 상태를 읽도록 ref로 보관 + 페이드용 현재 알파(0~1).
  const effectVisibleRef = useRef(false);
  const effectAlphaRef = useRef(0);
  // transition 토글 상태: active=배경이 이펙트 영상으로 전환됨. startedAt=현재 전환 시작 시각(크로스페이드 진행 계산).
  const transitionActiveRef = useRef(false);
  const transitionStartRef = useRef(0);
  const [effectVisible, setEffectVisible] = useState(false);
  useEffect(() => { effectVisibleRef.current = effectVisible; }, [effectVisible]);
  const currentBgEffect = useMemo(() => {
    if (selectedBackground === null || selectedBackground <= 0) return null;
    const bg = backgroundImages.find((b) => b.id === selectedBackground);
    if (!bg?.effectFilename) return null;
    const [r, g, b] = (bg.effectChromaColor || DEFAULT_EFFECT_CHROMA_COLOR).split(",").map(Number);
    return {
      src: `${imageBaseUrl}/${bg.effectFilename}`,
      durationMs: (bg.effectDuration ?? DEFAULT_EFFECT_DURATION) * 1000,
      gesture: bg.effectGesture || DEFAULT_EFFECT_GESTURE,
      mode: normalizeEffectMode(bg.effectMode),
      blendMode: normalizeEffectBlendMode(bg.effectBlendMode),
      transition: normalizeEffectTransition(bg.effectTransition),
      transitionMs: bg.effectTransitionMs ?? DEFAULT_EFFECT_TRANSITION_MS,
      chromaRgb: [r ?? 0, g ?? 255, b ?? 0] as [number, number, number],
      chromaSimilarity: bg.effectChromaSimilarity ?? DEFAULT_EFFECT_CHROMA_SIMILARITY,
      chromaSmoothness: bg.effectChromaSmoothness ?? DEFAULT_EFFECT_CHROMA_SMOOTHNESS,
    };
  }, [selectedBackground, backgroundImages, imageBaseUrl]);
  useEffect(() => { effectDurationRef.current = currentBgEffect?.durationMs ?? 0; }, [currentBgEffect]);
  // 감지/그리기 루프(무-deps)가 최신 값을 읽도록 ref로 보관.
  const effectGestureRef = useRef<string>(DEFAULT_EFFECT_GESTURE);
  useEffect(() => { effectGestureRef.current = currentBgEffect?.gesture ?? DEFAULT_EFFECT_GESTURE; }, [currentBgEffect]);
  const currentBgEffectRef = useRef(currentBgEffect);
  useEffect(() => { currentBgEffectRef.current = currentBgEffect; }, [currentBgEffect]);

  // chromakey 오버레이: 이펙트 영상 프레임을 캔버스에 그리고 키 색상을 제거한다(메인 크로마키와 동일 파생 규칙).
  // 프레임 1장만 그리며, 반복은 아래 effectVisible 기반 useEffect 루프가 담당한다(자기참조 rAF 회피).
  const drawChromaOnce = useCallback(() => {
    const v = backEffectRef.current;
    const info = currentBgEffectRef.current;
    if (!v || !info || v.readyState < 2 || !v.videoWidth) return;
    let c = effectCanvasRef.current;
    if (!c) { c = document.createElement("canvas"); effectCanvasRef.current = c; }
    if (c.width !== EFFECT_CHROMA_W) c.width = EFFECT_CHROMA_W;
    if (c.height !== EFFECT_CHROMA_H) c.height = EFFECT_CHROMA_H;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx || !drawCoverSource(cx, v, EFFECT_CHROMA_W, EFFECT_CHROMA_H)) return;
    const img = cx.getImageData(0, 0, EFFECT_CHROMA_W, EFFECT_CHROMA_H);
    const d = img.data;
    const [kr, kg, kb] = info.chromaRgb;
    const simDist = Math.max(1, info.chromaSimilarity);
    const softDist = simDist * (1 + Math.max(0, info.chromaSmoothness) / 50);
    const softBand = Math.max(1e-6, softDist - simDist);
    const HARD = simDist * simDist;
    const SOFT = softDist * softDist;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr;
      const dg = d[i + 1] - kg;
      const db = d[i + 2] - kb;
      const distSq = dr * dr + dg * dg + db * db;
      if (distSq < HARD) d[i + 3] = 0;
      else if (distSq < SOFT) d[i + 3] = Math.round(((Math.sqrt(distSq) - simDist) / softBand) * 255);
    }
    cx.putImageData(img, 0, 0);
  }, []);

  // chromakey 이펙트가 보이는 동안에만 키잉 프레임을 매 프레임 갱신한다.
  useEffect(() => {
    if (!effectVisible || currentBgEffect?.mode !== "chromakey") return;
    let raf = 0;
    const loop = () => { drawChromaOnce(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [effectVisible, currentBgEffect, drawChromaOnce]);

  const stopEffect = useCallback(() => {
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    // 재생만 멈추고 현재 프레임/키잉 결과는 남겨 둔다 — 합성 루프의 알파 페이드아웃이 자연스럽게 사라지게 한다.
    backEffectRef.current?.pause();
    setEffectVisible(false);
  }, []);

  // dissolve/chromakey 1회 재생: 처음부터 재생 + 오버레이 표시. 지정 시간 경과 또는 영상 종료(onEnded) 시 정지.
  const playEffect = useCallback(() => {
    const v = backEffectRef.current;
    const durationMs = effectDurationRef.current;
    if (!v || durationMs <= 0) return;
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    setEffectVisible(true);
    try { v.currentTime = 0; } catch {}
    // 카운트다운 중 재트리거면 duration 타이머·onEnded로 중간에 꺼지지 않게 loop로 유지한다.
    // (capturePhoto가 스냅샷 후 loop 해제·정리 — 재발동 시에도 사진에 이펙트가 담기도록.)
    const holding = countdownRef.current !== null;
    v.loop = holding;
    const p = v.play();
    if (p) p.catch(() => {});
    if (!holding) effectTimerRef.current = setTimeout(stopEffect, durationMs);
  }, [stopEffect]);

  // 트리거 발동 시 모드별 분기: transition은 배경 토글, 그 외는 오버레이 1회 재생.
  const onEffectTrigger = useCallback(() => {
    const info = currentBgEffectRef.current;
    if (!info) return;
    if (info.mode === "transition") {
      transitionActiveRef.current = !transitionActiveRef.current;
      transitionStartRef.current = performance.now();
    } else {
      playEffect();
    }
  }, [playEffect]);

  // 제스처 감지 루프가 최신 트리거 핸들러를 참조하도록 유지 (루프 재생성 없이)
  const onEffectTriggerRef = useRef<() => void>(() => {});
  useEffect(() => { onEffectTriggerRef.current = onEffectTrigger; }, [onEffectTrigger]);

  // transition 모드일 때 배경으로 쓸 이펙트 영상을 루프 재생으로 준비한다.
  useEffect(() => {
    effectBgVideoRef.current = null;
    transitionActiveRef.current = false;
    const info = currentBgEffect;
    if (!info || info.mode !== "transition") return;
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.src = info.src;
    vid.play().catch(() => {});
    effectBgVideoRef.current = vid;
    return () => { vid.pause(); vid.src = ""; effectBgVideoRef.current = null; };
  }, [currentBgEffect]);

  // dissolve/chromakey 프레임 소스 영상을 명령형으로 생성한다. 크로마키는 drawChromaOnce가
  // getImageData로 픽셀을 읽고, dissolve는 표시 캔버스에 그려져 toDataURL 캡처에 들어가므로,
  // 교차 출처(Supabase) 영상은 crossOrigin을 src보다 먼저 지정해 CORS 모드로 로드해야 캔버스
  // 오염(SecurityError) 없이 키잉·캡처가 된다. (JSX <video src crossOrigin>은 속성 적용 순서가
  // 보장되지 않아 no-cors로 로드→오염될 수 있어 명령형으로 만든다.)
  useEffect(() => {
    backEffectRef.current = null;
    const info = currentBgEffect;
    if (!info || (info.mode !== "dissolve" && info.mode !== "chromakey")) return;
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = info.src;
    v.addEventListener("ended", stopEffect);
    backEffectRef.current = v;
    return () => {
      v.removeEventListener("ended", stopEffect);
      v.pause();
      v.src = "";
      backEffectRef.current = null;
    };
  }, [currentBgEffect, stopEffect]);

  // 배경/모드가 바뀌면 재생 중이던 이펙트와 전환 상태를 정리한다. 프레임 소스 <video>는 위 effect가
  // src/모드 변경 시 새로 만들며 재생이 멈추므로, 여기서는 타이머/토글만 정리하고 표시 상태 리셋은
  // 콜백으로 미룬다(effect 본문 동기 setState 회피).
  useEffect(() => {
    if (effectTimerRef.current) { clearTimeout(effectTimerRef.current); effectTimerRef.current = null; }
    transitionActiveRef.current = false;
    const t = setTimeout(() => setEffectVisible(false), 0);
    return () => clearTimeout(t);
  }, [currentBgEffect?.src, currentBgEffect?.mode]);

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

  // MediaPipe/TFLite 내부 로그(console.error로 나오는 INFO 등)가 Next dev 에러 오버레이를
  // 띄워 화면을 가리는 것을 방지한다.
  useEffect(() => { suppressMediapipeLogs(); }, []);

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
      // play() 실패(소스 미지원 등) 시 unhandled rejection 방지
      vid.play().catch(() => {});
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
            // CPU(WASM) ↔ GPU(WebGL) 전환. 디버그 토글(B)이 이 값을 바꾸면 effect가 재생성.
            delegate: useGpuDelegate ? "GPU" : "CPU",
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
      maskReadyRef.current = false;
      lastInferenceTimeRef.current = 0;
    };
  }, [bgRemovalMode, useGpuDelegate]);

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
  // - 재발동(re-arm): (1) 손을 내리면(비-손바닥 프레임) 즉시, 또는 (2) 촬영이 끝난 뒤
  //   REARM_COOLDOWN_MS가 지나면 손바닥을 계속 든 상태에서도 자동으로. 포토부스 사용자가
  //   손을 든 채 연속 촬영할 수 있게 하되, 촬영 직후 즉시 재발동되진 않도록 쿨다운을 둔다.
  //   촬영 중(countdown)에는 capturePhoto 내부 가드가 재트리거를 막는다.
  useEffect(() => {
    let raf = 0;
    const GESTURE_INTERVAL_MS = 200;
    const HOLD_MS = 500;
    const REARM_COOLDOWN_MS = 1200; // 촬영 완료 후 손바닥 유지 시 자동 재발동까지의 간격
    const MIN_SCORE = 0.6;
    let lastInfer = 0;
    let palmSince = 0;
    let palmArmed = true;
    let rearmAt = 0;          // >0: 이 시각 이후 손바닥 유지 상태에서 자동 재무장
    let prevCapturing = false; // 직전 틱의 촬영(countdown) 진행 여부
    // V사인(트리거 제스처) → 배경 이펙트 영상. 손바닥과 독립적으로 arming을 관리한다.
    let triggerSince = 0;
    let triggerArmed = true;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const recognizer = gestureRef.current;
      const video = videoRef.current;
      if (!recognizer || !video || video.readyState < 2 || !video.videoWidth) return;
      const now = performance.now();
      if (now - lastInfer < GESTURE_INTERVAL_MS) return;
      lastInfer = now;

      let name: string | undefined;
      let score = 0;
      try {
        const res = recognizer.recognizeForVideo(video, now);
        const g = res.gestures?.[0]?.[0];
        name = g?.categoryName;
        score = g?.score ?? 0;
      } catch {
        return;
      }

      const isPalm = name === "Open_Palm" && score >= MIN_SCORE;
      const isTrigger = !!name && name === effectGestureRef.current && score >= MIN_SCORE;

      // 촬영이 끝나는 순간(진행중 true→false)에 쿨다운 시작 → 이후 손바닥 유지 시 자동 재무장.
      const capturing = countdownRef.current !== null;
      if (prevCapturing && !capturing) rearmAt = now + REARM_COOLDOWN_MS;
      prevCapturing = capturing;

      // 손바닥 → 촬영
      if (isPalm) {
        if (palmSince === 0) palmSince = now;
        // 손을 든 채로도 촬영 완료 + 쿨다운 경과 시 자동 재무장(포토부스 연속 촬영).
        if (!palmArmed && !capturing && rearmAt > 0 && now >= rearmAt) {
          palmArmed = true;
          palmSince = now;
          rearmAt = 0;
        }
        if (palmArmed && now - palmSince >= HOLD_MS) {
          palmArmed = false;
          rearmAt = 0;
          handleManualCaptureRef.current();
        }
      } else {
        // 손을 내리면 즉시 재무장.
        palmSince = 0;
        palmArmed = true;
        rearmAt = 0;
      }

      // 트리거 제스처 → 이펙트 발동(모드별 분기). 한 번 발동 후 손을 내렸다 다시 취해야 재발동.
      if (isTrigger) {
        if (triggerSince === 0) triggerSince = now;
        if (triggerArmed && now - triggerSince >= HOLD_MS) {
          triggerArmed = false;
          onEffectTriggerRef.current();
        }
      } else {
        triggerSince = 0;
        triggerArmed = true;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const src = bgSourceRef.current;
    const info = currentBgEffectRef.current;
    const eff = effectBgVideoRef.current;

    // transition 모드: 원배경(src)과 이펙트 영상(eff)을 토글 전환. 진행 중이면 크로스페이드.
    if (info && info.mode === "transition" && eff && src) {
      const active = transitionActiveRef.current;
      const toSource: CanvasImageSource = active ? eff : src;
      const fromSource: CanvasImageSource = active ? src : eff;
      const dur = info.transition === "cut" ? 0 : info.transitionMs;
      const progress = dur <= 0 ? 1 : Math.max(0, Math.min(1, (performance.now() - transitionStartRef.current) / dur));
      if (progress >= 1) {
        if (!drawCoverSource(ctx, toSource, w, h)) drawCoverSource(ctx, fromSource, w, h);
      } else {
        drawCoverSource(ctx, fromSource, w, h);
        ctx.save();
        ctx.globalAlpha = progress;
        drawCoverSource(ctx, toSource, w, h);
        ctx.restore();
      }
      return;
    }

    // 일반: 선택된 배경(이미지/동영상)을 cover로 그린다.
    if (src) {
      if (!drawCoverSource(ctx, src, w, h)) ctx.drawImage(src, 0, 0, w, h);
    } else if (selectedBackground !== null && selectedBackground < 0) {
      const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === selectedBackground);
      if (fb) fillGradientFromCSS(ctx, w, h, fb.gradient);
      else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, w, h); }
    } else {
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, w, h);
    }
  }, [selectedBackground]);

  // 이펙트 레이어(배경 위·사람 아래)를 주어진 알파로 그린다. 알파 이징(진행)은 호출부(프리뷰 루프)가
  // 담당하고, 이 함수는 그리기만 한다 — 프리뷰 루프와 고해상도 캡처가 함께 재사용한다.
  const drawEffectLayer = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) => {
    const info = currentBgEffectRef.current;
    if (!info || alpha < 0.01) return;
    if (info.mode === "dissolve") {
      const v = backEffectRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      // "normal"은 캔버스 합성 연산 "source-over"에 대응. 그 외(screen/lighten/…)는 그대로 유효.
      const op = info.blendMode === "normal" ? "source-over" : info.blendMode;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = op as GlobalCompositeOperation;
      drawCoverSource(ctx, v, w, h);
      ctx.restore();
    } else if (info.mode === "chromakey") {
      const ec = effectCanvasRef.current;
      if (!ec) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawCoverSource(ctx, ec, w, h);
      ctx.restore();
    }
  }, []);

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
        // 관리자 설정 해상도(화질)로 촬영. 모든 티어가 4:3이라 슬롯(4:3) 대비 좌우 잘림이 없다.
        // (프린트 합성 시 슬롯 비율로 center-crop 되므로 원본이 4:3이면 잘림이 사라진다)
        // ideal이므로 카메라가 미지원하면 가장 가까운 해상도로 대체된다.
        const res = getCameraResolution(config.cameraResolution);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: res.width }, height: { ideal: res.height }, aspectRatio: { ideal: 4 / 3 } },
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
  }, [stopCamera, config.cameraResolution]);

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

  // DB 스티커 이미지 목록 로드 — 지점별 뱅크(선택된 스티커, 순서대로)
  useEffect(() => {
    fetch(`/api/device/${config.deviceId}/stickers/`, { cache: "no-store" })
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
      const pctx = person.getContext("2d", { willReadFrequently: bgRemovalMode === "chromakey" });
      let built = false;
      if (pctx) {
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
          const d = img.data;
          const { r: kr, g: kg, b: kb } = chromaKey;
          const simDist = Math.max(1, config.chromakeySimilarity);
          const softDist = simDist * (1 + Math.max(0, config.chromakeySmoothness) / 50);
          const softBand = Math.max(1e-6, softDist - simDist);
          const HARD = simDist * simDist;
          const SOFT = softDist * softDist;
          for (let i = 0; i < d.length; i += 4) {
            const dr = d[i] - kr;
            const dg = d[i + 1] - kg;
            const db = d[i + 2] - kb;
            const distSq = dr * dr + dg * dg + db * db;
            if (distSq < HARD) d[i + 3] = 0;
            else if (distSq < SOFT) d[i + 3] = Math.round(((Math.sqrt(distSq) - simDist) / softBand) * 255);
          }
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
  }, [bgRemovalMode, chromaKey, config.chromakeySimilarity, config.chromakeySmoothness, drawBackground, drawEffectLayer, drawStickers]);

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
    // 크로마키 감도(색상 허용 거리). 높을수록 키 색과 더 먼 색까지 제거한다.
    // hardDist=감도(완전 제거) / softDist=경계 페더 바깥 경계 = simDist×(1+부드러움/50).
    // 부드러움 50 → softDist=2×simDist(예전 하드코딩과 동일), 0 → SOFT=HARD로 딱 잘림.
    const simDist = Math.max(1, config.chromakeySimilarity);
    const softDist = simDist * (1 + Math.max(0, config.chromakeySmoothness) / 50);
    const softBand = Math.max(1e-6, softDist - simDist);
    const HARD = simDist * simDist;
    const SOFT = softDist * softDist;
    // 추론 스로틀 간격. 이 간격 사이 프레임은 직전 마스크를 재사용하는데, 그동안 영상은
    // 계속 갱신되므로 마스크가 뒤처져 움직일 때 실루엣이 잔상처럼 남는다.
    // GPU(WebGL) 델리게이트는 추론이 빨라 매 프레임(0ms) 돌려 잔상을 없애고,
    // CPU(WASM)는 매 프레임이면 FPS가 급락하므로 200ms 스로틀을 유지한다.
    const INFERENCE_INTERVAL_MS = useGpuDelegate ? 0 : 200;

    // dissolve/chromakey 이펙트를 배경 위·사람 아래에 그린다(사람 뒤 레이어). 표시 상태에 따라 알파를 부드럽게 페이드.
    // 배경과 동일하게 미러 없이 그린다. transition 모드는 배경 자체를 바꾸므로 여기서 그리지 않는다.
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
          if (debugRef.current) {
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
            const dataUrl = snapshotWithStickers(0.5, 1280);
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
          // 추론(무거운 WASM 호출)은 INFERENCE_INTERVAL_MS 간격으로만 실행하고, 그때
          // soft alpha 마스크를 별도 캔버스에 한 번만 굽는다. 기존엔 매 프레임 getImageData
          // + 픽셀 루프 + putImageData를 돌려 프레임이 뚝뚝 끊겼다.
          if (now - lastInferenceTimeRef.current >= INFERENCE_INTERVAL_MS || !maskReadyRef.current) {
            // 다운스케일된 offscreen을 입력으로 넘겨 마스크 자체를 더 작게 받는다
            // (video를 그대로 넘기면 마스크가 네이티브 해상도로 나와 다운스케일 효과가 없어짐)
            const inferStart = performance.now();
            const result = segmenterRef.current.segmentForVideo(offscreen, now);
            const inferEnd = performance.now();
            const masks = result.confidenceMasks as ConfidenceMask[] | undefined;
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
              // multiclass model: masks[0]=background → foreground = 1 - background (어두운 옷 보존)
              // rgb는 흰색으로 채우고 alpha에만 soft mask를 굽는다(합성 시 alpha만 사용).
              const mImg = mctx.createImageData(mw, mh);
              const md = mImg.data;
              const THRESH = segmentThresh;
              const FEATHER = segmentFeather;
              for (let i = 0; i < arr.length; i++) {
                const fgConf = 1 - arr[i];
                const softAlpha = Math.max(0, Math.min(1, (fgConf - THRESH) / FEATHER));
                md[i * 4] = 255; md[i * 4 + 1] = 255; md[i * 4 + 2] = 255;
                md[i * 4 + 3] = Math.round(softAlpha * 255);
              }
              mctx.putImageData(mImg, 0, 0);
              lastInferenceTimeRef.current = now;
              maskReadyRef.current = true;
              // 계측: 추론(segmentForVideo)과 마스크 굽기(getAsFloat32Array+픽셀루프+putImageData)를 분리 기록.
              perfRef.current.inferMs = inferEnd - inferStart;
              perfRef.current.maskMs = performance.now() - inferEnd;
            }
          }

          // 매 프레임: 준비된 마스크를 GPU 합성(destination-in)으로만 적용 → 픽셀 루프 없음.
          // 마스크를 pw×ph로 확대할 때 생기는 bilinear 보간이 경계를 더 부드럽게 해준다.
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
            data[i + 3] = Math.round(((Math.sqrt(distSq) - simDist) / softBand) * 255);
          }
        }
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
          const dataUrl = snapshotWithStickers(0.5, 1280);
          if (dataUrl) frameChannelRef.current?.postMessage({ type: "frame", dataUrl });
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedBackground, chromaKey, config.chromakeySimilarity, config.chromakeySmoothness, bgRemovalMode, segmentThresh, segmentFeather, useGpuDelegate, drawBackground, drawEffectLayer, frameChannelRef, snapshotWithStickers]);

  // 카운트다운 도중 언마운트(이전/다음 이동 등) 시 타이머가 살아남아
  // onCapture가 화면 전환 후에 실행되는 것을 막는다.
  const captureTimersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  useEffect(() => () => {
    captureTimersRef.current.forEach((t) => clearInterval(t));
    captureTimersRef.current = [];
    if (capturedPreviewTimerRef.current) clearTimeout(capturedPreviewTimerRef.current);
    if (effectTimerRef.current) clearTimeout(effectTimerRef.current);
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

    // 촬영 시작 시 dissolve/chromakey 이펙트가 재생 중이면 스냅샷까지 유지한다.
    // (스냅샷은 카운트다운 후에 찍히는데, 그 사이 durationMs·영상 종료로 이펙트가 꺼지면
    //  captureHiRes가 그릴 이펙트가 없어 사진에 안 담기던 문제 방지.)
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

        // 스냅샷을 마쳤으면 붙잡아 둔 이펙트를 원상복귀(루프 해제)하고 정리(페이드아웃).
        // 시작 시 hold였든 카운트다운 중 재트리거로 붙잡혔든(playEffect가 loop 유지),
        // 스냅샷 시점 실제 상태를 기준으로 정리한다 — 촬영 후 이펙트가 무한 루프하지 않도록.
        if (holdEffect || effectVisibleRef.current) {
          const ev = backEffectRef.current;
          if (ev) ev.loop = false;
          stopEffect();
        }

        // 촬영 순간 셔터음 재생 + 플래시
        soundRef.current?.playShutter();
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
      }
    }, 1000);

    captureTimersRef.current.push(frameTimer, interval);
  }, [countdown, photos.length, maxPhotos, config.captureSeconds, onCapture, snapshotWithStickers, captureHiRes, stopEffect]);

  // 자동 촬영 타이머 (훅으로 분리 — 회귀 방지 이유는 useAutoCaptureTimer 참고).
  const { autoTimer, cancel: cancelAutoTimer } = useAutoCaptureTimer({
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

  // 제스처 감지 루프가 최신 촬영 핸들러를 참조하도록 유지 (루프 재생성 없이)
  useEffect(() => { handleManualCaptureRef.current = handleManualCapture; }, [handleManualCapture]);

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

  const showBgStrip = bgRemovalMode !== "off";
  const bgOptions = backgroundImages.length > 0 ? backgroundImages : FALLBACK_BACKGROUNDS;
  // 프리뷰 컨테이너는 place-self-center로 내부 canvas의 intrinsic 크기에 맞춰 커진다.
  // 카메라 실행 시엔 canvas가 영상 해상도(4:3)로 커지지만, 실행 전엔 canvas 기본값(300×150)이라
  // 컨테이너가 작게 나온다. 실행 전에도 같은 크기가 되도록 초기 canvas 크기를 촬영 해상도로 지정한다.
  const previewRes = getCameraResolution(config.cameraResolution);

  return (
    <section
      ref={sectionRef}
      className="w-full h-full relative z-10 p-12 pb-60 portrait:pb-[22rem]"
      style={{
        display: "grid",
        gap: "1rem",
        // 세로: 제목 / 미리보기(전체폭) / 배경·스티커(하단 2분할) 스택 (시안 0013)
        // 가로: 좌측 상단은 로고 자리로 비우고, 배경·스티커 패널을 둘째 행부터 시작해 좌우 대칭.
        // (최상단 행 minmax(4.5rem) — 좌측 상단 로고 오버레이와 겹치지 않도록 최소 높이 확보)
        ...(isPortrait
          ? {
              gridTemplateColumns: showBgStrip ? "1fr 1fr" : "1fr",
              gridTemplateRows: "minmax(4.5rem, auto) minmax(0, 1.1fr) minmax(0, 1fr)",
              gridTemplateAreas: showBgStrip
                ? '"title title" "preview preview" "bg sticker"'
                : '"title" "preview" "sticker"',
            }
          : {
              gridTemplateColumns: showBgStrip ? "24rem minmax(0, 1fr) 24rem" : "minmax(0, 1fr) 24rem",
              gridTemplateRows: "minmax(4.5rem, auto) minmax(0, 1fr)",
              gridTemplateAreas: showBgStrip
                ? '". title ." "bg preview sticker"'
                : '"title ." "preview sticker"',
            }),
      }}
    >
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {flash && <div className="fixed inset-0 bg-white z-50 pointer-events-none animate-flash" />}

      <h2 className="self-center text-center text-5xl portrait:text-4xl font-extrabold text-white" style={{ gridArea: "title", textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("camera.start")}
      </h2>

      {/* 좌측: 배경 변경 패널 */}
      {showBgStrip && (
        <div className="flex flex-col min-h-0 px-2 pr-4" style={{ gridArea: "bg" }}>
          <h3 className="text-white text-xl font-bold text-center mb-4 shrink-0">{t("camera.bgChange")}</h3>
          {/* p-1: 선택 ring(요소 바깥 3px)이 스크롤 컨테이너 가장자리에서 잘리지 않도록 여백 확보 */}
          <div className="grid grid-cols-2 gap-3 overflow-y-auto flex-1 min-h-0 content-start p-1">
            {bgOptions.map((bg) => {
              const isSelected = selectedBackground === bg.id;
              const isDb = "filename" in bg;
              const isVideo = isDb && (bg.filename.endsWith(".mp4") || bg.filename.endsWith(".webm"));
              return (
                <button
                  key={bg.id}
                  className={`relative aspect-[4/3] shrink-0 rounded-xl overflow-hidden transition-all duration-200 ${
                    isSelected
                      ? "ring-[3px] ring-[var(--theme-primary,#6c6fb4)] shadow-lg"
                      : "ring-1 ring-white/20 opacity-70 hover:opacity-100"
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
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white text-lg font-bold">&#10003;</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 중앙: 카메라 미리보기 (가장 큰 셀) — 인화 비율과 동일한 4:3 */}
      <div
        className="camera-preview aspect-[4/3] max-w-full max-h-full place-self-center relative"
        style={{ gridArea: "preview" }}
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
              <canvas ref={displayCanvasRef} className="camera-video" width={previewRes.width} height={previewRes.height} />
              {/* 스티커 전용 레이어: 메인 합성 루프와 분리되어 60fps로 부드럽게 이동 */}
              <canvas ref={stickerCanvasRef} className="camera-video absolute inset-0 pointer-events-none" />
            </>
          )}
          {/* 동작 트리거 이펙트 프레임 소스(dissolve/chromakey)는 crossOrigin이 필요해 JSX가 아니라
              명령형 <video>로 만든다(위 useEffect). 실제 표시는 합성 루프(drawEffectLayer)가 배경 위·사람 아래에 그린다. */}
          {/* 촬영 직후 촬영본 0.5초 프리뷰 (카메라 위에 덮어씀) */}
          {capturedPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedPreview} alt="captured" className="absolute inset-0 w-full h-full object-cover z-30 rounded-[17px]" />
          )}
          {/* 성능 계측 + GPU 델리게이트 토글 — 디버그 모드에서만, 손님에겐 안 보임(운영자용). */}
          {debug && bgRemovalMode === "mediapipe" && (
            <div className="absolute top-4 left-4 z-40 bg-black/80 text-white text-xs font-mono px-3 py-2 rounded-lg space-y-1.5 leading-tight">
              <div className="flex justify-between gap-4"><span className="opacity-70">FPS(표시)</span><span className="tabular-nums">{perf.fps}</span></div>
              <div className="flex justify-between gap-4"><span className="opacity-70">추론 segmentForVideo</span><span className="tabular-nums">{perf.inferMs} ms</span></div>
              <div className="flex justify-between gap-4"><span className="opacity-70">마스크 생성</span><span className="tabular-nums">{perf.maskMs} ms</span></div>
              <div className="flex justify-between gap-4"><span className="opacity-70">추론 간격</span><span className="tabular-nums">200 ms</span></div>
              <div className="flex justify-between gap-4"><span className="opacity-70">상태</span><span>{segmenterStatus}</span></div>
              <div className="h-px bg-white/20 my-1" />
              <button
                type="button"
                role="switch"
                aria-checked={useGpuDelegate}
                onClick={() => setDelegate(!useGpuDelegate)}
                className="flex items-center justify-between gap-3 w-full"
              >
                <span>GPU 가속 {useGpuDelegate ? "(WebGL)" : "(끔 · CPU/WASM)"}</span>
                <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${useGpuDelegate ? "bg-emerald-500" : "bg-slate-500"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useGpuDelegate ? "translate-x-4" : "translate-x-0.5"}`} />
                </span>
              </button>
            </div>
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
            <CircularTimer value={autoTimer} total={config.cameraAutoTimerSeconds} size={72} positionClass="top-4 right-4" />
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[200px] font-extrabold text-white animate-countdown" key={countdown} style={{ textShadow: "0 0 60px rgba(255,255,255,0.5)" }}>
                {countdown}
              </span>
            </div>
          )}
        </div>

      {/* 촬영하기 — 하단 중앙. 세로에선 이전/다음보다 한 줄 위(bottom-52)에 배치해
          커진 이전/다음 버튼과 겹치지 않게 한다. */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 portrait:bottom-52">
        <button
          className="service-button tracking-widest rounded-[22px] font-extrabold text-5xl portrait:text-5xl px-28 py-8 portrait:px-20 portrait:py-12 min-w-[34rem] portrait:min-w-[46rem]"
          onClick={handleManualCapture}
          style={countdown !== null || photos.length >= maxPhotos ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          &#128248; {t("camera.shoot")}
        </button>
      </div>

      {/* 우측(가로)·우하단(세로): 스티커 패널 */}
      <div className="flex flex-col min-h-0 pl-4" style={{ gridArea: "sticker" }}>
        <h3 className="text-white text-2xl font-bold text-center mb-4 shrink-0">{t("camera.stickerPrompt")}</h3>

        {/* 스티커 패널 (상시 노출) */}
        <div className="flex flex-col min-h-0 mb-4">
          <div className="flex items-center justify-end mb-2 min-h-[22px]">
            {stickers.length > 0 && (
              <button
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
                onClick={() => onStickersChange([])}
              >
                {t("camera.clearStickers")}
              </button>
            )}
          </div>

          <div className="max-h-[42vh] overflow-y-auto bg-black/20 rounded-2xl p-2">
            {dbStickerImages.length === 0 ? (
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
            )}
          </div>
        </div>

        {/* 손바닥 촬영 안내 — 스티커와 남은 촬영 횟수 사이 여백에 강조 표시 */}
        <div className="flex-1 flex items-center justify-center px-2 min-h-0">
          <div
            className="text-center rounded-2xl px-6 py-7 border border-[var(--theme-primary,#6c6fb4)]/50 bg-[var(--theme-primary,#6c6fb4)]/10"
            style={{ boxShadow: "0 0 34px -10px var(--theme-primary, #6c6fb4)" }}
          >
            <div className="text-6xl mb-3 animate-soft-blink select-none" aria-hidden>✋</div>
            <p className="text-white font-extrabold text-2xl leading-snug break-keep">
              {t("camera.palmHint")}
            </p>
          </div>
        </div>

        {/* 남은 촬영 횟수 — 세로에선 좌측 배경 선택 패널 하단과 줄이 맞도록 위로 더 올린다. */}
        <div className="shrink-0 w-full text-center border border-dashed border-white/30 rounded-xl py-4 portrait:mb-28">
          <span className="text-white font-bold text-3xl">
            {t("camera.remaining", { n: String(Math.max(0, maxPhotos - photos.length)) })}
          </span>
        </div>
      </div>

    </section>
  );
}
