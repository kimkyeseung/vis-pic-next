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
  // filename이 이미 완전한 URL/데이터 URI면 그대로 사용(미리보기 목업 대응), 아니면 baseUrl 붙임
  const srcOf = (filename: string) =>
    /^(https?:|data:|blob:)/.test(filename) ? filename : `${imageBaseUrl}/${filename}`;

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
              // 타일이 프레임 이미지의 실제 비율에 딱 맞도록(빈 공간·잘림 없이) 높이는 이미지에서 결정
              className={`background-option w-72 portrait:w-64 relative ${selectedPrintBg === bg.id ? "selected" : ""}`}
              style={{ aspectRatio: "auto" }}
              onClick={() => onSelect(bg.id)}
            >
              {selectedPrintBg === bg.id && <span className="check-mark">&#10003;</span>}
              <img
                src={srcOf(bg.filename)}
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
