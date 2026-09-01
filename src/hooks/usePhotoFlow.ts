import { useState, useEffect } from "react";
import type { Step, DeviceConfig, Sticker, BGImage } from "@/types";
import { FRAME_INFO } from "@/constants/frames";

const SESSION_KEY = "photobooth_session_v3";

// 사진(photos)·중간프레임(intermediateFrames)은 용량(세션당 수십 MB, sessionStorage
// 5MB 쿼터 초과)·성능(촬영마다 전체 재직렬화) 때문에 저장하지 않는다. 따라서 사진이
// 필요한 단계(select 이후)로는 복원할 수 없고, 아래 단계까지만 그대로 복원한다.
// 그 밖의 단계로 저장돼 있으면 촬영 단계로 되돌려 같은 프레임/배경으로 재촬영하게 한다.
const RESTORABLE_STEPS: Step[] = ["payment", "frame", "background", "camera"];

export function usePhotoFlow(deviceId: string, config: DeviceConfig, printBgImages: BGImage[] = []) {
  const hasPrintBgImages = printBgImages.length > 0;
  const [currentStep, setCurrentStep] = useState<Step>("start");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [intermediateFrames, setIntermediateFrames] = useState<string[][]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [selectedPrintBg, setSelectedPrintBg] = useState<number | null>(null);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [preparedPhotoUrl, setPreparedPhotoUrl] = useState<string | null>(null);
  const [preparedGifUrl, setPreparedGifUrl] = useState<string | null>(null);
  const [preparedExpiryDate, setPreparedExpiryDate] = useState<string | null>(null);
  const [isPreparingComplete, setIsPreparingComplete] = useState(false);
  // 결제 화면에서 고른 인쇄 매수 — 인화 단계에서 이 수만큼 출력한다.
  const [printQuantity, setPrintQuantity] = useState(1);

  const slotsNeeded = selectedFrame ? FRAME_INFO[selectedFrame]?.count || 1 : 1;

  // 세션 복원 — sessionStorage는 SSR에 없으므로 하이드레이션 직후
  // 마이크로태스크 콜백에서 복원한다 (첫 렌더는 SSR 마크업과 일치 유지).
  // 사진은 저장하지 않으므로 단계·선택값(프레임/배경/매수 등)만 복원한다.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = sessionStorage.getItem(SESSION_KEY);
        if (!saved) return;
        const s = JSON.parse(saved);
        if (s.deviceId !== deviceId) return;
        // 사진이 필요한 단계로 저장돼 있으면 촬영 단계로 되돌려 재촬영하게 한다.
        if (s.step) setCurrentStep(RESTORABLE_STEPS.includes(s.step) ? s.step : "camera");
        if (s.orderId) setOrderId(s.orderId);
        if (s.selectedFrame) setSelectedFrame(s.selectedFrame);
        if (s.selectedBackground !== undefined) setSelectedBackground(s.selectedBackground);
        if (s.selectedPrintBg !== undefined) setSelectedPrintBg(s.selectedPrintBg);
        if (typeof s.printQuantity === "number" && s.printQuantity > 0) setPrintQuantity(s.printQuantity);
      } catch {
        // ignore parse errors
      }
    });
    return () => { cancelled = true; };
  }, [deviceId]);

  // 세션 저장 — 단계·선택값만(수 KB). 사진/중간프레임은 용량·성능 때문에 저장하지 않는다.
  useEffect(() => {
    if (currentStep === "start") return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        deviceId,
        step: currentStep,
        orderId,
        selectedFrame,
        selectedBackground,
        selectedPrintBg,
        printQuantity,
      }));
    } catch {
      // sessionStorage full or unavailable
    }
  }, [currentStep, deviceId, orderId, selectedFrame, selectedBackground, selectedPrintBg, printQuantity]);

  const goToStep = (step: Step) => setCurrentStep(step);

  const handleStart = () => {
    goToStep(config.paymentEnabled ? "payment" : "frame");
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
    setSelectedPrintBg(null);
    setCompositeImage(null);
    setPreparedPhotoUrl(null);
    setPreparedGifUrl(null);
    setPreparedExpiryDate(null);
    setIsPreparingComplete(false);
    setStickers([]);
    setPrintQuantity(1);
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  };

  const advanceFromCurrentStep = () => {
    switch (currentStep) {
      case "start":
        handleStart();
        break;
      case "payment":
        goToStep("frame");
        break;
      case "frame":
        if (!selectedFrame) {
          const first = config.captureModes[0];
          if (first) setSelectedFrame(first);
        }
        goToStep("background");
        break;
      case "background":
        if (selectedBackground === null) setSelectedBackground(-1);
        goToStep("camera");
        break;
      case "select":
        // 버튼(onNext)과 동일 경로로 진행: 사진 준비(업로드/합성)를 수행하고,
        // 인쇄배경이 없으면 printbg를 건너뛰고 complete로 이동한다.
        handleSelectNext(hasPrintBgImages);
        break;
      case "printbg":
        if (selectedPrintBg === null) {
          const first = printBgImages[0];
          if (first) setSelectedPrintBg(first.id);
        }
        goToStep("complete");
        break;
      case "complete":
        resetAll();
        break;
    }
  };

  const handleSelectNext = (hasPrintBgImages = false) => {
    // selectedPhotos는 슬롯 인덱스 배열(빈칸은 -1). 모든 슬롯이 유효하게 채워졌을 때만 그대로 쓰고,
    // (idle 자동 진행 등으로) 미완성이면 예전과 동일하게 앞에서부터 슬롯 수만큼 자동 채운다.
    const complete =
      selectedPhotos.length === slotsNeeded &&
      selectedPhotos.every((v) => typeof v === "number" && v >= 0);
    const selected = complete
      ? selectedPhotos
      : photos.map((_, i) => i).slice(0, slotsNeeded);
    setSelectedPhotos(selected);
    setPreparedPhotoUrl(null);
    setPreparedGifUrl(null);
    setPreparedExpiryDate(null);
    setCompositeImage(null);

    // 1컷·다컷 모두 완료화면(CompleteSection.createComposite)에서 프레임·슬롯을 합성하고
    // QR 업로드/GIF도 거기서 처리한다. 예전엔 1컷만 원본 사진을 미리 준비(업로드)해
    // hasPreparedImage=true가 되며 createComposite가 스킵돼 프레임이 빠졌다.
    goToStep(hasPrintBgImages ? "printbg" : "complete");
  };

  return {
    currentStep,
    orderId, setOrderId,
    selectedFrame, setSelectedFrame,
    selectedBackground, setSelectedBackground,
    selectedPrintBg, setSelectedPrintBg,
    photos, setPhotos,
    stickers, setStickers,
    intermediateFrames,
    selectedPhotos, setSelectedPhotos,
    printQuantity, setPrintQuantity,
    compositeImage, setCompositeImage,
    preparedPhotoUrl,
    preparedGifUrl,
    preparedExpiryDate,
    isPreparingComplete,
    slotsNeeded,
    goToStep,
    handleStart,
    addPhoto,
    resetAll,
    advanceFromCurrentStep,
    handleSelectNext,
  };
}
