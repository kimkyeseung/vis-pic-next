"use client";

import { useEffect, useState, Suspense } from "react";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { useSearchParams } from "next/navigation";
import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";
import { useDeviceSetup } from "@/hooks/useDeviceSetup";
import { usePhotoFlow } from "@/hooks/usePhotoFlow";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { useCountdown } from "@/hooks/useCountdown";
import { useTauriMonitor } from "@/hooks/useTauriMonitor";
import { FloatingElements } from "@/components/service/FloatingElements";
import { PreflightSection } from "@/components/service/PreflightSection";
import { CircularTimer } from "@/components/service/CircularTimer";
import { StartSection } from "@/components/service/StartSection";
import { PaymentSection } from "@/components/service/PaymentSection";
import { FrameSection } from "@/components/service/FrameSection";
import { BackgroundSection } from "@/components/service/BackgroundSection";
import { CameraSection } from "@/components/service/CameraSection";
import { CameraStreamer } from "@/components/service/CameraStreamer";
import { SelectSection } from "@/components/service/SelectSection";
import { PrintBgSection } from "@/components/service/PrintBgSection";
import { CompleteSection } from "@/components/service/CompleteSection";
import { DebugProvider, useDebug, useSecretTap } from "@/components/service/DebugContext";
import { DebugOverlay } from "@/components/service/DebugOverlay";
import { DebugLayoutGuide } from "@/components/service/DebugLayoutGuide";
import type { Step } from "@/types";

// 개발(next dev = localhost) 여부. 빌드 시점에 인라인되는 상수라 SSR/클라이언트가 일치하고,
// 배포된 키오스크(production 빌드)에서는 항상 false → 손님 화면엔 뒤로가기 버튼이 안 뜬다.
const IS_DEV = process.env.NODE_ENV !== "production";

function ServiceContent() {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device") || "test";
  const [preflightDone, setPreflightDone] = useState(false);
  // 첫 화면 배경화면(가로/세로)을 실제 화면 방향에 맞춰 고르기 위한 방향 감지.
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setIsPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const { config, backgroundImages, printBgImages, imageBaseUrl, printSettings, wallpaperUrl, wallpaperPortraitUrl, wallpaperSubUrl, wallpaperSubPortraitUrl, logoUrl, captureButtonImageUrl, nextButtonImageUrl, paymentButtonImageUrl } = useDeviceSetup(deviceId);
  const flow = usePhotoFlow(deviceId, config, printBgImages);
  const { monitors, syncEnabled, setSyncEnabled, selectedMonitorIndex, setSelectedMonitorIndex } = useTauriMonitor();
  const { idleRemaining, clearIdleTimer, paused: idlePaused, togglePause: toggleIdlePause } = useIdleTimer(
    flow.currentStep,
    config.idleTimeoutSeconds,
    flow.advanceFromCurrentStep,
  );

  // 인화 단계 전용 타이머 (complete step). 유휴 타이머와 같은 useCountdown을 재사용 →
  // 롱프레스 일시정지/재개(멈춘 지점부터) 동일 지원. 0에 도달하면 처음으로 리셋.
  const { remaining: printRemaining, paused: printPaused, togglePause: togglePrintPause } = useCountdown(
    flow.currentStep === "complete",
    config.printAutoTimerSeconds,
    flow.resetAll,
  );

  const { currentStep, slotsNeeded, selectedBackground, setSelectedBackground, selectedPrintBg, setSelectedPrintBg } = flow;
  const { setLang, t } = useLanguage();
  const { toggle: toggleDebug } = useDebug();
  const handleLogoSecretTap = useSecretTap(toggleDebug);

  // 대기 화면으로 돌아오면 다음 손님을 위해 언어를 한국어로 초기화
  useEffect(() => {
    if (currentStep === "start") setLang("ko");
  }, [currentStep, setLang]);

  // 버튼 탭 시 외곽으로 퍼졌다 사라지는 글로우 펄스.
  // 버튼 위에 독립 링(.btn-glow-ripple)을 잠깐 만들어 화면 전환으로 버튼이 사라져도 끝까지 재생한다.
  useEffect(() => {
    const spawn = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest?.(".service-button") as HTMLElement | null;
      if (!btn) return;
      const cs = getComputedStyle(btn);
      const glowColor = cs.getPropertyValue("--btn-glow-color").trim();
      const glowSize = cs.getPropertyValue("--btn-glow-size").trim();
      // 글로우 비활성(변수 미주입) 시 펄스도 없음
      if (!glowColor || !glowSize || glowSize === "0px") return;
      const rect = btn.getBoundingClientRect();
      const ring = document.createElement("div");
      ring.className = "btn-glow-ripple";
      ring.style.left = `${rect.left}px`;
      ring.style.top = `${rect.top}px`;
      ring.style.width = `${rect.width}px`;
      ring.style.height = `${rect.height}px`;
      ring.style.borderRadius = cs.borderRadius;
      ring.style.setProperty("--btn-glow-color", glowColor);
      ring.style.setProperty("--btn-glow-size", glowSize);
      document.body.appendChild(ring);
      const done = () => ring.remove();
      ring.addEventListener("animationend", done, { once: true });
      window.setTimeout(done, 900);
    };
    window.addEventListener("pointerdown", spawn);
    return () => window.removeEventListener("pointerdown", spawn);
  }, []);

  // ── 웹 브라우저 레터박스 ────────────────────────────────────────────
  // 브라우저 주소창 등으로 창이 정확한 16:9(세로는 9:16)가 아니면 px 기반 레이아웃이
  // 깨져 보인다. 고정 스테이지(1920×1080 / 1080×1920)를 창 실측 크기에 맞춰 통째로
  // scale해 비율을 유지하고 남는 공간은 검은 레터박스로 채운다.
  // 풀스크린(정확히 16:9)에선 scale=1이라 기존과 동일하게 렌더된다.
  const [viewport, setViewport] = useState({ w: 1920, h: 1080 });
  useEffect(() => {
    const compute = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);
  const stagePortrait = viewport.h > viewport.w;
  const stageW = stagePortrait ? 1080 : 1920;
  const stageH = stagePortrait ? 1920 : 1080;
  const stageScale = Math.min(viewport.w / stageW, viewport.h / stageH) || 1;

  // 배경 로드 시 랜덤 자동 선택: null이면 랜덤 선택, fallback 선택 중에 DB 이미지가 로드되면 DB 이미지로 교체
  useEffect(() => {
    const hasDbImages = backgroundImages.length > 0;
    const isFallbackSelected = selectedBackground !== null && selectedBackground < 0;

    if (selectedBackground === null) {
      const pool = hasDbImages ? backgroundImages : FALLBACK_BACKGROUNDS;
      setSelectedBackground(pool[Math.floor(Math.random() * pool.length)].id);
    } else if (isFallbackSelected && hasDbImages) {
      setSelectedBackground(backgroundImages[Math.floor(Math.random() * backgroundImages.length)].id);
    }
  }, [backgroundImages, selectedBackground, setSelectedBackground]);

  const maxCaptures = slotsNeeded * config.captureCount;
  const showTimer = currentStep !== "start" && currentStep !== "camera" && currentStep !== "payment" && currentStep !== "complete" && idleRemaining !== null && config.idleTimeoutSeconds > 0;

  // 결제 이후 각 단계의 "이전 단계로" 동작 — 화면엔 안 보이는 개발용 뒤로가기 버튼(아래)과
  // 각 Section의 onPrev prop이 이 한 곳을 같이 참조한다(로직 중복 방지).
  const prevHandlers: Partial<Record<Step, () => void>> = {
    frame: () => (config.paymentEnabled ? flow.goToStep("payment") : flow.resetAll()),
    background: () => flow.goToStep("frame"),
    camera: () => { flow.setPhotos([]); flow.goToStep("background"); },
    select: () => {
      flow.setPhotos([]);
      flow.setSelectedPhotos([]);
      flow.setCompositeImage(null);
      flow.goToStep("camera");
    },
    printbg: () => { flow.setCompositeImage(null); flow.goToStep("select"); },
    complete: () => flow.goToStep(printBgImages.length > 0 ? "printbg" : "select"),
  };

  // 디버그 오버레이에 표시할 진단값(비민감). 필요 시 항목을 추가/제거하면 된다.
  const debugData: Record<string, unknown> = {
    deviceId,
    device: config.deviceName,
    step: currentStep,
    frame: flow.selectedFrame,
    slots: slotsNeeded,
    "photos": `${flow.photos.length}/${maxCaptures}`,
    selectedPhotos: flow.selectedPhotos,
    background: selectedBackground,
    printBg: selectedPrintBg,
    bgRemoval: config.bgRemovalMode,
    cameraRes: config.cameraResolution,
    "capture(s/n)": `${config.captureSeconds}s x${config.captureCount}`,
    "seg(th/feather)": `${config.segmentThreshold}/${config.segmentFeather}`,
    chromakey: config.chromakeyRgb,
    payment: config.paymentEnabled ? `on ₩${config.paymentAmount}` : "off",
    sync: `${syncEnabled} (mon ${selectedMonitorIndex ?? "-"}/${monitors.length})`,
    bgImages: backgroundImages.length,
    printBgImages: printBgImages.length,
    idleRemaining,
    build: process.env.NEXT_PUBLIC_BUILD_DATE,
  };

  // 테마관리에서 설정한 배경화면/글자색을 서비스 화면 전체에 적용 (어드민 화면에는 미적용).
  // 글자색은 --theme-text 변수로 내려 globals.css의 .service-theme 규칙이 본문 흰 텍스트를 치환한다.
  // 배경화면 이미지는 첫 화면(start)과 나머지 단계에 각각 따로 설정한다(관리자 > 테마 관리).
  // 해당 화면에 이미지가 없으면 관리자가 지정한 배경 단색을 그대로 쓴다.
  const isFirstPage = currentStep === "start";
  // 화면 방향에 맞는 배경화면 선택. 해당 방향 이미지가 없으면 반대 방향 이미지로 폴백(하위호환).
  const pickWallpaper = (ls: string | null, pt: string | null) => (isPortrait ? (pt ?? ls) : (ls ?? pt));
  const activeWallpaper = isFirstPage
    ? pickWallpaper(wallpaperUrl, wallpaperPortraitUrl)
    : pickWallpaper(wallpaperSubUrl, wallpaperSubPortraitUrl);
  const themeStyle: React.CSSProperties = {
    ...(config.themeTextColor ? { ["--theme-text"]: config.themeTextColor } : {}),
    ...(config.themePrimaryColor ? { ["--theme-primary"]: config.themePrimaryColor } : {}),
    // 대형 강조 버튼(촬영하기·다음·결제하기) 배경 이미지. 버튼별 별도 업로드, 미설정 시
    // globals.css 폴백으로 기존 단색 유지.
    ...(captureButtonImageUrl ? { ["--theme-btn-capture-image"]: `url(${captureButtonImageUrl})` } : {}),
    ...(nextButtonImageUrl ? { ["--theme-btn-next-image"]: `url(${nextButtonImageUrl})` } : {}),
    ...(paymentButtonImageUrl ? { ["--theme-btn-payment-image"]: `url(${paymentButtonImageUrl})` } : {}),
    // 버튼별 텍스트 색상. 버튼 배경(단색/이미지)에 맞춰 관리자가 지정.
    ...(config.btnCaptureTextColor ? { ["--theme-btn-capture-text"]: config.btnCaptureTextColor } : {}),
    ...(config.btnNextTextColor ? { ["--theme-btn-next-text"]: config.btnNextTextColor } : {}),
    ...(config.btnPaymentTextColor ? { ["--theme-btn-payment-text"]: config.btnPaymentTextColor } : {}),
    // 버튼 탭 글로우 (--btn-glow-*). 비활성 시 주입 안 함 → globals.css 폴백으로 글로우 없음.
    ...(config.btnGlowEnabled
      ? { ["--btn-glow-color"]: config.btnGlowColor, ["--btn-glow-size"]: `${config.btnGlowSize}px` }
      : {}),
    backgroundColor: config.themeBgColor,
    ...(activeWallpaper
      ? {
          backgroundImage: `url(${activeWallpaper})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : {}),
  } as React.CSSProperties;

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center"
      style={{ width: viewport.w, height: viewport.h }}
    >
    {/* 스케일된 스테이지의 실제 차지 크기를 예약해 레터박스 중앙 정렬이 정확히 맞도록 한다. */}
    <div style={{ width: stageW * stageScale, height: stageH * stageScale }}>
    <div
      className="service-theme overflow-hidden relative"
      style={{ ...themeStyle, width: stageW, height: stageH, transform: `scale(${stageScale})`, transformOrigin: "top left" }}
    >
      {showTimer && (
        <CircularTimer value={idleRemaining!} total={config.idleTimeoutSeconds} testId="page-idle-timer" onLongPress={toggleIdlePause} paused={idlePaused} />
      )}
      {currentStep === "complete" && printRemaining !== null && config.printAutoTimerSeconds > 0 && (
        <CircularTimer value={printRemaining} total={config.printAutoTimerSeconds} testId="page-print-timer" onLongPress={togglePrintPause} paused={printPaused} />
      )}
      {/* 이전 단계로 — 우하단 투명 버튼(50×50). 결제 이후 모든 단계에 공통으로 뜨며,
          개발 환경(IS_DEV)에서만 렌더된다 — 배포된 키오스크에선 손님에게 아예 없는 버튼. */}
      {IS_DEV && prevHandlers[currentStep] && (
        <button
          className="absolute bottom-16 right-16 z-20 w-[50px] h-[50px]"
          onClick={prevHandlers[currentStep]}
          aria-label={t("common.prev")}
        />
      )}
      {flow.isPreparingComplete && (
        <div className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-6" />
          <p className="text-white text-2xl font-bold">{t("page.saving")}</p>
        </div>
      )}
      <FloatingElements />
      {/* 좌측 상단 로고 — 첫(대기) 화면을 제외한 단계에 표시. 업로드한 로고 없으면 기본 AR-pic. */}
      {currentStep !== "start" && (
        // 로고 5회 연속 탭(2초 내) → 디버그 모드 토글 (손님에겐 티 안 나는 운영자용).
        // top-16/left-16(64px) — 페이지 상하좌우 패딩선에 맞춤(가로·세로 동일)
        <div
          className="absolute top-16 left-16 z-20 select-none"
          style={{ cursor: "default" }}
          onClick={handleLogoSecretTap}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="logo"
              className="h-16 portrait:h-12 w-auto max-w-[40vw] object-contain"
              style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
            />
          ) : (
            <span
              className="text-3xl portrait:text-2xl font-extrabold tracking-wide text-white"
              style={{ textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
            >
              AR-pic
            </span>
          )}
        </div>
      )}
      {currentStep !== "camera" && (
        <CameraStreamer
          enabled
          sendFrames={syncEnabled}
          selectedBackground={selectedBackground}
          backgroundImages={backgroundImages}
          imageBaseUrl={imageBaseUrl}
          bgRemovalMode={config.bgRemovalMode}
          chromakeyRgb={config.chromakeyRgb}
          chromakeySimilarity={config.chromakeySimilarity}
          chromakeySmoothness={config.chromakeySmoothness}
          chromakeySpill={config.chromakeySpill}
          chromakeyChoke={config.chromakeyChoke}
          chromakeyLumaIndependent={config.chromakeyLumaIndependent}
          chromakeyYuvRgb={config.chromakeyYuvRgb}
          chromakeyYuvSimilarity={config.chromakeyYuvSimilarity}
          chromakeyYuvSmoothness={config.chromakeyYuvSmoothness}
          chromakeyYuvSpill={config.chromakeyYuvSpill}
          chromakeyYuvOpacity={config.chromakeyYuvOpacity}
          chromakeyYuvContrast={config.chromakeyYuvContrast}
          chromakeyYuvBrightness={config.chromakeyYuvBrightness}
          chromakeyYuvGamma={config.chromakeyYuvGamma}
          segmentThreshold={config.segmentThreshold}
          segmentFeather={config.segmentFeather}
          segmentMaskBlur={config.segmentMaskBlur}
          segmentEdgeShift={config.segmentEdgeShift}
          segmentTemporal={config.segmentTemporal}
          segmentRoi={config.segmentRoi}
          segmentRoiMargin={config.segmentRoiMargin}
          segmentProcessScale={config.segmentProcessScale}
        />
      )}

      {/* 대기 화면 진입 전 시스템 점검 (서버/번들/설정/애셋/AI/카메라) */}
      {!preflightDone && currentStep === "start" && (
        <PreflightSection deviceId={deviceId} config={config} onReady={() => setPreflightDone(true)} />
      )}
      {preflightDone && currentStep === "start" && (
        <StartSection
          onNext={flow.handleStart}
          showLanguage={!config.paymentEnabled}
          monitors={monitors}
          syncEnabled={syncEnabled}
          selectedMonitorIndex={selectedMonitorIndex}
          onSyncEnabledChange={setSyncEnabled}
          onMonitorIndexChange={setSelectedMonitorIndex}
        />
      )}
      {currentStep === "payment" && (
        <PaymentSection
          config={config}
          orderId={flow.orderId}
          setOrderId={flow.setOrderId}
          printQuantity={flow.printQuantity}
          setPrintQuantity={flow.setPrintQuantity}
          onNext={() => flow.goToStep("frame")}
          onPrev={flow.resetAll}
        />
      )}
      {currentStep === "frame" && (
        <FrameSection
          captureModes={config.captureModes}
          selectedFrame={flow.selectedFrame}
          onSelect={flow.setSelectedFrame}
          onNext={() => flow.goToStep("background")}
          onPrev={prevHandlers.frame!}
        />
      )}
      {currentStep === "background" && (
        <BackgroundSection
          backgroundImages={backgroundImages}
          selectedBackground={selectedBackground}
          imageBaseUrl={imageBaseUrl}
          onSelect={setSelectedBackground}
          onNext={() => flow.goToStep("camera")}
          onPrev={prevHandlers.background!}
        />
      )}
      {currentStep === "camera" && (
        <CameraSection
          config={config}
          photos={flow.photos}
          maxPhotos={maxCaptures}
          minPhotos={slotsNeeded}
          selectedBackground={selectedBackground}
          backgroundImages={backgroundImages}
          imageBaseUrl={imageBaseUrl}
          stickers={flow.stickers}
          syncEnabled={syncEnabled}
          onStickersChange={flow.setStickers}
          onBackgroundSelect={setSelectedBackground}
          onCapture={flow.addPhoto}
          onNext={() => {
            if (flow.photos.length <= slotsNeeded) {
              flow.setSelectedPhotos(flow.photos.map((_, i) => i));
            }
            flow.goToStep("select");
          }}
          onPrev={prevHandlers.camera!}
        />
      )}
      {currentStep === "select" && (
        <SelectSection
          photos={flow.photos}
          requiredCount={slotsNeeded}
          selectedPhotos={flow.selectedPhotos}
          setSelectedPhotos={flow.setSelectedPhotos}
          selectedFrame={flow.selectedFrame}
          printSettings={printSettings}
          imageBaseUrl={imageBaseUrl}
          selectedBackground={selectedBackground}
          backgroundImages={backgroundImages}
          printBgImages={printBgImages}
          onNext={() => { clearIdleTimer(); flow.handleSelectNext(printBgImages.length > 0); }}
          onPrev={prevHandlers.select!}
        />
      )}
      {currentStep === "printbg" && (
        <PrintBgSection
          printBgImages={printBgImages}
          selectedPrintBg={selectedPrintBg}
          imageBaseUrl={imageBaseUrl}
          onSelect={setSelectedPrintBg}
          onNext={() => flow.goToStep("complete")}
          onPrev={prevHandlers.printbg!}
        />
      )}
      {currentStep === "complete" && (
        <CompleteSection
          photos={flow.photos}
          selectedPhotos={flow.selectedPhotos}
          selectedFrame={flow.selectedFrame!}
          selectedBackground={selectedBackground}
          backgroundImages={backgroundImages}
          imageBaseUrl={imageBaseUrl}
          printQuantity={flow.printQuantity}
          compositeImage={flow.compositeImage}
          setCompositeImage={flow.setCompositeImage}
          intermediateFrames={flow.intermediateFrames}
          printSettings={printSettings}
          selectedPrintBg={selectedPrintBg}
          printBgImages={printBgImages}
          preparedPhotoUrl={flow.preparedPhotoUrl}
          preparedGifUrl={flow.preparedGifUrl}
          preparedExpiryDate={flow.preparedExpiryDate}
          onPrev={prevHandlers.complete!}
          onRestart={flow.resetAll}
        />
      )}

      <DebugLayoutGuide />
      <DebugOverlay data={debugData} />
    </div>
    </div>
    </div>
  );
}

export default function ServicePage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#2a2a2a]" />}>
      <LanguageProvider>
        <DebugProvider>
          <ServiceContent />
        </DebugProvider>
      </LanguageProvider>
    </Suspense>
  );
}
