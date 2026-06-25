import type { BGImage } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";

export function BackgroundSection({
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
