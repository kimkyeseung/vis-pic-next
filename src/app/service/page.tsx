"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSceneSyncSender } from "@/hooks/useSceneSync";
import { useDeviceSetup } from "@/hooks/useDeviceSetup";
import { usePhotoFlow } from "@/hooks/usePhotoFlow";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { useTauriMonitor } from "@/hooks/useTauriMonitor";
import { FloatingElements } from "@/components/service/FloatingElements";
import { CircularTimer } from "@/components/service/CircularTimer";
import { StartSection } from "@/components/service/StartSection";
import { PaymentSection } from "@/components/service/PaymentSection";
import { FrameSection } from "@/components/service/FrameSection";
import { BackgroundSection } from "@/components/service/BackgroundSection";
import { CameraSection } from "@/components/service/CameraSection";
import { CameraStreamer } from "@/components/service/CameraStreamer";
import { SelectSection } from "@/components/service/SelectSection";
import { CompleteSection } from "@/components/service/CompleteSection";

function ServiceContent() {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device") || "test";

  const { config, backgroundImages, imageBaseUrl, printSettings } = useDeviceSetup(deviceId);
  const flow = usePhotoFlow(deviceId, config);
  const { monitors, syncEnabled, setSyncEnabled, selectedMonitorIndex, setSelectedMonitorIndex } = useTauriMonitor();
  const broadcastScene = useSceneSyncSender(syncEnabled);
  const { idleRemaining, clearIdleTimer } = useIdleTimer(
    flow.currentStep,
    config.idleTimeoutSeconds,
    flow.advanceFromCurrentStep,
  );

  // 씬 상태 브로드캐스트
  useEffect(() => {
    if (!syncEnabled) return;
    broadcastScene({
      selectedBackground: flow.selectedBackground,
      backgroundImages,
      imageBaseUrl,
      bgRemovalMode: config.bgRemovalMode,
      chromakeyRgb: config.chromakeyRgb,
      stickers: flow.stickers,
    });
  }, [syncEnabled, flow.selectedBackground, backgroundImages, imageBaseUrl, config.bgRemovalMode, config.chromakeyRgb, flow.stickers, broadcastScene]);

  const { currentStep, slotsNeeded } = flow;
  const maxCaptures = slotsNeeded * config.captureCount;
  const showTimer = currentStep !== "start" && currentStep !== "camera" && currentStep !== "payment" && idleRemaining !== null && config.idleTimeoutSeconds > 0;

  return (
    <div className="w-full h-screen overflow-hidden relative">
      {showTimer && (
        <CircularTimer value={idleRemaining!} total={config.idleTimeoutSeconds} testId="page-idle-timer" />
      )}
      {flow.isPreparingComplete && (
        <div className="absolute inset-0 z-[100] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-6" />
          <p className="text-white text-2xl font-bold">사진 저장 중...</p>
        </div>
      )}
      <FloatingElements />
      {syncEnabled && currentStep !== "start" && currentStep !== "camera" && (
        <CameraStreamer enabled />
      )}

      {currentStep === "start" && (
        <StartSection
          onNext={flow.handleStart}
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
        />
      )}
      {currentStep === "background" && (
        <BackgroundSection
          backgroundImages={backgroundImages}
          selectedBackground={flow.selectedBackground}
          imageBaseUrl={imageBaseUrl}
          onSelect={flow.setSelectedBackground}
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
          selectedBackground={flow.selectedBackground}
          backgroundImages={backgroundImages}
          imageBaseUrl={imageBaseUrl}
          stickers={flow.stickers}
          syncEnabled={syncEnabled}
          onStickersChange={flow.setStickers}
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
          onNext={() => { clearIdleTimer(); flow.handleSelectNext(); }}
          onPrev={() => {
            flow.setPhotos([]);
            flow.setSelectedPhotos([]);
            flow.setCompositeImage(null);
            flow.goToStep("camera");
          }}
        />
      )}
      {currentStep === "complete" && (
        <CompleteSection
          photos={flow.photos}
          selectedPhotos={flow.selectedPhotos}
          selectedFrame={flow.selectedFrame!}
          selectedBackground={flow.selectedBackground}
          backgroundImages={backgroundImages}
          imageBaseUrl={imageBaseUrl}
          compositeImage={flow.compositeImage}
          setCompositeImage={flow.setCompositeImage}
          intermediateFrames={flow.intermediateFrames}
          printSettings={printSettings}
          preparedPhotoUrl={flow.preparedPhotoUrl}
          preparedGifUrl={flow.preparedGifUrl}
          preparedExpiryDate={flow.preparedExpiryDate}
          onRestart={flow.resetAll}
        />
      )}
    </div>
  );
}

export default function ServicePage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#2a2a2a]" />}>
      <ServiceContent />
    </Suspense>
  );
}
