import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { FramedPreview } from "./FramedPreview";
import { ServiceNav } from "./ServiceNav";

export function SelectSection({
  photos,
  requiredCount,
  selectedPhotos,
  setSelectedPhotos,
  selectedFrame,
  printSettings,
  imageBaseUrl,
  selectedBackground,
  backgroundImages,
  onNext,
  onPrev,
}: {
  photos: string[];
  requiredCount: number;
  selectedPhotos: number[];
  setSelectedPhotos: (sel: number[]) => void;
  selectedFrame: string | null;
  printSettings: Record<string, string>;
  imageBaseUrl: string;
  selectedBackground?: number | null;
  backgroundImages?: BGImage[];
  onNext: () => void;
  onPrev: () => void;
}) {
  const { t } = useLanguage();
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
      <h2 className="text-title font-extrabold text-white mb-6 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("select.title")}
      </h2>
      <p className="text-gray-400 text-xl mb-16 portrait:mb-6 animate-fadeInDown">
        {t("select.count", { req: requiredCount, sel: selectedPhotos.length })}
      </p>

      <div className="flex items-start justify-center gap-12 mb-16 max-w-6xl animate-fadeInUp portrait:flex-col portrait:items-center portrait:gap-6 portrait:mb-8">
        <div className="flex flex-wrap justify-center gap-8 max-w-5xl portrait:gap-4">
          {photos.map((photo, i) => (
            <div
              key={i}
              className={`photo-thumbnail w-[26rem] portrait:w-56 bg-black/30 relative overflow-hidden ${selectedPhotos.includes(i) ? "selected" : ""}`}
              style={{ aspectRatio: "auto" }}
              onClick={() => togglePhoto(i)}
            >
              {selectedPhotos.includes(i) && <span className="check-mark">&#10003;</span>}
              <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-auto block" />
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
          />
        )}
      </div>

      <ServiceNav onPrev={onPrev} onNext={onNext} prevKey="select.reshoot" nextDisabled={!canProceed} />
    </section>
  );
}
