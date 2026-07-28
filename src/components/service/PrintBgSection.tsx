import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { FramedPreview } from "./FramedPreview";
import { ServiceNav } from "./ServiceNav";

export function PrintBgSection({
  printBgImages,
  selectedPrintBg,
  imageBaseUrl,
  selectedFrame,
  photos,
  selectedPhotos,
  printSettings,
  selectedBackground,
  backgroundImages,
  onSelect,
  onNext,
  onPrev,
}: {
  printBgImages: BGImage[];
  selectedPrintBg: number | null;
  imageBaseUrl: string;
  selectedFrame: string | null;
  photos: string[];
  selectedPhotos: number[];
  printSettings: Record<string, string>;
  selectedBackground?: number | null;
  backgroundImages?: BGImage[];
  onSelect: (id: number) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const { t } = useLanguage();

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-title font-extrabold text-white mb-16 portrait:mb-8 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("printbg.title")}
      </h2>

      <div className="flex items-start justify-center gap-12 mb-16 animate-fadeInUp portrait:flex-col portrait:items-center portrait:gap-6 portrait:mb-8">
        <div className="grid grid-cols-3 gap-8 portrait:grid-cols-2 portrait:gap-4">
          {printBgImages.map((bg) => (
            <div
              key={bg.id}
              className={`background-option w-52 h-32 relative ${selectedPrintBg === bg.id ? "selected" : ""}`}
              onClick={() => onSelect(bg.id)}
            >
              {selectedPrintBg === bg.id && <span className="check-mark">&#10003;</span>}
              <img
                src={`${imageBaseUrl}/${bg.filename}`}
                alt={bg.name}
                className="w-full h-full object-cover rounded-[13px]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          ))}
        </div>

        {selectedFrame && (
          <FramedPreview
            selectedFrame={selectedFrame}
            photos={photos}
            selectedPhotos={selectedPhotos}
            printSettings={printSettings}
            imageBaseUrl={imageBaseUrl}
            selectedBackground={selectedBackground}
            backgroundImages={backgroundImages}
            selectedPrintBg={selectedPrintBg}
            printBgImages={printBgImages}
          />
        )}
      </div>

      <ServiceNav onPrev={onPrev} onNext={onNext} nextDisabled={selectedPrintBg === null} />
    </section>
  );
}
