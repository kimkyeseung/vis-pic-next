"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Step, BgRemovalMode, DeviceConfig, BGImage, Sticker, MonitorInfo } from "@/types";
import { FRAME_INFO } from "@/constants/frames";
import { useSceneSyncSender } from "@/hooks/useSceneSync";
import { FloatingElements } from "@/components/service/FloatingElements";
import { StartSection } from "@/components/service/StartSection";
import { PaymentSection } from "@/components/service/PaymentSection";
import { FrameSection } from "@/components/service/FrameSection";
import { BackgroundSection } from "@/components/service/BackgroundSection";
import { CameraSection } from "@/components/service/CameraSection";
import { SelectSection } from "@/components/service/SelectSection";
import { CompleteSection } from "@/components/service/CompleteSection";

const DEFAULT_CONFIG: DeviceConfig = {
  deviceId: "test",
  deviceName: "테스트 장치",
  paymentEnabled: false,
  paymentAmount: 1000,
  captureSeconds: 3,
  captureCount: 4,
  chromakeyRgb: "0,255,0",
  captureModes: ["1x1", "2x2"],
  bgRemovalMode: "mediapipe",
  idleTimeoutSeconds: 30,
  cameraAutoTimerSeconds: 60,
};

function ServiceContent() {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device") || "test";

  const [currentStep, setCurrentStep] = useState<Step>("start");
  const [config, setConfig] = useState<DeviceConfig>(DEFAULT_CONFIG);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(null);
  const [backgroundImages, setBackgroundImages] = useState<BGImage[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [selectedMonitorIndex, setSelectedMonitorIndex] = useState<number | null>(null);
  const broadcastScene = useSceneSyncSender(syncEnabled);
  const [intermediateFrames, setIntermediateFrames] = useState<string[][]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("/static/images");
  const [printSettings, setPrintSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDeviceConfig(deviceId);
    loadBackgrounds(deviceId);
    loadPrintSettings();
    restoreSession();
  }, [deviceId]);

  // Tauri 환경에서 모니터 목록 조회
  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<MonitorInfo[]>("get_monitors").then(setMonitors).catch(console.error);
    });
  }, []);

  // 서브 모니터 출력 창 열기/닫기
  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      if (syncEnabled && selectedMonitorIndex !== null && monitors[selectedMonitorIndex]) {
        const m = monitors[selectedMonitorIndex];
        invoke("open_camera_window", { x: m.x, y: m.y, width: m.width, height: m.height }).catch(console.error);
      } else if (!syncEnabled) {
        invoke("close_camera_window").catch(console.error);
      }
    });
  }, [syncEnabled, selectedMonitorIndex, monitors]);

  // 씬 상태 브로드캐스트
  useEffect(() => {
    if (!syncEnabled) return;
    broadcastScene({
      selectedBackground,
      backgroundImages,
      imageBaseUrl,
      bgRemovalMode: config.bgRemovalMode,
      chromakeyRgb: config.chromakeyRgb,
      stickers,
    });
  }, [syncEnabled, selectedBackground, backgroundImages, imageBaseUrl, config.bgRemovalMode, config.chromakeyRgb, stickers, broadcastScene]);

  const restoreSession = () => {
    try {
      const saved = sessionStorage.getItem("photobooth_session");
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.deviceId !== deviceId) return;
      if (s.step) setCurrentStep(s.step);
      if (s.orderId) setOrderId(s.orderId);
      if (s.selectedFrame) setSelectedFrame(s.selectedFrame);
      if (s.selectedBackground !== undefined) setSelectedBackground(s.selectedBackground);
      if (s.photos?.length > 0) setPhotos(s.photos);
      if (s.intermediateFrames?.length > 0) setIntermediateFrames(s.intermediateFrames);
      if (s.selectedPhotos?.length > 0) setSelectedPhotos(s.selectedPhotos);
    } catch {
      // ignore parse errors
    }
  };

  useEffect(() => {
    if (currentStep === "start") return;
    try {
      sessionStorage.setItem("photobooth_session", JSON.stringify({
        deviceId,
        step: currentStep,
        orderId,
        selectedFrame,
        selectedBackground,
        photos,
        intermediateFrames,
        selectedPhotos,
      }));
    } catch {
      // sessionStorage full or unavailable
    }
  }, [currentStep, deviceId, orderId, selectedFrame, selectedBackground, photos, intermediateFrames, selectedPhotos]);

  const loadDeviceConfig = async (id: string) => {
    try {
      const res = await fetch(`/api/device/${id}/settings`);
      if (!res.ok) return;
      const data = await res.json();
      const s = data.settings || {};

      const captureCount = parseInt(s.CAPTURE_COUNT_UNIFORM || "4", 10) || 4;
      const modes = (s.CAPTURE_MODES || "1x1,2x2").split(",").map((m: string) => m.trim()).filter(Boolean);

      const modeRaw = s.CHROMAKEY_MODE || "mediapipe";
      let bgRemovalMode: BgRemovalMode = "mediapipe";
      if (modeRaw === "0" || modeRaw === "off") bgRemovalMode = "off";
      else if (modeRaw === "1" || modeRaw === "chromakey") bgRemovalMode = "chromakey";
      else if (modeRaw === "mediapipe") bgRemovalMode = "mediapipe";

      setConfig({
        deviceId: id,
        deviceName: data.device?.name || id,
        paymentEnabled: s.PAYMENT_ENABLED === "1",
        paymentAmount: parseInt(s.PAYMENT_AMOUNT || "1000", 10),
        captureSeconds: parseInt(s.CAPTURE_SECONDS || "3", 10),
        captureCount,
        chromakeyRgb: s.CHROMAKEY_RGB || "0,255,0",
        captureModes: modes,
        bgRemovalMode,
        idleTimeoutSeconds: parseInt(s.IDLE_TIMEOUT_SECONDS || "30", 10) || 30,
        cameraAutoTimerSeconds: parseInt(s.CAMERA_AUTO_TIMER || "60", 10) || 60,
      });
    } catch {
      // use defaults
    }
  };

  const loadBackgrounds = async (id: string) => {
    try {
      const res = await fetch(`/api/image/list/1?device_id=${id}&check_files=1`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.images?.length > 0) {
        setBackgroundImages(data.images);
      }
      if (data.baseUrl) {
        setImageBaseUrl(data.baseUrl);
      }
    } catch {
      // use fallback
    }
  };

  const loadPrintSettings = async () => {
    try {
      const res = await fetch("/api/setting");
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setPrintSettings(data.settings);
    } catch {
      // use defaults
    }
  };

  const goToStep = (step: Step) => setCurrentStep(step);

  const handleStart = () => {
    if (config.paymentEnabled) {
      goToStep("payment");
    } else {
      goToStep("frame");
    }
  };

  const addPhoto = (dataUrl: string, frames?: string[]) => {
    setPhotos((prev) => [...prev, dataUrl]);
    setIntermediateFrames((prev) => [...prev, frames || []]);
  };

  const resetAll = () => {
    setCurrentStep("start");
    setOrderId(null);
    setSelectedFrame(null);
    setSelectedBackground(null);
    setPhotos([]);
    setIntermediateFrames([]);
    setSelectedPhotos([]);
    setCompositeImage(null);
    setStickers([]);
    try { sessionStorage.removeItem("photobooth_session"); } catch {}
  };

  const slotsNeeded = selectedFrame ? FRAME_INFO[selectedFrame]?.count || 1 : 1;
  const maxCaptures = slotsNeeded * config.captureCount;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [idleRemaining, setIdleRemaining] = useState<number | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    setIdleRemaining(null);
  }, []);

  const advanceFromCurrentStep = useCallback(() => {
    switch (currentStep) {
      case "start":
        handleStart();
        break;
      case "payment":
        goToStep("frame");
        break;
      case "frame": {
        if (!selectedFrame) {
          const first = config.captureModes[0];
          if (first) setSelectedFrame(first);
        }
        goToStep("background");
        break;
      }
      case "background":
        if (selectedBackground === null) setSelectedBackground(-1);
        goToStep("camera");
        break;
      case "select": {
        if (selectedPhotos.length < slotsNeeded) {
          const auto = photos.map((_, i) => i).slice(0, slotsNeeded);
          setSelectedPhotos(auto);
        }
        goToStep("complete");
        break;
      }
      case "complete":
        resetAll();
        break;
    }
  }, [currentStep, selectedFrame, selectedBackground, selectedPhotos, slotsNeeded, photos, config.captureModes]);

  const startIdleTimer = useCallback(() => {
    clearIdleTimer();
    const seconds = config.idleTimeoutSeconds;
    if (seconds <= 0) return;

    const deadline = Date.now() + seconds * 1000;
    setIdleRemaining(seconds);

    tickRef.current = setInterval(() => {
      setIdleRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);

    timerRef.current = setTimeout(() => {
      clearIdleTimer();
      advanceFromCurrentStep();
    }, seconds * 1000);
  }, [config.idleTimeoutSeconds, clearIdleTimer, advanceFromCurrentStep]);

  useEffect(() => {
    if (currentStep === "camera") {
      clearIdleTimer();
      return;
    }
    startIdleTimer();
    return clearIdleTimer;
  }, [currentStep, startIdleTimer, clearIdleTimer]);

  const handleInteraction = useCallback(() => {
    if (currentStep !== "camera") startIdleTimer();
  }, [currentStep, startIdleTimer]);

  const showTimer = currentStep !== "start" && currentStep !== "camera" && idleRemaining !== null && config.idleTimeoutSeconds > 0;

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
    >
      {showTimer && (
        <div className="absolute top-0 left-0 right-0 z-50 h-1 bg-black/20">
          <div
            className="h-full bg-white/40 transition-all duration-1000 ease-linear"
            style={{ width: `${(idleRemaining! / config.idleTimeoutSeconds) * 100}%` }}
          />
        </div>
      )}
      <FloatingElements />
      {currentStep === "start" && (
        <StartSection
          onNext={handleStart}
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
          orderId={orderId}
          setOrderId={setOrderId}
          onNext={() => goToStep("frame")}
          onPrev={resetAll}
        />
      )}
      {currentStep === "frame" && (
        <FrameSection
          captureModes={config.captureModes}
          selectedFrame={selectedFrame}
          onSelect={setSelectedFrame}
          onNext={() => goToStep("background")}
          onPrev={() => (config.paymentEnabled ? goToStep("payment") : resetAll())}
        />
      )}
      {currentStep === "background" && (
        <BackgroundSection
          backgroundImages={backgroundImages}
          selectedBackground={selectedBackground}
          imageBaseUrl={imageBaseUrl}
          onSelect={setSelectedBackground}
          onNext={() => goToStep("camera")}
          onPrev={() => goToStep("frame")}
        />
      )}
      {currentStep === "camera" && (
        <CameraSection
          config={config}
          photos={photos}
          maxPhotos={maxCaptures}
          minPhotos={slotsNeeded}
          selectedBackground={selectedBackground}
          backgroundImages={backgroundImages}
          imageBaseUrl={imageBaseUrl}
          stickers={stickers}
          onStickersChange={setStickers}
          onCapture={addPhoto}
          onNext={() => {
            if (photos.length <= slotsNeeded) {
              setSelectedPhotos(photos.map((_, i) => i));
            }
            goToStep("select");
          }}
          onPrev={() => {
            setPhotos([]);
            goToStep("background");
          }}
        />
      )}
      {currentStep === "select" && (
        <SelectSection
          photos={photos}
          requiredCount={slotsNeeded}
          selectedPhotos={selectedPhotos}
          setSelectedPhotos={setSelectedPhotos}
          onNext={() => goToStep("complete")}
          onPrev={() => {
            setPhotos([]);
            setSelectedPhotos([]);
            goToStep("camera");
          }}
        />
      )}
      {currentStep === "complete" && (
        <CompleteSection
          photos={photos}
          selectedPhotos={selectedPhotos}
          selectedFrame={selectedFrame!}
          selectedBackground={selectedBackground}
          backgroundImages={backgroundImages}
          imageBaseUrl={imageBaseUrl}
          compositeImage={compositeImage}
          setCompositeImage={setCompositeImage}
          intermediateFrames={intermediateFrames}
          printSettings={printSettings}
          onRestart={resetAll}
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
