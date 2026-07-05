import { useLanguage } from "@/i18n/LanguageContext";

export function SelectSection({
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
      <h2 className="text-4xl font-extrabold text-white mb-6 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("select.title")}
      </h2>
      <p className="text-gray-400 text-xl mb-16 animate-fadeInDown">
        {t("select.count", { req: requiredCount, sel: selectedPhotos.length })}
      </p>

      <div className="flex flex-wrap justify-center gap-8 mb-20 max-w-6xl animate-fadeInUp">
        {photos.map((photo, i) => (
          <div
            key={i}
            className={`photo-thumbnail w-80 bg-black/30 relative overflow-hidden ${selectedPhotos.includes(i) ? "selected" : ""}`}
            style={{ aspectRatio: "auto" }}
            onClick={() => togglePhoto(i)}
          >
            {selectedPhotos.includes(i) && <span className="check-mark">&#10003;</span>}
            <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-auto block" />
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; {t("select.reshoot")}
        </button>
        <button
          className="service-button nav-button"
          onClick={onNext}
          style={!canProceed ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          {t("common.next")} &#9654;
        </button>
      </div>
    </section>
  );
}
