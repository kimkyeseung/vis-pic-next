import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";

export function PrintBgSection({
  printBgImages,
  selectedPrintBg,
  imageBaseUrl,
  onSelect,
  onNext,
  onPrev,
}: {
  printBgImages: BGImage[];
  selectedPrintBg: number | null;
  imageBaseUrl: string;
  onSelect: (id: number) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const { t } = useLanguage();

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("printbg.title")}
      </h2>

      <div className="grid grid-cols-3 gap-8 mb-20 animate-fadeInUp">
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

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; {t("common.prev")}
        </button>
        <button
          className="service-button nav-button"
          onClick={onNext}
          style={selectedPrintBg === null ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          {t("common.next")} &#9654;
        </button>
      </div>
    </section>
  );
}
