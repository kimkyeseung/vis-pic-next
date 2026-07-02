import { useState, useEffect } from "react";
import type { Step, DeviceConfig, Sticker } from "@/types";
import { FRAME_INFO } from "@/constants/frames";

const SESSION_KEY = "photobooth_session_v2";

export function usePhotoFlow(deviceId: string, config: DeviceConfig) {
  const [currentStep, setCurrentStep] = useState<Step>("start");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [intermediateFrames, setIntermediateFrames] = useState<string[][]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [preparedPhotoUrl, setPreparedPhotoUrl] = useState<string | null>(null);
  const [preparedGifUrl, setPreparedGifUrl] = useState<string | null>(null);
  const [preparedExpiryDate, setPreparedExpiryDate] = useState<string | null>(null);
  const [isPreparingComplete, setIsPreparingComplete] = useState(false);

  const slotsNeeded = selectedFrame ? FRAME_INFO[selectedFrame]?.count || 1 : 1;

  // 세션 복원
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
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
  }, [deviceId]);

  // 세션 저장
  useEffect(() => {
    if (currentStep === "start") return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
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
    setCompositeImage(null);
    setPreparedPhotoUrl(null);
    setPreparedGifUrl(null);
    setPreparedExpiryDate(null);
    setIsPreparingComplete(false);
    setStickers([]);
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
      case "select": {
        if (selectedPhotos.length < slotsNeeded) {
          setSelectedPhotos(photos.map((_, i) => i).slice(0, slotsNeeded));
        }
        goToStep("complete");
        break;
      }
      case "complete":
        resetAll();
        break;
    }
  };

  const toFullUrl = (url: string) => {
    if (url.startsWith("http")) return url;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin + url;
  };

  const uploadPreparedPhoto = async (dataUrl: string, frames: string[]) => {
    const res = await fetch("/api/print/upload-image/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: dataUrl, image_type: "photo" }),
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.image_url) {
      throw new Error(data.error || "Failed to upload photo");
    }
    const fullUrl = toFullUrl(data.image_url);
    setPreparedPhotoUrl(fullUrl);
    setPreparedExpiryDate(data.expiry_date || null);

    const gifSources = frames.length >= 2 ? frames : [];
    if (gifSources.length < 2) { setPreparedGifUrl(null); return; }

    try {
      const gifRes = await fetch("/api/gif/create/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: gifSources, duration: 500 }),
      });
      const gifData = await gifRes.json();
      if (gifRes.ok && gifData.success && gifData.gif_url) {
        setPreparedGifUrl(toFullUrl(gifData.gif_url));
        setPreparedExpiryDate(gifData.expiry_date || data.expiry_date || null);
      } else {
        setPreparedGifUrl(null);
      }
    } catch {
      setPreparedGifUrl(null);
    }
  };

  const handleSelectNext = async () => {
    const selected = selectedPhotos.length === slotsNeeded
      ? selectedPhotos
      : photos.map((_, i) => i).slice(0, slotsNeeded);
    setSelectedPhotos(selected);
    setPreparedPhotoUrl(null);
    setPreparedGifUrl(null);
    setPreparedExpiryDate(null);
    setCompositeImage(null);

    const selectedPhoto = slotsNeeded === 1 ? photos[selected[0]] : null;
    if (!selectedPhoto) { goToStep("complete"); return; }

    setIsPreparingComplete(true);
    try {
      setCompositeImage(selectedPhoto);
      await uploadPreparedPhoto(selectedPhoto, intermediateFrames[selected[0]] || []);
      goToStep("complete");
    } catch (error) {
      console.error("Failed to prepare selected photo:", error);
      goToStep("complete");
    } finally {
      setIsPreparingComplete(false);
    }
  };

  return {
    currentStep,
    orderId, setOrderId,
    selectedFrame, setSelectedFrame,
    selectedBackground, setSelectedBackground,
    photos, setPhotos,
    stickers, setStickers,
    intermediateFrames,
    selectedPhotos, setSelectedPhotos,
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
