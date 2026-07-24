import type { BGImage } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { useLanguage } from "@/i18n/LanguageContext";
import { ServiceNav } from "./ServiceNav";

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
  const { t } = useLanguage();
  const hasDbImages = backgroundImages.length > 0;

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 portrait:mb-8 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("bg.title")}
      </h2>

      <div className="grid grid-cols-3 gap-8 mb-20 animate-fadeInUp portrait:grid-cols-2 portrait:gap-5 portrait:mb-10">
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

      <ServiceNav onPrev={onPrev} onNext={onNext} nextDisabled={selectedBackground === null} />
    </section>
  );
}
