import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { resolveImageSrc } from "@/lib/imageUrl";
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
    <section className="w-full h-full grid grid-rows-[auto_1fr] justify-items-center relative z-10 pt-24 portrait:pt-16 pb-52 portrait:pb-40">
      <h2 className="text-title font-extrabold text-white animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("printbg.title")}
      </h2>

      <div className="min-h-0 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-10 animate-fadeInUp portrait:grid-cols-2 portrait:gap-6">
          {printBgImages.map((bg) => (
            <div
              key={bg.id}
              // 타일이 프레임 이미지의 실제 비율에 딱 맞도록(빈 공간·잘림 없이) 높이는 이미지에서 결정
              className={`background-option w-72 portrait:w-64 relative ${selectedPrintBg === bg.id ? "selected" : ""}`}
              style={{ aspectRatio: "auto" }}
              onClick={() => onSelect(bg.id)}
            >
              {selectedPrintBg === bg.id && <span className="check-mark">&#10003;</span>}
              <img
                src={resolveImageSrc(bg.filename, imageBaseUrl)}
                alt={bg.name}
                className="w-full h-auto block rounded-[13px]"
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
