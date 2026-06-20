"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Step = "start" | "payment" | "frame" | "background" | "camera" | "select" | "complete";

function ServiceContent() {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("device") || "test";
  const [currentStep, setCurrentStep] = useState<Step>("start");
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  const goToStep = (step: Step) => {
    setCurrentStep(step);
  };

  const addPhoto = (photo: string) => {
    setPhotos((prev) => [...prev, photo]);
  };

  const resetAll = () => {
    setCurrentStep("start");
    setSelectedFrame(null);
    setSelectedBackground(null);
    setPhotos([]);
  };

  return (
    <div className="w-full h-screen overflow-hidden">
      {currentStep === "start" && (
        <StartSection onNext={() => goToStep("payment")} />
      )}
      {currentStep === "payment" && (
        <PaymentSection onNext={() => goToStep("frame")} onPrev={() => goToStep("start")} />
      )}
      {currentStep === "frame" && (
        <FrameSection
          selectedFrame={selectedFrame}
          onSelect={setSelectedFrame}
          onNext={() => goToStep("background")}
          onPrev={() => goToStep("start")}
        />
      )}
      {currentStep === "background" && (
        <BackgroundSection
          selectedBackground={selectedBackground}
          onSelect={setSelectedBackground}
          onNext={() => goToStep("camera")}
          onPrev={() => goToStep("frame")}
        />
      )}
      {currentStep === "camera" && (
        <CameraSection
          photos={photos}
          onCapture={addPhoto}
          onNext={() => goToStep("select")}
          onPrev={() => goToStep("background")}
        />
      )}
      {currentStep === "select" && (
        <SelectSection
          photos={photos}
          onNext={() => goToStep("complete")}
          onPrev={() => goToStep("camera")}
        />
      )}
      {currentStep === "complete" && (
        <CompleteSection onRestart={resetAll} />
      )}
    </div>
  );
}

export default function ServicePage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-gray-900" />}>
      <ServiceContent />
    </Suspense>
  );
}

function StartSection({ onNext }: { onNext: () => void }) {
  return (
    <section
      className="w-full h-full flex flex-col items-center justify-center cursor-pointer"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
      onClick={onNext}
    >
      <div className="text-center animate-slide-up">
        <h1 className="text-6xl font-bold mb-6 tracking-wider text-white">AR-pic</h1>
        <p className="text-xl text-gray-400 mb-16">AI 포토부스</p>
      </div>
      <button className="btn btn-primary text-2xl px-16 py-6 rounded-3xl shadow-2xl animate-pulse-slow">
        👆 화면을 터치해주세요
      </button>
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
    <section
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      <div className="bg-black/60 backdrop-blur-sm p-12 rounded-3xl border border-white/10 text-center max-w-lg">
        {!loading ? (
          <>
            <h2 className="text-3xl font-bold text-white mb-4">카드 결제</h2>
            <div className="text-5xl font-black text-white mb-4">1,000원</div>
            <p className="text-gray-400 mb-8">카드 결제를 진행해 주세요</p>
            <div className="flex gap-4 justify-center">
              <button className="btn btn-primary px-12 py-4" onClick={handlePayment}>
                결제하기
              </button>
              <button className="btn btn-secondary px-12 py-4" onClick={onPrev}>
                처음으로
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-6" />
            <p className="text-white text-xl mb-4">
              {progress < 30 ? "결제 처리 중..." : progress < 70 ? "결제 확인 중..." : "완료 처리 중..."}
            </p>
            <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden mx-auto">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
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
    { id: "1x1", label: "1x1", cols: 1, rows: 1 },
    { id: "1x2", label: "1x2", cols: 2, rows: 1 },
    { id: "2x2", label: "2x2", cols: 2, rows: 2 },
  ];

  return (
    <section
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      <h2 className="text-4xl font-bold text-white mb-12">프레임을 선택해 주세요</h2>
      <div className="flex gap-8 mb-12">
        {frames.map((frame) => (
          <button
            key={frame.id}
            className={`w-48 h-48 rounded-2xl flex flex-col items-center justify-center transition-all ${
              selectedFrame === frame.id
                ? "bg-white text-gray-900 scale-110"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            onClick={() => onSelect(frame.id)}
          >
            <div
              className="grid gap-1 mb-3"
              style={{
                gridTemplateColumns: `repeat(${frame.cols}, 1fr)`,
                gridTemplateRows: `repeat(${frame.rows}, 1fr)`,
              }}
            >
              {Array.from({ length: frame.cols * frame.rows }).map((_, i) => (
                <div key={i} className="w-8 h-6 bg-current opacity-50 rounded" />
              ))}
            </div>
            <span className="text-2xl font-bold">{frame.label}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-4">
        <button className="btn btn-secondary px-12 py-4" onClick={onPrev}>
          ◀ 이전으로
        </button>
        <button
          className="btn btn-primary px-12 py-4 disabled:opacity-50"
          onClick={onNext}
          disabled={!selectedFrame}
        >
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
    { id: 1, color: "from-pink-500 to-purple-500" },
    { id: 2, color: "from-blue-500 to-cyan-500" },
    { id: 3, color: "from-green-500 to-teal-500" },
    { id: 4, color: "from-yellow-500 to-orange-500" },
    { id: 5, color: "from-red-500 to-pink-500" },
    { id: 6, color: "from-indigo-500 to-purple-500" },
  ];

  return (
    <section
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      <h2 className="text-4xl font-bold text-white mb-12">배경을 선택해 주세요</h2>
      <div className="grid grid-cols-3 gap-6 mb-12">
        {backgrounds.map((bg) => (
          <button
            key={bg.id}
            className={`w-40 h-40 rounded-2xl bg-gradient-to-br ${bg.color} flex items-center justify-center text-4xl transition-all ${
              selectedBackground === bg.id ? "ring-4 ring-white scale-110" : "hover:scale-105"
            }`}
            onClick={() => onSelect(bg.id)}
          >
            {selectedBackground === bg.id && <span className="text-white">✓</span>}
          </button>
        ))}
      </div>
      <div className="flex gap-4">
        <button className="btn btn-secondary px-12 py-4" onClick={onPrev}>
          ◀ 이전으로
        </button>
        <button
          className="btn btn-primary px-12 py-4 disabled:opacity-50"
          onClick={onNext}
          disabled={selectedBackground === null}
        >
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
    } catch (err) {
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
    <section
      className="w-full h-full flex"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      <div className="flex-1 flex items-center justify-center relative p-8">
        <div className="relative w-full max-w-4xl aspect-video bg-gray-900 rounded-2xl overflow-hidden">
          {cameraError ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-red-400">{cameraError}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="text-9xl font-bold text-white animate-pulse">{countdown}</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-80 bg-black/40 p-6 flex flex-col">
        <h3 className="text-xl font-bold text-white mb-4">촬영 ({photos.length}/4)</h3>
        <div className="flex-1 grid grid-cols-2 gap-2 mb-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="aspect-[4/3] bg-gray-800 rounded-lg flex items-center justify-center"
            >
              {photos[i] ? (
                <span className="text-green-500 text-2xl">✓</span>
              ) : (
                <span className="text-gray-600 text-xl">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
        <button
          className="btn btn-primary w-full py-4 mb-4 disabled:opacity-50"
          onClick={capturePhoto}
          disabled={countdown !== null || photos.length >= 4}
        >
          📸 촬영하기
        </button>
        <div className="flex gap-2">
          <button className="btn btn-secondary flex-1 py-3" onClick={onPrev}>
            ◀ 이전
          </button>
          <button
            className="btn btn-primary flex-1 py-3 disabled:opacity-50"
            onClick={onNext}
            disabled={photos.length === 0}
          >
            다음 ▶
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
    setSelectedPhotos((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  return (
    <section
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      <h2 className="text-4xl font-bold text-white mb-12">사진을 선택해 주세요</h2>
      <div className="flex gap-6 mb-12">
        {photos.map((_, i) => (
          <button
            key={i}
            className={`w-48 h-36 bg-gray-800 rounded-2xl flex items-center justify-center text-4xl transition-all ${
              selectedPhotos.includes(i) ? "ring-4 ring-green-500 scale-105" : "hover:scale-105"
            }`}
            onClick={() => togglePhoto(i)}
          >
            {selectedPhotos.includes(i) ? (
              <span className="text-green-500">✓</span>
            ) : (
              <span className="text-gray-500">{i + 1}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-4">
        <button className="btn btn-secondary px-12 py-4" onClick={onPrev}>
          ◀ 이전으로
        </button>
        <button
          className="btn btn-primary px-12 py-4 disabled:opacity-50"
          onClick={onNext}
          disabled={selectedPhotos.length === 0}
        >
          다음으로 ▶
        </button>
      </div>
    </section>
  );
}

function CompleteSection({ onRestart }: { onRestart: () => void }) {
  return (
    <section
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
    >
      <div className="text-center">
        <h2 className="text-5xl font-bold text-white mb-4">🎉 완료!</h2>
        <p className="text-xl text-gray-400 mb-8">사진이 인쇄중입니다</p>
        <div className="w-64 h-64 bg-white rounded-2xl flex items-center justify-center mb-8 mx-auto shadow-2xl">
          <span className="text-6xl">📸</span>
        </div>
        <p className="text-gray-400 mb-8">QR 코드를 스캔하여 사진을 다운로드하세요</p>
        <button className="btn btn-primary px-12 py-4 text-xl" onClick={onRestart}>
          처음으로 돌아가기
        </button>
      </div>
    </section>
  );
}
