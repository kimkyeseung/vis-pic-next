"use client";

import { useEffect, useRef } from "react";
import { useFrameSender } from "@/hooks/useSceneSync";
import { fillGradientFromCSS } from "@/lib/canvas";
import { applyChromaKey } from "@/lib/chromakey";
import { applyChromaKeyYuv } from "@/lib/chromakeyYuv";
import {
  bakeAlphaMask,
  bboxToFrame,
  createMaskBaker,
  nextRoi,
  ROI_INPUT_SIZE,
  type MaskTuning,
  type Roi,
} from "@/lib/segmentMask";
import { segmentProcessScaleFor } from "@/lib/deviceConfig";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { suppressMediapipeLogs } from "@/lib/suppressMediapipeLogs";
import type { BGImage, BgRemovalMode, SegmentProcessScale } from "@/types";

type Segmenter = {
  segmentForVideo: (source: HTMLVideoElement | HTMLCanvasElement, ts: number) => {
    confidenceMasks?: Array<{ getAsFloat32Array: () => Float32Array; width?: number; height?: number }>;
  };
  close: () => void;
};

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
  chromakeySmoothness = 50,
  chromakeySpill = 0,
  chromakeyChoke = 0,
  chromakeyLumaIndependent = false,
  chromakeyYuvRgb = "0,255,0",
  chromakeyYuvSimilarity = 30,
  chromakeyYuvSmoothness = 10,
  chromakeyYuvSpill = 0,
  chromakeyYuvOpacity = 100,
  chromakeyYuvContrast = 0,
  chromakeyYuvBrightness = 0,
  chromakeyYuvGamma = 0,
  segmentThreshold = 15,
  segmentFeather = 35,
  segmentMaskBlur = 100,
  segmentEdgeShift = 0,
  segmentTemporal = 0,
  segmentRoi = true,
  segmentRoiMargin = 22,
  segmentProcessScale = "auto",
}: {
  enabled: boolean;
  sendFrames?: boolean;
  selectedBackground?: number | null;
  backgroundImages?: BGImage[];
  imageBaseUrl?: string;
  bgRemovalMode?: BgRemovalMode;
  chromakeyRgb?: string;
  /** 크로마키 감도(1-100). 메인 촬영 화면과 동일한 관리자 설정값. */
  chromakeySimilarity?: number;
  /** 크로마키 경계 부드러움(0-100). 메인 촬영 화면과 동일한 관리자 설정값. */
  chromakeySmoothness?: number;
  /** 크로마키 스필 제거 강도(0-100). 메인 촬영 화면과 동일한 관리자 설정값. */
  chromakeySpill?: number;
  /** 크로마키 경계 침식(0-100). 메인 촬영 화면과 동일한 관리자 설정값. */
  chromakeyChoke?: number;
  /** 크로마키 밝기 무시 키잉. 메인 촬영 화면과 동일한 관리자 설정값. */
  chromakeyLumaIndependent?: boolean;
  /** OBS 방식(YUV) 크로마키 색상. 메인 촬영 화면과 동일한 관리자 설정값. */
  chromakeyYuvRgb?: string;
  /** OBS 방식 크로마키 감도(1-100). */
  chromakeyYuvSimilarity?: number;
  /** OBS 방식 크로마키 경계 부드러움(0-100). */
  chromakeyYuvSmoothness?: number;
  /** OBS 방식 크로마키 스필 제거(0-100). */
  chromakeyYuvSpill?: number;
  /** OBS 방식 크로마키 결과 전체 투명도 배율(0-100). */
  chromakeyYuvOpacity?: number;
  /** OBS 방식 크로마키 결과 대비 보정(-100~100). */
  chromakeyYuvContrast?: number;
  /** OBS 방식 크로마키 결과 명암(밝기) 보정(-100~100). */
  chromakeyYuvBrightness?: number;
  /** OBS 방식 크로마키 결과 감마 보정(-100~100). */
  chromakeyYuvGamma?: number;
  /** AI 배경제거 경계 침식 (0-100%). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentThreshold?: number;
  /** AI 배경제거 경계 부드러움 (0-100%). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentFeather?: number;
  /** AI 배경제거 경계 블러 세기 (0-200%). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentMaskBlur?: number;
  /** AI 배경제거 경계 두께 (-100~100). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentEdgeShift?: number;
  /** AI 배경제거 시간축 평활 (0-100%). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentTemporal?: number;
  /** AI 배경제거 인물 추적 크롭 사용 여부. 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentRoi?: boolean;
  /** AI 배경제거 추적 여유 (0-100%). 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentRoiMargin?: number;
  /** AI 배경제거 처리 해상도 배율. 메인 촬영 화면과 동일한 관리자 설정값. */
  segmentProcessScale?: SegmentProcessScale;
}) {
  const frameChannelRef = useFrameSender(enabled && sendFrames);
  const lastSentRef = useRef(0);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const segmenterRef = useRef<Segmenter | null>(null);
  // mediapipe 추론은 무거우므로 스로틀링해서 재사용한다 (useCameraCapture와 동일한 이유).
  // 추론마다 프레임 전체를 덮는 soft-alpha 마스크를 이 캔버스에 한 번만 굽고(블러 포함),
  // 매 프레임에는 GPU 합성(destination-in)으로만 적용한다.
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskReadyRef = useRef(false);
  // 다음 추론에 쓸 인물 주변 크롭(전체 프레임 픽셀 좌표). null이면 프레임 전체를 본다.
  const roiRef = useRef<Roi | null>(null);
  const lastInferenceTimeRef = useRef(0);

  // 애니메이션 루프에서 최신 값을 읽기 위한 ref
  const selectedBgRef = useRef(selectedBackground);
  const bgRemovalModeRef = useRef(bgRemovalMode);
  const chromakeyRgbRef = useRef(chromakeyRgb);
  const chromakeySimilarityRef = useRef(chromakeySimilarity);
  const chromakeySmoothnessRef = useRef(chromakeySmoothness);
  const chromakeySpillRef = useRef(chromakeySpill);
  const chromakeyChokeRef = useRef(chromakeyChoke);
  const chromakeyLumaIndependentRef = useRef(chromakeyLumaIndependent);
  const chromakeyYuvRgbRef = useRef(chromakeyYuvRgb);
  const chromakeyYuvSimilarityRef = useRef(chromakeyYuvSimilarity);
  const chromakeyYuvSmoothnessRef = useRef(chromakeyYuvSmoothness);
  const chromakeyYuvSpillRef = useRef(chromakeyYuvSpill);
  const chromakeyYuvOpacityRef = useRef(chromakeyYuvOpacity);
  const chromakeyYuvContrastRef = useRef(chromakeyYuvContrast);
  const chromakeyYuvBrightnessRef = useRef(chromakeyYuvBrightness);
  const chromakeyYuvGammaRef = useRef(chromakeyYuvGamma);
  // 관리자 설정(0-100%)을 confidence 스케일(0-1)로 변환해 보관. FEATHER는 0으로 나누기 방지를 위해 최소 1%.
  const segmentThreshRef = useRef(segmentThreshold / 100);
  const segmentFeatherRef = useRef(Math.max(segmentFeather, 1) / 100);
  // 손 구제는 항상 0 — 이 컴포넌트엔 제스처 인식기가 없어 손 위치를 모른다. 카메라 단계가 아닌
  // 화면의 송출용이라 손동작을 쓸 일도 없다(촬영 화면은 useHandGestureCapture의 부산물을 쓴다).
  const maskTuningRef = useRef<MaskTuning>({
    blur: segmentMaskBlur, edgeShift: segmentEdgeShift, temporal: segmentTemporal,
    roi: segmentRoi, roiMargin: segmentRoiMargin, handRescue: 0,
  });
  const processScaleRef = useRef(segmentProcessScale);
  useEffect(() => { selectedBgRef.current = selectedBackground; }, [selectedBackground]);
  useEffect(() => { bgRemovalModeRef.current = bgRemovalMode; }, [bgRemovalMode]);
  useEffect(() => { chromakeyRgbRef.current = chromakeyRgb; }, [chromakeyRgb]);
  useEffect(() => { chromakeySimilarityRef.current = chromakeySimilarity; }, [chromakeySimilarity]);
  useEffect(() => { chromakeySmoothnessRef.current = chromakeySmoothness; }, [chromakeySmoothness]);
  useEffect(() => { chromakeySpillRef.current = chromakeySpill; }, [chromakeySpill]);
  useEffect(() => { chromakeyChokeRef.current = chromakeyChoke; }, [chromakeyChoke]);
  useEffect(() => { chromakeyLumaIndependentRef.current = chromakeyLumaIndependent; }, [chromakeyLumaIndependent]);
  useEffect(() => { chromakeyYuvRgbRef.current = chromakeyYuvRgb; }, [chromakeyYuvRgb]);
  useEffect(() => { chromakeyYuvSimilarityRef.current = chromakeyYuvSimilarity; }, [chromakeyYuvSimilarity]);
  useEffect(() => { chromakeyYuvSmoothnessRef.current = chromakeyYuvSmoothness; }, [chromakeyYuvSmoothness]);
  useEffect(() => { chromakeyYuvSpillRef.current = chromakeyYuvSpill; }, [chromakeyYuvSpill]);
  useEffect(() => { chromakeyYuvOpacityRef.current = chromakeyYuvOpacity; }, [chromakeyYuvOpacity]);
  useEffect(() => { chromakeyYuvContrastRef.current = chromakeyYuvContrast; }, [chromakeyYuvContrast]);
  useEffect(() => { chromakeyYuvBrightnessRef.current = chromakeyYuvBrightness; }, [chromakeyYuvBrightness]);
  useEffect(() => { chromakeyYuvGammaRef.current = chromakeyYuvGamma; }, [chromakeyYuvGamma]);
  useEffect(() => { segmentThreshRef.current = segmentThreshold / 100; }, [segmentThreshold]);
  useEffect(() => { segmentFeatherRef.current = Math.max(segmentFeather, 1) / 100; }, [segmentFeather]);
  useEffect(() => {
    maskTuningRef.current = {
      blur: segmentMaskBlur, edgeShift: segmentEdgeShift, temporal: segmentTemporal,
      roi: segmentRoi, roiMargin: segmentRoiMargin, handRescue: 0,
    };
  }, [segmentMaskBlur, segmentEdgeShift, segmentTemporal, segmentRoi, segmentRoiMargin]);
  useEffect(() => { processScaleRef.current = segmentProcessScale; }, [segmentProcessScale]);

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
      maskReadyRef.current = false;
      roiRef.current = null;
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
        // 촬영 화면(useMediapipeSegmentation)과 같은 델리게이트를 쓴다 — 기본 GPU(WebGL), 운영자가 디버그
        // 토글로 CPU를 고른 경우에만 CPU. delegate를 생략하면 CPU(WASM)로 떠서 추론마다 메인 스레드를
        // 수십 ms 막아 촬영 외 단계의 서브 모니터만 심하게 끊겼다. GPU 생성이 실패하면 CPU로 폴백한다.
        let gpu = true;
        try { gpu = localStorage.getItem("photobooth_seg_delegate") !== "cpu"; } catch {}
        const create = (delegate: "GPU" | "CPU") =>
          ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "/static/mediapipe/model/selfie_multiclass_256x256.tflite", delegate },
            runningMode: "VIDEO",
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        const seg = gpu ? await create("GPU").catch(() => create("CPU")) : await create("CPU");
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
      maskReadyRef.current = false;
      roiRef.current = null;
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
    // mediapipe 경로는 GPU 합성(destination-in)만 하므로 GPU 캔버스(offscreen)를,
    // 크로마키 경로는 매 프레임 getImageData로 픽셀을 읽으므로 CPU 백업 캔버스(keyCanvas,
    // willReadFrequently)를 쓴다 — 하나로 쓰면 어느 한쪽이 프레임마다 GPU↔CPU 동기 전송을 치른다.
    // 모드는 ref로 바뀌어 루프가 재생성되지 않으므로 둘 다 만들어 둔다.
    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d")!;
    const keyCanvas = document.createElement("canvas");
    const keyCtx = keyCanvas.getContext("2d", { willReadFrequently: true })!;
    // ROI 추론 입력(정사각 고정) — 크기가 매 프레임 같아야 MediaPipe가 텐서를 다시 안 잡는다.
    // 마스크 ImageData도 크기가 같은 동안 재사용한다(추론마다 수 MB 할당을 피한다).
    let roiCanvas: HTMLCanvasElement | null = null;
    let maskImage: ImageData | null = null;
    const baker = createMaskBaker();

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
            // 촬영(CameraSection FHD 기본)과 동일하게 4:3(1440×1080)으로 요청해 서브 모니터
            // 미러 비율을 맞추고, 송출 상한(MAX_STREAM_W=1440)까지 실제 디테일을 채운다.
            video: { width: { ideal: 1440 }, height: { ideal: 1080 }, aspectRatio: { ideal: 4 / 3 } },
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
          const channel = frameChannelRef.current;
          if (!channel) return;
          // 이 컴포넌트는 화면에 그리지 않고 송출만 한다 → 보낼 프레임(100ms 간격, 직전 전송 완료)만
          // 합성한다. 예전엔 rAF마다(60Hz) 크로마키 픽셀 루프·마스크 합성을 돌리고 6장 중 1장만 보내,
          // 버려지는 합성이 메인 스레드를 점유해 서비스 화면과 서브 모니터가 함께 버벅였다.
          const now = performance.now();
          if (now - lastSentRef.current <= 100 || channel.isBusy()) return;

          const w = video.videoWidth;
          const h = video.videoHeight;
          // 배경제거 처리 해상도. 기본("auto")은 4K(2560+)에서만 0.25로 낮춰 픽셀 연산량을 줄인다.
          const PROCESS_SCALE = segmentProcessScaleFor(processScaleRef.current, w);
          // 송출 전용 캔버스는 최대 1440px로 캡 — 서브 모니터 선명도와 JPEG 인코딩·전송 비용의 절충.
          const MAX_STREAM_W = 1440;
          const cScale = Math.min(1, MAX_STREAM_W / w);
          const cw = Math.round(w * cScale);
          const ch = Math.round(h * cScale);
          if (canvas.width !== cw) canvas.width = cw;
          if (canvas.height !== ch) canvas.height = ch;
          const pw = Math.max(1, Math.round(w * PROCESS_SCALE));
          const ph = Math.max(1, Math.round(h * PROCESS_SCALE));
          const mode = bgRemovalModeRef.current;
          const isChroma = mode === "chromakey" || mode === "chromakey-yuv";
          const work = isChroma ? keyCanvas : offscreen;
          if (work.width !== pw) work.width = pw;
          if (work.height !== ph) work.height = ph;

          const sbg = selectedBgRef.current;
          const hasBg = sbg !== null;

          if (!hasBg || mode === "off") {
            drawRaw(cw, ch);
          } else if (mode === "chromakey") {
            keyCtx.drawImage(video, 0, 0, pw, ph);
            const imgData = keyCtx.getImageData(0, 0, pw, ph);
            const [kr, kg, kb] = chromakeyRgbRef.current.split(",").map(Number);
            applyChromaKey(
              imgData.data,
              pw,
              ph,
              { r: kr ?? 0, g: kg ?? 255, b: kb ?? 0 },
              chromakeySimilarityRef.current,
              chromakeySmoothnessRef.current,
              chromakeySpillRef.current,
              chromakeyChokeRef.current,
              chromakeyLumaIndependentRef.current,
            );
            keyCtx.putImageData(imgData, 0, 0);
            drawBg(cw, ch);
            ctx.save();
            ctx.translate(cw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(keyCanvas, 0, 0, cw, ch);
            ctx.restore();
          } else if (mode === "chromakey-yuv") {
            keyCtx.drawImage(video, 0, 0, pw, ph);
            const imgData = keyCtx.getImageData(0, 0, pw, ph);
            const [kr, kg, kb] = chromakeyYuvRgbRef.current.split(",").map(Number);
            applyChromaKeyYuv(
              imgData.data,
              pw,
              ph,
              { r: kr ?? 0, g: kg ?? 255, b: kb ?? 0 },
              chromakeyYuvSimilarityRef.current,
              chromakeyYuvSmoothnessRef.current,
              chromakeyYuvSpillRef.current,
              chromakeyYuvOpacityRef.current,
              chromakeyYuvContrastRef.current,
              chromakeyYuvBrightnessRef.current,
              chromakeyYuvGammaRef.current,
            );
            keyCtx.putImageData(imgData, 0, 0);
            drawBg(cw, ch);
            ctx.save();
            ctx.translate(cw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(keyCanvas, 0, 0, cw, ch);
            ctx.restore();
          } else if (mode === "mediapipe" && segmenterRef.current) {
            // 촬영 화면(useCameraCapture)과 같은 마스크 파이프라인 — ROI 크롭 추론 + 공간 블러로
            // 256 격자 계단을 줄이고, 굽는 건 추론마다 한 번, 매 프레임에는 GPU 합성(destination-in)만
            // 한다. 예전엔 프레임마다 pw×ph 픽셀 루프로 알파를 다시 썼다(src/lib/segmentMask.ts 참고).
            try {
              offCtx.drawImage(video, 0, 0, pw, ph);

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

              if (now - lastInferenceTimeRef.current >= INFERENCE_INTERVAL_MS || !maskReadyRef.current) {
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
                  const arr = masks[0].getAsFloat32Array();
                  const mw = masks[0].width ?? (crop ? ROI_INPUT_SIZE : pw);
                  const mh = masks[0].height ?? (crop ? ROI_INPUT_SIZE : ph);
                  if (!maskImage || maskImage.width !== mw || maskImage.height !== mh) maskImage = new ImageData(mw, mh);
                  // 이 컴포넌트는 멀티클래스 모델만 쓴다 → masks[0]=배경(전경 = 1 - v).
                  const bbox = bakeAlphaMask(arr, maskImage.data, mw, mh, {
                    fgIsMask0: false,
                    thresh: segmentThreshRef.current,
                    feather: segmentFeatherRef.current,
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
                drawBg(cw, ch);
                ctx.save();
                ctx.translate(cw, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(offscreen, 0, 0, cw, ch);
                ctx.restore();
              } else {
                drawRaw(cw, ch);
              }
            } catch {
              drawRaw(cw, ch);
            }
          } else {
            // MediaPipe 아직 로딩 중 → raw 카메라로 폴백
            drawRaw(cw, ch);
          }

          if (channel.sendCanvas(canvas, 0.85)) lastSentRef.current = now;
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
