"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Step = "start" | "payment" | "frame" | "background" | "camera" | "select" | "complete";

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
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  const goToStep = (step: Step) => setCurrentStep(step);
  const addPhoto = (photo: string) => setPhotos((prev) => [...prev, photo]);
  const resetAll = () => {
    setCurrentStep("start");
    setSelectedFrame(null);
    setSelectedBackground(null);
    setPhotos([]);
  };

  return (
    <div className="w-full h-screen overflow-hidden relative">
      <FloatingElements />
      {currentStep === "start" && <StartSection onNext={() => goToStep("payment")} />}
      {currentStep === "payment" && <PaymentSection onNext={() => goToStep("frame")} onPrev={() => goToStep("start")} />}
      {currentStep === "frame" && (
        <FrameSection selectedFrame={selectedFrame} onSelect={setSelectedFrame} onNext={() => goToStep("background")} onPrev={() => goToStep("start")} />
      )}
      {currentStep === "background" && (
        <BackgroundSection selectedBackground={selectedBackground} onSelect={setSelectedBackground} onNext={() => goToStep("camera")} onPrev={() => goToStep("frame")} />
      )}
      {currentStep === "camera" && (
        <CameraSection photos={photos} onCapture={addPhoto} onNext={() => goToStep("select")} onPrev={() => goToStep("background")} />
      )}
      {currentStep === "select" && <SelectSection photos={photos} onNext={() => goToStep("complete")} onPrev={() => goToStep("camera")} />}
      {currentStep === "complete" && <CompleteSection onRestart={resetAll} />}
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
          <span className="animate-touchBounce inline-block mr-5 text-3xl">👆</span>
          화면을 터치해주세요
        </button>

        <img src="/static/images/viswave_logo.png" className="mt-24 opacity-80" style={{ width: "200px" }} alt="Viswave" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>

      <div className="absolute bottom-16 text-center text-gray-500 animate-fadeInUp" style={{ animationDelay: "1s" }}>
        <p className="mb-2">화면 아무 곳이나 터치하여 시작하세요</p>
        <p className="animate-blink">● 대기중 ●</p>
      </div>
    </section>
  );
}

function PaymentSection({ onNext, onPrev }: { onNext: () => void; onPrev: () => void }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handlePayment = () => {
    setLoading(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 100 / 30;
      setProgress(Math.min(100, p));
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(onNext, 300);
      }
    }, 50);
  };

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInDown">
        <h2 className="text-4xl font-extrabold text-white mb-16" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
          결제
        </h2>
      </div>

      <div className="bg-black/30 backdrop-blur-sm p-16 rounded-3xl border border-white/10 text-center animate-fadeInUp">
        {!loading ? (
          <>
            <div className="text-6xl font-black text-white mb-4">1,000원</div>
            <p className="text-gray-400 text-xl mb-12">카드 결제를 진행해 주세요</p>
            <div className="flex gap-6 justify-center">
              <button className="service-button nav-button" onClick={handlePayment}>
                결제하기
              </button>
              <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
                처음으로
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-24 h-24 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl mb-6">
              {progress < 30 ? "결제 처리 중..." : progress < 70 ? "결제 확인 중..." : "완료 처리 중..."}
            </p>
            <div className="w-80 h-3 bg-white/20 rounded-full overflow-hidden mx-auto">
              <div className="h-full bg-green-500 rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FrameSection({
  selectedFrame,
  onSelect,
  onNext,
  onPrev,
}: {
  selectedFrame: string | null;
  onSelect: (frame: string) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const frames = [
    { id: "1x1", label: "1컷", cols: 1, rows: 1 },
    { id: "1x2", label: "2컷", cols: 2, rows: 1 },
    { id: "2x2", label: "4컷", cols: 2, rows: 2 },
  ];

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
            {selectedFrame === frame.id && <span className="check-mark">✓</span>}
            <div className="w-36 h-44 mx-auto mb-5 bg-black/30 rounded-xl flex items-center justify-center">
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${frame.cols}, 1fr)`, gridTemplateRows: `repeat(${frame.rows}, 1fr)` }}
              >
                {Array.from({ length: frame.cols * frame.rows }).map((_, i) => (
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
          ◀ 이전으로
        </button>
        <button className={`service-button nav-button ${!selectedFrame ? "disabled" : ""}`} onClick={onNext} style={!selectedFrame ? { opacity: 0.5, pointerEvents: "none" } : {}}>
          다음으로 ▶
        </button>
      </div>
    </section>
  );
}

function BackgroundSection({
  selectedBackground,
  onSelect,
  onNext,
  onPrev,
}: {
  selectedBackground: number | null;
  onSelect: (bg: number) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const backgrounds = [
    { id: 1, gradient: "linear-gradient(135deg, #ff6b9d 0%, #c44fd5 100%)" },
    { id: 2, gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
    { id: 3, gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" },
    { id: 4, gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)" },
    { id: 5, gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
    { id: 6, gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  ];

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        배경을 선택해 주세요
      </h2>

      <div className="grid grid-cols-3 gap-8 mb-20 animate-fadeInUp">
        {backgrounds.map((bg) => (
          <div
            key={bg.id}
            className={`background-option w-52 h-32 relative ${selectedBackground === bg.id ? "selected" : ""}`}
            style={{ background: bg.gradient }}
            onClick={() => onSelect(bg.id)}
          >
            {selectedBackground === bg.id && <span className="check-mark">✓</span>}
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          ◀ 이전으로
        </button>
        <button className={`service-button nav-button`} onClick={onNext} style={selectedBackground === null ? { opacity: 0.5, pointerEvents: "none" } : {}}>
          다음으로 ▶
        </button>
      </div>
    </section>
  );
}

function CameraSection({
  photos,
  onCapture,
  onNext,
  onPrev,
}: {
  photos: string[];
  onCapture: (photo: string) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1920, height: 1080, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError("카메라를 사용할 수 없습니다");
    }
  };

  const capturePhoto = () => {
    if (countdown !== null || photos.length >= 4) return;
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
        onCapture(`photo-${Date.now()}`);
      }
    }, 1000);
  };

  return (
    <section className="w-full h-full flex relative z-10">
      {/* 카메라 영역 */}
      <div className="flex-[7.5] flex items-center justify-center p-8">
        <div className="camera-preview w-full max-w-5xl aspect-video relative">
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
              <span className="text-6xl mb-5 opacity-30">📷</span>
              <p className="text-white/60">{cameraError}</p>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
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

      {/* 메뉴 영역 */}
      <div className="flex-[2.5] p-8 flex flex-col">
        <h3 className="text-2xl font-bold text-white mb-8">촬영 ({photos.length}/4)</h3>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-[4/3] bg-black/30 rounded-xl flex items-center justify-center border-2 border-white/10">
              {photos[i] ? (
                <span className="text-green-500 text-4xl">✓</span>
              ) : (
                <span className="text-white/30 text-2xl">{i + 1}</span>
              )}
            </div>
          ))}
        </div>

        <button
          className="service-button w-full py-5 rounded-2xl text-xl mb-6"
          onClick={capturePhoto}
          style={countdown !== null || photos.length >= 4 ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          📸 촬영하기
        </button>

        <div className="mt-auto flex flex-col gap-3">
          <button className="service-button nav-button w-full" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
            ◀ 이전으로
          </button>
          <button
            className="service-button nav-button w-full"
            onClick={onNext}
            style={photos.length === 0 ? { opacity: 0.5, pointerEvents: "none" } : {}}
          >
            다음으로 ▶
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectSection({
  photos,
  onNext,
  onPrev,
}: {
  photos: string[];
  onNext: () => void;
  onPrev: () => void;
}) {
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);

  const togglePhoto = (index: number) => {
    setSelectedPhotos((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  };

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        인화할 사진을 선택해 주세요
      </h2>

      <div className="flex gap-8 mb-20 animate-fadeInUp">
        {photos.map((_, i) => (
          <div
            key={i}
            className={`photo-thumbnail w-56 bg-black/30 flex items-center justify-center relative ${selectedPhotos.includes(i) ? "selected" : ""}`}
            onClick={() => togglePhoto(i)}
          >
            {selectedPhotos.includes(i) && <span className="check-mark">✓</span>}
            <span className="text-white/30 text-4xl">{i + 1}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          ◀ 이전으로
        </button>
        <button className="service-button nav-button" onClick={onNext} style={selectedPhotos.length === 0 ? { opacity: 0.5, pointerEvents: "none" } : {}}>
          다음으로 ▶
        </button>
      </div>
    </section>
  );
}

function CompleteSection({ onRestart }: { onRestart: () => void }) {
  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInUp">
        <h2 className="text-6xl font-extrabold text-white mb-6" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
          🎉 완료!
        </h2>
        <p className="text-2xl text-gray-400 mb-12">사진이 인쇄중입니다</p>

        <div className="w-72 h-72 bg-white rounded-3xl flex items-center justify-center mb-12 mx-auto" style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
          <span className="text-8xl">📸</span>
        </div>

        <p className="text-gray-500 text-lg mb-12">QR 코드를 스캔하여 사진을 다운로드하세요</p>

        <button className="service-button touch-button" style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }} onClick={onRestart}>
          처음으로 돌아가기
        </button>
      </div>
    </section>
  );
}
