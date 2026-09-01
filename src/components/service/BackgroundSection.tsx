import type { BGImage } from "@/types";
import { FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { useLanguage } from "@/i18n/LanguageContext";
import { SectionShell } from "./SectionShell";

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
    <SectionShell
      title={t("bg.title")}
      titleClassName="text-center portrait:whitespace-pre-line"
      onPrev={onPrev}
      onNext={onNext}
      nextDisabled={selectedBackground === null}
    >
      <div className="min-h-0 w-full flex items-center justify-center px-10 portrait:px-16">
      <div className="grid grid-cols-3 gap-6 w-full max-w-[1320px] animate-fadeInUp portrait:grid-cols-2 portrait:gap-6">
        {hasDbImages
          ? backgroundImages.map((bg) => {
              const isVideo = bg.filename.endsWith(".mp4") || bg.filename.endsWith(".webm");
              return (
                <div
                  key={bg.id}
                  className={`background-option w-full relative ${selectedBackground === bg.id ? "selected" : ""}`}
                  style={{ aspectRatio: "4 / 3" }}
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
                className={`background-option w-full relative ${selectedBackground === bg.id ? "selected" : ""}`}
                style={{ background: bg.gradient, aspectRatio: "4 / 3" }}
                onClick={() => onSelect(bg.id)}
              >
                {selectedBackground === bg.id && <span className="check-mark">&#10003;</span>}
              </div>
            ))}
      </div>
      </div>
    </SectionShell>
  );
}
