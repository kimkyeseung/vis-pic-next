"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { useSearchParams } from "next/navigation";
import { LanguageProvider, useLanguage } from "@/i18n/LanguageContext";
import { useDeviceSetup } from "@/hooks/useDeviceSetup";
import { usePhotoFlow } from "@/hooks/usePhotoFlow";
import { useIdleTimer } from "@/hooks/useIdleTimer";
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

function ServiceContent() {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device") || "test";
  const [preflightDone, setPreflightDone] = useState(false);

  const { config, backgroundImages, printBgImages, imageBaseUrl, printSettings, wallpaperUrl, logoUrl } = useDeviceSetup(deviceId);
  const flow = usePhotoFlow(deviceId, config, printBgImages.length > 0);
  const { monitors, syncEnabled, setSyncEnabled, selectedMonitorIndex, setSelectedMonitorIndex } = useTauriMonitor();
  const { idleRemaining, clearIdleTimer } = useIdleTimer(
    flow.currentStep,
    config.idleTimeoutSeconds,
    flow.advanceFromCurrentStep,
  );

  // 인화 단계 전용 타이머 (complete step)
  const [printRemaining, setPrintRemaining] = useState<number | null>(null);
  const printTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetAllRef = useRef(flow.resetAll);
  useEffect(() => { resetAllRef.current = flow.resetAll; }, [flow.resetAll]);

  useEffect(() => {
    if (flow.currentStep !== "complete" || config.printAutoTimerSeconds <= 0) {
      if (printTimerRef.current) { clearInterval(printTimerRef.current); printTimerRef.current = null; }
      setPrintRemaining(null);
      return;
    }
    const deadline = Date.now() + config.printAutoTimerSeconds * 1000;
    const init = setTimeout(() => setPrintRemaining(config.printAutoTimerSeconds), 0);
    printTimerRef.current = setInterval(() => {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      if (remaining <= 0) {
        if (printTimerRef.current) { clearInterval(printTimerRef.current); printTimerRef.current = null; }
        setPrintRemaining(null);
        resetAllRef.current();
      } else {
        setPrintRemaining(remaining);
      }
    }, 1000);
    return () => {
      clearTimeout(init);
      if (printTimerRef.current) { clearInterval(printTimerRef.current); printTimerRef.current = null; }
    };
  }, [flow.currentStep, config.printAutoTimerSeconds]);

  const { currentStep, slotsNeeded, selectedBackground, setSelectedBackground, selectedPrintBg, setSelectedPrintBg } = flow;
  const { setLang, t } = useLanguage();

  // 대기 화면으로 돌아오면 다음 손님을 위해 언어를 한국어로 초기화
  useEffect(() => {
    if (currentStep === "start") setLang("ko");
  }, [currentStep, setLang]);

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

  // 테마관리에서 설정한 배경화면/글자색을 서비스 화면 전체에 적용 (어드민 화면에는 미적용).
  // 글자색은 --theme-text 변수로 내려 globals.css의 .service-theme 규칙이 본문 흰 텍스트를 치환한다.
  // 배경화면 이미지는 첫 화면(start)에만 깔고, 나머지 단계는 관리자가 지정한 배경 단색을 사용한다.
  const isFirstPage = currentStep === "start";
  const themeStyle: React.CSSProperties = {
    ...(config.themeTextColor ? { ["--theme-text"]: config.themeTextColor } : {}),
    ...(config.themePrimaryColor ? { ["--theme-primary"]: config.themePrimaryColor } : {}),
    backgroundColor: config.themeBgColor,
    ...(isFirstPage && wallpaperUrl
      ? {
          backgroundImage: `url(${wallpaperUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : {}),
  } as React.CSSProperties;

  return (
    <div className="service-theme w-full h-screen overflow-hidden relative" style={themeStyle}>
      {showTimer && (
        <CircularTimer value={idleRemaining!} total={config.idleTimeoutSeconds} testId="page-idle-timer" />
      )}
      {currentStep === "complete" && printRemaining !== null && config.printAutoTimerSeconds > 0 && (
        <CircularTimer value={printRemaining} total={config.printAutoTimerSeconds} testId="page-print-timer" />
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
        <div className="absolute top-6 left-8 portrait:top-4 portrait:left-5 z-20 pointer-events-none select-none">
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
          segmentThreshold={config.segmentThreshold}
          segmentFeather={config.segmentFeather}
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
          onPrev={() => (config.paymentEnabled ? flow.goToStep("payment") : flow.resetAll())}
          printBgImages={printBgImages}
          imageBaseUrl={imageBaseUrl}
        />
      )}
      {currentStep === "background" && (
        <BackgroundSection
          backgroundImages={backgroundImages}
          selectedBackground={selectedBackground}
          imageBaseUrl={imageBaseUrl}
          onSelect={setSelectedBackground}
          onNext={() => flow.goToStep("camera")}
          onPrev={() => flow.goToStep("frame")}
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
          onPrev={() => {
            flow.setPhotos([]);
            flow.goToStep("background");
          }}
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
          onNext={() => { clearIdleTimer(); flow.handleSelectNext(printBgImages.length > 0); }}
          onPrev={() => {
            flow.setPhotos([]);
            flow.setSelectedPhotos([]);
            flow.setCompositeImage(null);
            flow.goToStep("camera");
          }}
        />
      )}
      {currentStep === "printbg" && (
        <PrintBgSection
          printBgImages={printBgImages}
          selectedPrintBg={selectedPrintBg}
          imageBaseUrl={imageBaseUrl}
          onSelect={setSelectedPrintBg}
          onNext={() => flow.goToStep("complete")}
          onPrev={() => {
            flow.setCompositeImage(null);
            flow.goToStep("select");
          }}
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
          onPrev={() => flow.goToStep(printBgImages.length > 0 ? "printbg" : "select")}
          onRestart={flow.resetAll}
        />
      )}
    </div>
  );
}

export default function ServicePage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#2a2a2a]" />}>
      <LanguageProvider>
        <ServiceContent />
      </LanguageProvider>
    </Suspense>
  );
}
