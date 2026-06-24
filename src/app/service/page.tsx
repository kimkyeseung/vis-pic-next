"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

type Step = "start" | "payment" | "frame" | "background" | "camera" | "select" | "complete";

type BgRemovalMode = "mediapipe" | "chromakey" | "off";

interface DeviceConfig {
  deviceId: string;
  deviceName: string;
  paymentEnabled: boolean;
  paymentAmount: number;
  captureSeconds: number;
  captureCount: number;
  chromakeyRgb: string;
  captureModes: string[];
  bgRemovalMode: BgRemovalMode;
}

interface BGImage {
  id: number;
  name: string;
  filename: string;
}

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
};

const FALLBACK_BACKGROUNDS = [
  { id: -1, gradient: "linear-gradient(135deg, #ff6b9d 0%, #c44fd5 100%)", name: "Pink Purple" },
  { id: -2, gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", name: "Blue Cyan" },
  { id: -3, gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", name: "Green Mint" },
  { id: -4, gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", name: "Pink Yellow" },
  { id: -5, gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", name: "Indigo Purple" },
  { id: -6, gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", name: "Pink Red" },
];

const FRAME_INFO: Record<string, { label: string; cols: number; rows: number; count: number }> = {
  "1x1": { label: "1컷", cols: 1, rows: 1, count: 1 },
  "1x2": { label: "2컷", cols: 2, rows: 1, count: 2 },
  "2x1": { label: "2컷", cols: 1, rows: 2, count: 2 },
  "2x2": { label: "4컷", cols: 2, rows: 2, count: 4 },
  "2x3": { label: "6컷", cols: 3, rows: 2, count: 6 },
  "2x4": { label: "8컷", cols: 4, rows: 2, count: 8 },
  "4x1": { label: "4컷", cols: 1, rows: 4, count: 4 },
};

function FloatingElements() {
  return (
    <>
      <div className="pattern-overlay" />
      <div className="floating-elements">
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
      </div>
    </>
  );
}

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
  const [intermediateFrames, setIntermediateFrames] = useState<string[][]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("/static/images");

  useEffect(() => {
    loadDeviceConfig(deviceId);
    loadBackgrounds(deviceId);
  }, [deviceId]);

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
  };

  const slotsNeeded = selectedFrame ? FRAME_INFO[selectedFrame]?.count || 1 : 1;
  const maxCaptures = slotsNeeded * config.captureCount;

  return (
    <div className="w-full h-screen overflow-hidden relative">
      <FloatingElements />
      {currentStep === "start" && <StartSection onNext={handleStart} />}
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

/* ───── Start ───── */
function StartSection({ onNext }: { onNext: () => void }) {
  return (
    <section className="w-full h-full flex flex-col items-center justify-center cursor-pointer relative z-10" onClick={onNext}>
      <div className="main-container flex flex-col items-center">
        <div className="logo-section text-center mb-24 animate-fadeInDown">
          <h1 className="text-7xl font-extrabold mb-5 tracking-widest text-white" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
            AR-pic
          </h1>
        </div>
        <button
          className="service-button touch-button animate-pulse-button"
          style={{ animationDelay: "0.5s" }}
          onClick={(e) => { e.stopPropagation(); onNext(); }}
        >
          <span className="animate-touchBounce inline-block mr-5 text-3xl">&#128070;</span>
          화면을 터치해주세요
        </button>
        <img src="/static/images/viswave_logo.png" className="mt-24 opacity-80" style={{ width: "200px" }} alt="Viswave" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>
      <div className="absolute bottom-16 text-center text-gray-500 animate-fadeInUp" style={{ animationDelay: "1s" }}>
        <p className="mb-2">화면 아무 곳이나 터치하여 시작하세요</p>
        <p className="animate-blink">● 대기중 ●</p>
      </div>
    </section>
  );
}

/* ───── Payment ───── */
function PaymentSection({
  config,
  orderId,
  setOrderId,
  onNext,
  onPrev,
}: {
  config: DeviceConfig;
  orderId: string | null;
  setOrderId: (id: string | null) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "requesting" | "waiting" | "completed" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const requestPayment = async () => {
    setStatus("requesting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/payments/request/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: config.deviceId, amount: config.paymentAmount }),
      });
      const data = await res.json();
      if (data.orderId) {
        setOrderId(data.orderId);
        setStatus("waiting");
        startPolling(data.orderId);
      } else {
        setErrorMsg(data.error || "결제 요청 실패");
        setStatus("error");
      }
    } catch {
      setErrorMsg("서버에 연결할 수 없습니다");
      setStatus("error");
    }
  };

  const startPolling = (oid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 150) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("error");
        setErrorMsg("결제 시간이 초과되었습니다");
        return;
      }
      try {
        const res = await fetch(`/api/payments/status/${oid}`);
        const data = await res.json();
        if (data.paymentStatus === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("completed");
          setTimeout(onNext, 800);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  };

  const devBypass = () => {
    setStatus("completed");
    setTimeout(onNext, 500);
  };

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInDown">
        <h2 className="text-4xl font-extrabold text-white mb-16" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
          결제
        </h2>
      </div>

      <div className="bg-black/30 backdrop-blur-sm p-16 rounded-3xl border border-white/10 text-center animate-fadeInUp min-w-[500px]">
        {status === "idle" && (
          <>
            <div className="text-6xl font-black text-white mb-4">
              {config.paymentAmount.toLocaleString()}원
            </div>
            <p className="text-gray-400 text-xl mb-12">카드 결제를 진행해 주세요</p>
            <div className="flex gap-6 justify-center">
              <button className="service-button nav-button" onClick={requestPayment}>
                결제하기
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                처음으로
              </button>
            </div>
          </>
        )}

        {status === "requesting" && (
          <div className="py-8">
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">결제 요청 중...</p>
          </div>
        )}

        {status === "waiting" && (
          <div className="py-8">
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl mb-4">결제 대기중</p>
            <p className="text-gray-400 text-lg mb-8">카드를 리더기에 대주세요</p>
            <button className="text-gray-500 text-sm underline" onClick={devBypass}>
              결제 건너뛰기 (개발 모드)
            </button>
          </div>
        )}

        {status === "completed" && (
          <div className="py-8">
            <div className="text-6xl mb-6">&#10003;</div>
            <p className="text-green-400 text-2xl font-bold">결제 완료!</p>
          </div>
        )}

        {status === "error" && (
          <>
            <p className="text-red-400 text-xl mb-6">{errorMsg}</p>
            <div className="flex gap-4 justify-center">
              <button className="service-button nav-button" onClick={requestPayment}>
                다시 시도
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={devBypass}>
                건너뛰기
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                처음으로
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ───── Frame Selection ───── */
function FrameSection({
  captureModes,
  selectedFrame,
  onSelect,
  onNext,
  onPrev,
}: {
  captureModes: string[];
  selectedFrame: string | null;
  onSelect: (frame: string) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const frames = captureModes
    .map((mode) => ({ id: mode, ...FRAME_INFO[mode] }))
    .filter((f) => f.label);

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        프레임을 선택해 주세요
      </h2>

      <div className="flex gap-10 mb-20 animate-fadeInUp">
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`frame-option w-64 text-center ${selectedFrame === frame.id ? "selected" : ""}`}
            onClick={() => onSelect(frame.id)}
          >
            {selectedFrame === frame.id && <span className="check-mark">&#10003;</span>}
            <div className="w-36 h-44 mx-auto mb-5 bg-black/30 rounded-xl flex items-center justify-center">
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${frame.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${frame.rows}, 1fr)`,
                }}
              >
                {Array.from({ length: frame.count }).map((_, i) => (
                  <div key={i} className="w-10 h-8 bg-white/40 rounded" />
                ))}
              </div>
            </div>
            <span className="text-2xl font-bold text-white">{frame.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; 이전으로
        </button>
        <button
          className={`service-button nav-button ${!selectedFrame ? "disabled" : ""}`}
          onClick={onNext}
          style={!selectedFrame ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          다음으로 &#9654;
        </button>
      </div>
    </section>
  );
}

/* ───── Background Selection ───── */
function BackgroundSection({
  backgroundImages,
  selectedBackground,
  imageBaseUrl,
  onSelect,
  onNext,
  onPrev,
}: {
  backgroundImages: BGImage[];
  selectedBackground: number | null;
  imageBaseUrl: string;
  onSelect: (bg: number) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const hasDbImages = backgroundImages.length > 0;

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        배경을 선택해 주세요
      </h2>

      <div className="grid grid-cols-3 gap-8 mb-20 animate-fadeInUp">
        {hasDbImages
          ? backgroundImages.map((bg) => {
              const isVideo = bg.filename.endsWith(".mp4") || bg.filename.endsWith(".webm");
              return (
                <div
                  key={bg.id}
                  className={`background-option w-52 h-32 relative ${selectedBackground === bg.id ? "selected" : ""}`}
                  onClick={() => onSelect(bg.id)}
                >
                  {selectedBackground === bg.id && <span className="check-mark">&#10003;</span>}
                  {isVideo ? (
                    <video
                      src={`${imageBaseUrl}/${bg.filename}`}
                      className="w-full h-full object-cover rounded-[13px]"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  ) : (
                    <img
                      src={`${imageBaseUrl}/${bg.filename}`}
                      alt={bg.name}
                      className="w-full h-full object-cover rounded-[13px]"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
              );
            })
          : FALLBACK_BACKGROUNDS.map((bg) => (
              <div
                key={bg.id}
                className={`background-option w-52 h-32 relative ${selectedBackground === bg.id ? "selected" : ""}`}
                style={{ background: bg.gradient }}
                onClick={() => onSelect(bg.id)}
              >
                {selectedBackground === bg.id && <span className="check-mark">&#10003;</span>}
              </div>
            ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; 이전으로
        </button>
        <button
          className="service-button nav-button"
          onClick={onNext}
          style={selectedBackground === null ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          다음으로 &#9654;
        </button>
      </div>
    </section>
  );
}

/* ───── Camera Capture ───── */
function CameraSection({
  config,
  photos,
  maxPhotos,
  minPhotos,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  onCapture,
  onNext,
  onPrev,
}: {
  config: DeviceConfig;
  photos: string[];
  maxPhotos: number;
  minPhotos: number;
  selectedBackground: number | null;
  backgroundImages: BGImage[];
  imageBaseUrl: string;
  onCapture: (dataUrl: string, frames?: string[]) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgSourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmenterRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [segmenterStatus, setSegmenterStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const bgRemovalMode = config.bgRemovalMode;

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
      setSegmenterStatus("idle");
      return;
    }
    let cancelled = false;
    setSegmenterStatus("loading");

    async function initSegmenter() {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
        );
        if (cancelled) return;
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite",
          },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
        });
        if (cancelled) return;
        segmenterRef.current = segmenter;
        setSegmenterStatus("ready");
      } catch (err) {
        console.error("MediaPipe initialization failed:", err);
        if (!cancelled) setSegmenterStatus("error");
      }
    }

    initSegmenter();
    return () => {
      cancelled = true;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, [bgRemovalMode]);

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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      const e = err as DOMException;
      if (e.name === "NotAllowedError") {
        setCameraError("카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.");
      } else if (e.name === "NotFoundError") {
        setCameraError("연결된 카메라가 없습니다.");
      } else if (e.name === "NotReadableError") {
        setCameraError("카메라가 다른 프로그램에서 사용 중입니다.");
      } else {
        setCameraError(`카메라를 사용할 수 없습니다 (${e.name || e.message})`);
      }
    }
  };

  useEffect(() => {
    startCamera();
    const video = videoRef.current;
    return () => {
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    const offscreen = document.createElement("canvas");
    const HARD = 50 * 50;
    const SOFT = 100 * 100;

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
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      if (offscreen.width !== w) offscreen.width = w;
      if (offscreen.height !== h) offscreen.height = h;
      const offCtx = offscreen.getContext("2d")!;

      offCtx.drawImage(video, 0, 0, w, h);

      let processed = false;

      if (bgRemovalMode === "mediapipe" && segmenterRef.current) {
        try {
          const result = segmenterRef.current.segmentForVideo(video, performance.now());
          const masks = result.confidenceMasks;
          if (masks && masks.length > 0) {
            const personIdx = masks.length > 1 ? 1 : 0;
            const mask = masks[personIdx].getAsFloat32Array();
            const imageData = offCtx.getImageData(0, 0, w, h);
            const data = imageData.data;
            for (let i = 0; i < mask.length; i++) {
              data[i * 4 + 3] = Math.round(mask[i] * 255);
            }
            offCtx.putImageData(imageData, 0, 0);
            processed = true;
          }
        } catch (err) {
          console.error("Segmentation error:", err);
        }
      } else if (bgRemovalMode === "chromakey") {
        const imageData = offCtx.getImageData(0, 0, w, h);
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

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedBackground, chromaKey, bgRemovalMode, drawBackground]);

  const capturePhoto = useCallback(() => {
    if (countdown !== null || photos.length >= maxPhotos) return;
    let count = config.captureSeconds;
    setCountdown(count);
    const frames: string[] = [];

    // 카운트다운 시작 시 첫 중간 프레임 캡처
    if (displayCanvasRef.current) {
      frames.push(displayCanvasRef.current.toDataURL("image/jpeg", 0.85));
    }

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
        // 매초 중간 프레임 캡처
        if (displayCanvasRef.current) {
          frames.push(displayCanvasRef.current.toDataURL("image/jpeg", 0.85));
        }
      } else {
        clearInterval(interval);
        setCountdown(null);

        if (displayCanvasRef.current) {
          // 최종 프레임도 중간 프레임에 추가
          frames.push(displayCanvasRef.current.toDataURL("image/jpeg", 0.85));
          const dataUrl = displayCanvasRef.current.toDataURL("image/jpeg", 0.92);
          onCapture(dataUrl, frames);
        }

        setFlash(true);
        setTimeout(() => setFlash(false), 200);
      }
    }, 1000);
  }, [countdown, photos.length, maxPhotos, config.captureSeconds, onCapture]);

  const canProceed = photos.length >= minPhotos;

  return (
    <section className="w-full h-full flex relative z-10">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {flash && <div className="fixed inset-0 bg-white z-50 pointer-events-none animate-flash" />}

      <div className="flex-[7.5] flex items-center justify-center p-8">
        <div className="camera-preview w-full max-w-5xl aspect-video relative">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
              <span className="text-6xl mb-5 opacity-30">&#128247;</span>
              <p className="text-white/60 mb-6">{cameraError}</p>
              <div className="flex gap-3">
                <button
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors"
                  onClick={() => { setCameraError(null); startCamera(); }}
                >
                  다시 시도
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
            <canvas ref={displayCanvasRef} className="camera-video" />
          )}
          {bgRemovalMode === "mediapipe" && segmenterStatus === "loading" && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white text-sm px-4 py-2 rounded-lg">
              AI 모델 로딩 중...
            </div>
          )}
          {bgRemovalMode === "mediapipe" && segmenterStatus === "error" && (
            <div className="absolute bottom-4 left-4 bg-red-900/80 text-white text-sm px-4 py-2 rounded-lg">
              AI 모델 로드 실패
            </div>
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-[200px] font-extrabold text-white animate-countdown" key={countdown} style={{ textShadow: "0 0 60px rgba(255,255,255,0.5)" }}>
                {countdown}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-[2.5] p-8 flex flex-col">
        <h3 className="text-2xl font-bold text-white mb-8">
          촬영 ({photos.length}/{maxPhotos})
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {Array.from({ length: maxPhotos }, (_, i) => (
            <div key={i} className="aspect-[4/3] bg-black/30 rounded-xl flex items-center justify-center border-2 border-white/10 overflow-hidden">
              {photos[i] ? (
                <img src={photos[i]} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white/30 text-2xl">{i + 1}</span>
              )}
            </div>
          ))}
        </div>

        <button
          className="service-button w-full py-5 rounded-2xl text-xl mb-6"
          onClick={capturePhoto}
          style={countdown !== null || photos.length >= maxPhotos ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          &#128248; 촬영하기
        </button>

        <div className="mt-auto flex flex-col gap-3">
          <button className="service-button nav-button w-full" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
            &#9664; 이전으로
          </button>
          <button
            className="service-button nav-button w-full"
            onClick={onNext}
            style={!canProceed ? { opacity: 0.5, pointerEvents: "none" } : {}}
          >
            다음으로 &#9654;
          </button>
        </div>
      </div>
    </section>
  );
}

/* ───── Select Photos ───── */
function SelectSection({
  photos,
  requiredCount,
  selectedPhotos,
  setSelectedPhotos,
  onNext,
  onPrev,
}: {
  photos: string[];
  requiredCount: number;
  selectedPhotos: number[];
  setSelectedPhotos: (sel: number[]) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const togglePhoto = (index: number) => {
    setSelectedPhotos(
      selectedPhotos.includes(index)
        ? selectedPhotos.filter((i) => i !== index)
        : selectedPhotos.length < requiredCount
          ? [...selectedPhotos, index]
          : selectedPhotos
    );
  };

  const canProceed = selectedPhotos.length === requiredCount;

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-6 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        인화할 사진을 선택해 주세요
      </h2>
      <p className="text-gray-400 text-xl mb-16 animate-fadeInDown">
        {requiredCount}장을 선택해 주세요 ({selectedPhotos.length}/{requiredCount})
      </p>

      <div className="flex gap-8 mb-20 animate-fadeInUp">
        {photos.map((photo, i) => (
          <div
            key={i}
            className={`photo-thumbnail w-56 bg-black/30 flex items-center justify-center relative overflow-hidden ${selectedPhotos.includes(i) ? "selected" : ""}`}
            onClick={() => togglePhoto(i)}
          >
            {selectedPhotos.includes(i) && <span className="check-mark">&#10003;</span>}
            <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; 다시 촬영
        </button>
        <button
          className="service-button nav-button"
          onClick={onNext}
          style={!canProceed ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          다음으로 &#9654;
        </button>
      </div>
    </section>
  );
}

/* ───── Complete & Print ───── */
function CompleteSection({
  photos,
  selectedPhotos,
  selectedFrame,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  compositeImage,
  setCompositeImage,
  intermediateFrames,
  onRestart,
}: {
  photos: string[];
  selectedPhotos: number[];
  selectedFrame: string;
  selectedBackground: number | null;
  backgroundImages: BGImage[];
  imageBaseUrl: string;
  compositeImage: string | null;
  setCompositeImage: (img: string | null) => void;
  intermediateFrames: string[][];
  onRestart: () => void;
}) {
  const [printStatus, setPrintStatus] = useState<"compositing" | "ready" | "printing" | "done" | "error">("compositing");
  const [qrPhotoUrl, setQrPhotoUrl] = useState<string | null>(null);
  const [qrGifUrl, setQrGifUrl] = useState<string | null>(null);
  const [qrExpiryDate, setQrExpiryDate] = useState<string | null>(null);
  const compositeRef = useRef(false);

  const toFullUrl = (url: string) =>
    url.startsWith("http") ? url : window.location.origin + url;

  const uploadForQR = async (dataUrl: string) => {
    let photoUrl: string | null = null;

    try {
      const res = await fetch("/api/print/upload-image/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: dataUrl, image_type: "photo" }),
      });
      const data = await res.json();
      if (data.success && data.image_url) {
        photoUrl = toFullUrl(data.image_url);
        setQrPhotoUrl(photoUrl);
        setQrExpiryDate(data.expiry_date);
      }
    } catch {
      // photo upload failed silently
    }

    const selectedIndices = selectedPhotos;
    const allFrames = selectedIndices
      .flatMap((i) => intermediateFrames[i] || [])
      .filter(Boolean);
    const gifSources =
      allFrames.length >= 2
        ? allFrames
        : selectedIndices.map((i) => photos[i]).filter(Boolean);
    const gifDuration = allFrames.length >= 2 ? 500 : 800;

    if (gifSources.length >= 2) {
      try {
        const resizedImages = await Promise.all(
          gifSources.map((src) => resizeForGif(src, 400))
        );
        const gifRes = await fetch("/api/gif/create/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: resizedImages, duration: gifDuration }),
        });
        const gifData = await gifRes.json();
        if (gifData.success && gifData.gif_url) {
          setQrGifUrl(toFullUrl(gifData.gif_url));
          if (!qrExpiryDate && gifData.expiry_date) {
            setQrExpiryDate(gifData.expiry_date);
          }
        } else if (photoUrl) {
          setQrGifUrl(photoUrl);
        }
      } catch {
        if (photoUrl) setQrGifUrl(photoUrl);
      }
    } else if (photoUrl) {
      setQrGifUrl(photoUrl);
    }
  };

  const createComposite = async () => {
    const frame = FRAME_INFO[selectedFrame];
    if (!frame) return;

    const padding = 20;
    const canvasWidth = 1200;
    const cellW = (canvasWidth - padding * (frame.cols + 1)) / frame.cols;
    const cellH = cellW * 3 / 4;
    const canvasHeight = Math.round(cellH * frame.rows + padding * (frame.rows + 1));

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d")!;

    const bgInfo = selectedBackground !== null && selectedBackground > 0
      ? backgroundImages.find((b) => b.id === selectedBackground)
      : null;

    if (bgInfo) {
      try {
        const bgImg = await loadImage(`${imageBaseUrl}/${bgInfo.filename}`);
        ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
      } catch {
        fillGradient(ctx, canvasWidth, canvasHeight);
      }
    } else {
      const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === selectedBackground);
      if (fb) {
        fillGradientFromCSS(ctx, canvasWidth, canvasHeight, fb.gradient);
      } else {
        fillGradient(ctx, canvasWidth, canvasHeight);
      }
    }

    for (let i = 0; i < selectedPhotos.length && i < frame.count; i++) {
      const photo = photos[selectedPhotos[i]];
      if (!photo) continue;

      const col = i % frame.cols;
      const row = Math.floor(i / frame.cols);
      const x = padding + col * (cellW + padding);
      const y = padding + row * (cellH + padding);

      try {
        const img = await loadImage(photo);

        ctx.save();
        roundRect(ctx, x, y, cellW, cellH, 12);
        ctx.clip();

        const imgAspect = img.width / img.height;
        const cellAspect = cellW / cellH;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (imgAspect > cellAspect) {
          sw = img.height * cellAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / cellAspect;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);

        ctx.restore();

        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 3;
        roundRect(ctx, x, y, cellW, cellH, 12);
        ctx.stroke();
      } catch {
        // skip failed photo
      }
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setCompositeImage(dataUrl);
    setPrintStatus("ready");

    uploadForQR(dataUrl);
  };

  useEffect(() => {
    if (!compositeRef.current) {
      compositeRef.current = true;
      createComposite();
    }
  }, []);

  const handlePrint = async () => {
    if (!compositeImage) return;
    setPrintStatus("printing");

    const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

    if (isTauri) {
      try {
        const blob = await fetch(compositeImage).then((r) => r.blob());
        const buffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        const binary = Array.from(uint8).map((b) => String.fromCharCode(b)).join("");
        const base64 = btoa(binary);

        const tauri = (window as unknown as { __TAURI__: { core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__;
        const settings = await tauri.core.invoke("load_settings", {}) as Record<string, string>;
        const printerName = settings?.printer || "";

        if (printerName) {
          await tauri.core.invoke("print_image", { printerName, imageData: base64 });
        }

        setPrintStatus("done");
      } catch {
        setPrintStatus("done");
      }
    } else {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <html><head><title>AR-pic</title>
          <style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;}
          img{max-width:100%;max-height:100vh;object-fit:contain;}
          @media print{body{background:#fff;}img{max-width:100%;max-height:100%;}}
          </style></head>
          <body><img src="${compositeImage}" onload="window.print();"/></body></html>
        `);
        printWindow.document.close();
      }
      setPrintStatus("done");
    }
  };

  const handleDownload = () => {
    if (!compositeImage) return;
    const link = document.createElement("a");
    link.download = `arpic-${Date.now()}.jpg`;
    link.href = compositeImage;
    link.click();
  };

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInUp">
        {printStatus === "compositing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">사진 합성 중...</p>
          </>
        )}

        {(printStatus === "ready" || printStatus === "done") && compositeImage && (
          <>
            <h2 className="text-5xl font-extrabold text-white mb-6" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
              {printStatus === "done" ? "완료!" : "사진이 완성되었습니다!"}
            </h2>

            <div className="flex items-start justify-center gap-12 mb-10">
              <div className="rounded-2xl overflow-hidden" style={{ maxWidth: "500px", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
                <img src={compositeImage} alt="Composite" className="w-full" />
              </div>

              {(qrPhotoUrl || qrGifUrl) && (
                <div className="flex flex-col items-center gap-6">
                  <div className="flex gap-6">
                    {qrPhotoUrl && (
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center">
                        <div className="text-2xl mb-1">📷</div>
                        <p className="text-white font-semibold mb-3">사진 다운로드</p>
                        <div
                          className="bg-white p-3 rounded-xl cursor-pointer"
                          onDoubleClick={() => window.open(qrPhotoUrl, "_blank")}
                        >
                          <QRCodeSVG value={qrPhotoUrl} size={120} />
                        </div>
                        <p className="text-gray-400 text-xs mt-2">QR 스캔</p>
                      </div>
                    )}
                    {qrGifUrl && (
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center">
                        <div className="text-2xl mb-1">🎬</div>
                        <p className="text-white font-semibold mb-3">GIF 다운로드</p>
                        <div
                          className="bg-white p-3 rounded-xl cursor-pointer"
                          onDoubleClick={() => window.open(qrGifUrl, "_blank")}
                        >
                          <QRCodeSVG value={qrGifUrl} size={120} />
                        </div>
                        <p className="text-gray-400 text-xs mt-2">QR 스캔</p>
                      </div>
                    )}
                  </div>

                  {qrExpiryDate && (
                    <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full text-sm">
                      <span>⏰</span>
                      <span className="text-gray-300">
                        <strong className="text-white">{qrExpiryDate}</strong> 까지 다운로드 가능
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-6 justify-center mb-8">
              {printStatus === "ready" && (
                <button className="service-button nav-button" onClick={handlePrint}>
                  &#128424; 인쇄하기
                </button>
              )}
              <button className="service-button nav-button" onClick={handleDownload}>
                &#128190; 다운로드
              </button>
            </div>

            {printStatus === "done" && (
              <p className="text-gray-400 text-lg mb-8">인쇄가 완료되었습니다</p>
            )}

            <button
              className="service-button touch-button"
              style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }}
              onClick={onRestart}
            >
              처음으로 돌아가기
            </button>
          </>
        )}

        {printStatus === "printing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">인쇄 중...</p>
          </>
        )}

        {printStatus === "error" && (
          <>
            <p className="text-red-400 text-xl mb-8">인쇄 중 오류가 발생했습니다</p>
            <button className="service-button nav-button" onClick={handlePrint}>
              다시 시도
            </button>
            <button className="service-button touch-button mt-6" style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }} onClick={onRestart}>
              처음으로 돌아가기
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/* ───── Helpers ───── */
function resizeForGif(src: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillGradient(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#667eea");
  grad.addColorStop(1, "#764ba2");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function fillGradientFromCSS(ctx: CanvasRenderingContext2D, w: number, h: number, cssGradient: string) {
  const colorMatch = cssGradient.match(/#[0-9a-fA-F]{6}/g);
  if (colorMatch && colorMatch.length >= 2) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, colorMatch[0]);
    grad.addColorStop(1, colorMatch[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    fillGradient(ctx, w, h);
  }
}
