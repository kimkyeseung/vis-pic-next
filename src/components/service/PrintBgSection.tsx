import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { ServiceNav } from "./ServiceNav";

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
    <section className="w-full h-full grid grid-rows-[auto_1fr] justify-items-center relative z-10 pt-12 portrait:pt-8 pb-44 portrait:pb-40">
      <h2 className="text-title font-extrabold text-white animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("printbg.title")}
      </h2>

      <div className="min-h-0 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-10 animate-fadeInUp portrait:grid-cols-2 portrait:gap-6">
          {printBgImages.map((bg) => (
            <div
              key={bg.id}
              className={`background-option w-80 h-48 portrait:w-72 portrait:h-44 relative ${selectedPrintBg === bg.id ? "selected" : ""}`}
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
      </div>

      <ServiceNav onPrev={onPrev} onNext={onNext} nextDisabled={selectedPrintBg === null} />
    </section>
  );
}
