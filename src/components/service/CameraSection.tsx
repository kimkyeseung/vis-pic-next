"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { DeviceConfig, BGImage, Sticker } from "@/types";
import type { MaskTuning } from "@/lib/segmentMask";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { DEFAULT_EFFECT_GESTURE, getGestureEmoji } from "@/constants/images";
import { getCameraResolution } from "@/constants/camera";
import { useFrameSender } from "@/hooks/useSceneSync";
import { CircularTimer } from "@/components/service/CircularTimer";
import { useDebug } from "@/components/service/DebugContext";
import { SERVICE_BIG_BUTTON_CLASS } from "./sectionLayout";
import { suppressMediapipeLogs } from "@/lib/suppressMediapipeLogs";
import { useLanguage } from "@/i18n/LanguageContext";
import { useSegmentationDebugSettings } from "./camera/useSegmentationDebugSettings";
import { BackgroundPickerPanel } from "./camera/BackgroundPickerPanel";
import { SegmentationDebugPanel } from "./camera/SegmentationDebugPanel";
import { useStickers } from "./camera/useStickers";
import { useCameraLifecycle } from "./camera/useCameraLifecycle";
import { useMediapipeSegmentation } from "./camera/useMediapipeSegmentation";
import { useHandGestureCapture } from "./camera/useHandGestureCapture";
import { useBackgroundCompositing } from "./camera/useBackgroundCompositing";
import { CameraSidePanel } from "./camera/CameraSidePanel";
import { useCameraCapture } from "./camera/useCameraCapture";

// 개발(next dev = localhost) 여부. 빌드 시점에 인라인되는 상수라 SSR/클라이언트가 일치하고,
// 배포된 키오스크(production 빌드, 127.0.0.1:3001)에서는 항상 false → 손님 화면엔 계측이 안 뜬다.
const IS_DEV = process.env.NODE_ENV !== "production";

// 스티커 드래그 히트박스(px, scale=1 기준) — 캔버스 실제 그리기 크기(useStickers.ts의
// STICKER_IMG_BOX)와 같은 비율을 의도적으로 쓰지만, 그리기보다 약간 작게 잡은 투명 오버레이용 상수.
const STICKER_IMG_HITBOX = 108;

export function CameraSection({
  config,
  photos,
  maxPhotos,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  stickers,
  syncEnabled = false,
  mockCamera = false,
  previewForceGestureHint = false,
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
  /** 실제 카메라를 켜지 않고 곧바로 MOCK CAMERA 화면으로 대체(관리자 화면 미리보기용) */
  mockCamera?: boolean;
  /** 실제 배경/이펙트 설정 없이 제스처 트리거 안내 UI(2단 안내 박스)만 강제로 보여준다
   * (관리자 화면 미리보기 전용 — 배경 목록·실제 이펙트 재생 로직에는 영향 없음). */
  previewForceGestureHint?: boolean;
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
  const [countdown, setCountdown] = useState<number | null>(null);
  // 제스처 루프(deps [])가 촬영 진행 여부를 알 수 있도록 countdown을 ref로도 유지.
  const countdownRef = useRef<number | null>(null);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  // GPU델리게이트/경량모델/워커/추론간격/마스크품질 디버그 토글 5종 — useSegmentationDebugSettings 참고.
  const {
    useGpuDelegate, setDelegate,
    useLightModel, setModel, lightModelRef,
    useWorker, setWorkerEnabled,
    inferenceInterval, chooseInterval, inferenceIntervalRef,
    maskSmoothQuality, setMaskSmoothQuality, maskSmoothQualityRef,
  } = useSegmentationDebugSettings();
  // 프레임 레이트(표시 루프)와 추론/마스크 생성 시간(ms)을 누적하는 공유 ref — useMediapipeSegmentation
  // (워커 왕복 시간 기록)과 useCameraCapture(표시 FPS·flush) 둘 다 이 ref에 직접 쓴다.
  const perfRef = useRef({ frames: 0, lastFlush: 0, inferMs: 0, maskMs: 0, sentAt: 0 });
  // 카메라 시작/정지/에러/mock 처리 — useCameraLifecycle 참고.
  const { cameraError, cameraDeviceDiag, startCamera } = useCameraLifecycle({
    videoRef, displayCanvasRef, mockCamera, cameraResolution: config.cameraResolution,
  });
  // 스티커 CRUD·드래그·핀치·렌더링 — useStickers 참고. drawStickers는 캡처 파이프라인이 재사용한다.
  const {
    dbStickerImages, addSticker, removeSticker,
    draggingId, selectedStickerId, setSelectedStickerId,
    overlayRef, stickerCanvasRef, drawStickers,
    handleStickerMouseDown, handleOverlayMouseMove, handleOverlayMouseUp,
    handleStickerTouchStart, handleOverlayTouchMove, handleOverlayTouchEnd,
  } = useStickers({ deviceId: config.deviceId, stickers, onStickersChange, displayCanvasRef });
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
  const frameChannelRef = useFrameSender(syncEnabled);
  // 최신 촬영 핸들러 참조 (제스처 감지 루프가 재생성 없이 호출) — useHandGestureCapture 참고.
  const handleManualCaptureRef = useRef<() => void>(() => {});

  const bgRemovalMode = config.bgRemovalMode;
  // 선택 배경 소스 로딩 + 배경별 제스처 이펙트 영상(dissolve/transition/chromakey) 오버레이 —
  // useBackgroundCompositing 참고. effectVisibleRef 등 일부 refs는 capturePhoto가 촬영 카운트다운
  // 중 이펙트를 붙잡아 두는 로직에서 직접 써서 아래쪽에서도 재사용한다.
  const {
    currentBgEffect, currentBgEffectRef, effectGestureRef, onEffectTriggerRef,
    backEffectRef, effectVisibleRef, effectAlphaRef,
    effectTimerRef, effectDurationRef, effectStartedAtRef, stopEffect,
    drawBackground, drawEffectLayer,
  } = useBackgroundCompositing({
    selectedBackground, backgroundImages, imageBaseUrl, bgRemovalMode, countdownRef,
  });
  // 관리자 설정(0-100%) → confidence 스케일(0-1). FEATHER는 0으로 나누기 방지를 위해 최소 1%로 clamp됨(useDeviceSetup 참고).
  const segmentThresh = config.segmentThreshold / 100;
  const segmentFeather = config.segmentFeather / 100;
  // 마스크 후처리 세기(블러·두께·시간축·ROI) — 워커 경로와 메인 스레드 경로가 같은 값을 써야 하므로
  // 여기서 한 번만 만들어 두 훅에 같이 넘긴다(useCameraCapture는 config에서 직접 유도한다).
  const maskTuning = useMemo((): MaskTuning => ({
    blur: config.segmentMaskBlur,
    edgeShift: config.segmentEdgeShift,
    temporal: config.segmentTemporal,
    roi: config.segmentRoi,
    roiMargin: config.segmentRoiMargin,
  }), [config.segmentMaskBlur, config.segmentEdgeShift, config.segmentTemporal, config.segmentRoi, config.segmentRoiMargin]);
  // MediaPipe 세그멘터 초기화·정리·설정동기화 — useMediapipeSegmentation 참고. 프레임별 마스크
  // 굽기(메인 스레드 핫패스)는 여기 반환된 refs를 아래 processFrame 루프가 직접 사용한다.
  const {
    segmenterRef, maskCanvasRef, maskReadyRef, roiRef, lastInferenceTimeRef,
    workerRef, workerBusyRef, workerActiveRef,
    segmenterStatus, segmenterError, workerActive,
  } = useMediapipeSegmentation({
    bgRemovalMode, useGpuDelegate, useLightModel, useWorker,
    segmentThresh, segmentFeather, maskTuning, perfRef,
  });

  // MediaPipe/TFLite 내부 로그(console.error로 나오는 INFO 등)가 Next dev 에러 오버레이를
  // 띄워 화면을 가리는 것을 방지한다.
  useEffect(() => { suppressMediapipeLogs(); }, []);

  // 손동작 인식(손바닥=촬영, 배경별 트리거 제스처=이펙트) — useHandGestureCapture 참고.
  useHandGestureCapture({
    videoRef, countdownRef, handleManualCaptureRef, onEffectTriggerRef, effectGestureRef,
  });

  // 카메라 합성·촬영 파이프라인(프리뷰 루프·고해상도 캡처·카운트다운/GIF·자동 타이머) —
  // useCameraCapture 참고. 다른 서브시스템 훅들의 반환값을 그대로 입력으로 조합한다.
  const {
    flash, capturedPreview, perf,
    autoTimer, autoTimerPaused, toggleAutoTimerPause, handleManualCapture,
  } = useCameraCapture({
    videoRef, displayCanvasRef, config, photos, maxPhotos, onCapture, onNext,
    bgRemovalMode, selectedBackground, segmentThresh, segmentFeather, debug,
    countdown, setCountdown,
    maskSmoothQuality, maskSmoothQualityRef, useGpuDelegate, lightModelRef, inferenceIntervalRef,
    perfRef, segmenterRef, maskCanvasRef, maskReadyRef, roiRef, lastInferenceTimeRef,
    workerRef, workerBusyRef, workerActiveRef,
    currentBgEffectRef, effectVisibleRef, effectAlphaRef,
    backEffectRef, effectTimerRef, effectDurationRef, effectStartedAtRef, stopEffect,
    drawBackground, drawEffectLayer, drawStickers, frameChannelRef,
  });
  // 제스처 감지 루프가 최신 촬영 핸들러를 참조하도록 유지 (루프 재생성 없이)
  useEffect(() => { handleManualCaptureRef.current = handleManualCapture; }, [handleManualCapture]);

  const showBgStrip = bgRemovalMode !== "off";
  const bgOptions = backgroundImages.length > 0 ? backgroundImages : FALLBACK_BACKGROUNDS;
  // 프리뷰 컨테이너는 place-self-center로 내부 canvas의 intrinsic 크기에 맞춰 커진다.
  // 카메라 실행 시엔 canvas가 영상 해상도(4:3)로 커지지만, 실행 전엔 canvas 기본값(300×150)이라
  // 컨테이너가 작게 나온다. 실행 전에도 같은 크기가 되도록 초기 canvas 크기를 촬영 해상도로 지정한다.
  const previewRes = getCameraResolution(config.cameraResolution);
  // previewForceGestureHint(관리자 미리보기 전용)는 실제 배경/이펙트 설정과 무관하게
  // 안내 박스(2단 레이아웃)만 강제로 보여준다 — currentBgEffect 자체(영상 로드·제스처
  // 감지 등 실제 동작)는 건드리지 않고 표시용 파생값만 대체한다.
  const showGestureHint = !!currentBgEffect || previewForceGestureHint;
  const gestureHintEmoji = getGestureEmoji(currentBgEffect?.gesture ?? DEFAULT_EFFECT_GESTURE) ?? "🤚";

  return (
    <section
      ref={sectionRef}
      className="w-full h-full relative z-10 p-12 pb-60 portrait:px-16 portrait:pb-52"
      style={{
        display: "grid",
        gap: "1rem",
        // 세로: 제목 / 미리보기(전체폭) / 배경·스티커(하단 2분할) 스택 (시안 0013)
        // 가로: 좌측 상단은 로고 자리로 비우고, 배경·스티커 패널을 둘째 행부터 시작해 좌우 대칭.
        // (최상단 행 minmax(4.5rem) — 좌측 상단 로고 오버레이와 겹치지 않도록 최소 높이 확보)
        ...(isPortrait
          ? {
              // "1fr"만 쓰면 트랙 최소 폭이 auto(=내용의 min-content)라, "preview" 캔버스가
              // width/height 속성(카메라 해상도, 예: UHD 2880px)만큼의 intrinsic 크기를
              // 요구해 그리드 전체가 부풀며 좌측 bg 패널이 화면 밖으로 밀려났다.
              // minmax(0, 1fr)로 트랙이 화면 폭 안으로 정상 축소되게 한다.
              gridTemplateColumns: showBgStrip ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
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

      <h2 className="self-center text-center text-5xl portrait:text-[calc(2.25rem*1.5*var(--type-scale))] portrait:mt-12 font-extrabold text-white" style={{ gridArea: "title", textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("camera.start")}
      </h2>

      {/* 좌측: 배경 변경 패널 */}
      {showBgStrip && (
        <BackgroundPickerPanel
          bgOptions={bgOptions}
          selectedBackground={selectedBackground}
          onBackgroundSelect={onBackgroundSelect}
          imageBaseUrl={imageBaseUrl}
        />
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
                    width: `${s.scale * STICKER_IMG_HITBOX}px`,
                    height: `${s.scale * STICKER_IMG_HITBOX}px`,
                    lineHeight: 1,
                    outline: isSelected ? "2px dashed rgba(255,255,255,0.7)" : undefined,
                    borderRadius: "4px",
                  }}
                  onMouseDown={(e) => handleStickerMouseDown(e, s.id)}
                  onTouchStart={(e) => handleStickerTouchStart(e, s.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt="sticker" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", opacity: 0 }} />
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

          {/* 카메라 정상/오류 관계없이 항상 마운트한다 — 오류 상태에선 위 useEffect가
              여기에 mock 화면을 그려 넣어, 아래 "촬영하기" 버튼이 정상 캡처 폴백으로
              동작하게 한다(카메라 없는 개발 환경에서도 실제 촬영 플로우를 그대로 테스트 가능). */}
          <canvas ref={displayCanvasRef} className="camera-video" width={previewRes.width} height={previewRes.height} />
          {/* 스티커 전용 레이어: 메인 합성 루프와 분리되어 60fps로 부드럽게 이동 */}
          <canvas ref={stickerCanvasRef} className="camera-video absolute inset-0 pointer-events-none" />

          {cameraError && (
            // mock 화면이 아래 비치도록 전체를 덮지 않고, 상단에 작은 안내 배너만 띄운다.
            <div className="absolute top-2 inset-x-2 flex flex-col items-center gap-2 bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 pointer-events-auto">
              <p className="text-white/70 text-sm text-center">{t(cameraError.key, { reason: cameraError.reason ?? "" })}</p>
              <p className="text-white/40 text-xs text-center min-h-[1em]">
                {cameraDeviceDiag ?? "장치 확인 중..."}
              </p>
              <div className="flex gap-3">
                <button
                  className="px-4 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                  onClick={() => startCamera()}
                >
                  {t("common.retry")}
                </button>
                <button
                  className="px-4 py-1.5 text-sm bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg transition-colors"
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
          )}
          {/* 동작 트리거 이펙트 프레임 소스(dissolve/chromakey)는 crossOrigin이 필요해 JSX가 아니라
              명령형 <video>로 만든다(위 useEffect). 실제 표시는 합성 루프(drawEffectLayer)가 배경 위·사람 아래에 그린다. */}
          {/* 촬영 직후 촬영본 0.5초 프리뷰 (카메라 위에 덮어씀) */}
          {capturedPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedPreview} alt="captured" className="absolute inset-0 w-full h-full object-cover z-30 rounded-[17px]" />
          )}
          {/* 개발(localhost) 비디버그 상태에선 좌상단에 FPS만 표시. 디버그일 땐 아래 전체 패널이
              대신 뜨므로(!debug) 중복 없음. 배포된 키오스크(production)에선 IS_DEV=false라 안 뜬다. */}
          {IS_DEV && !debug && (
            <div className="absolute top-4 left-4 z-40 bg-black/70 text-white text-xs font-mono px-2 py-1 rounded-md tabular-nums pointer-events-none">
              {perf.fps} FPS
            </div>
          )}
          {/* 성능 계측 + GPU 델리게이트 토글 — 디버그 모드에서만, 손님에겐 안 보임(운영자용). */}
          {debug && bgRemovalMode === "mediapipe" && (
            <SegmentationDebugPanel
              perf={perf}
              workerActive={workerActive}
              segmenterStatus={segmenterStatus}
              useGpuDelegate={useGpuDelegate}
              setDelegate={setDelegate}
              useLightModel={useLightModel}
              setModel={setModel}
              useWorker={useWorker}
              setWorkerEnabled={setWorkerEnabled}
              maskSmoothQuality={maskSmoothQuality}
              setMaskSmoothQuality={setMaskSmoothQuality}
              inferenceInterval={inferenceInterval}
              chooseInterval={chooseInterval}
            />
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
            <CircularTimer
              value={autoTimer}
              total={config.cameraAutoTimerSeconds}
              size={72}
              positionClass="top-4 right-4"
              onLongPress={toggleAutoTimerPause}
              paused={autoTimerPaused}
            />
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[200px] font-extrabold text-white animate-countdown" key={countdown} style={{ textShadow: "0 0 60px rgba(255,255,255,0.5)" }}>
                {countdown}
              </span>
            </div>
          )}
        </div>

      {/* 촬영하기 — 하단 중앙. 다른 단계의 다음 버튼(ServiceNav)과 같은 위치(bottom-16, 가로·세로 동일)에 맞춘다. */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
        <button
          className={`service-button btn-role-capture ${SERVICE_BIG_BUTTON_CLASS}`}
          onClick={handleManualCapture}
          style={countdown !== null || photos.length >= maxPhotos ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          &#128248; {t("camera.shoot")}
        </button>
      </div>

      <CameraSidePanel
        stickers={stickers}
        onStickersChange={onStickersChange}
        dbStickerImages={dbStickerImages}
        addSticker={addSticker}
        imageBaseUrl={imageBaseUrl}
        showGestureHint={showGestureHint}
        gestureHintEmoji={gestureHintEmoji}
        maxPhotos={maxPhotos}
        photosCount={photos.length}
      />

    </section>
  );
}
