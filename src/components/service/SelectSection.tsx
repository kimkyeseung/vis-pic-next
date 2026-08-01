import { useState } from "react";
import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { FramedPreview } from "./FramedPreview";
import { ServiceNav } from "./ServiceNav";

// 한 페이지에 보여줄 촬영본 수 (2×2). 이보다 많으면 좌우 화살표로 페이지 전환.
const PAGE_SIZE = 4;

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

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount - 1);
  const pageStart = curPage * PAGE_SIZE;
  const pagePhotos = photos.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="w-full h-full grid grid-rows-[auto_auto_1fr] justify-items-center relative z-10 pt-12 portrait:pt-8 pb-44 portrait:pb-40">
      <h2 className="text-title font-extrabold text-white mb-4 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("select.title")}
      </h2>
      <p className="text-gray-400 text-xl animate-fadeInDown">
        {t("select.count", { req: requiredCount, sel: selectedPhotos.length })}
      </p>

      <div className="min-h-0 w-full flex items-center justify-center overflow-hidden">
      <div className="flex items-center justify-center gap-12 max-w-6xl max-h-full animate-fadeInUp portrait:flex-col portrait:items-center portrait:gap-6">
        {/* 촬영본이 많으면 4장씩 페이지로 나눠 좌우 화살표로 넘긴다 */}
        <div className="flex items-center gap-3">
          {pageCount > 1 && (
            <button
              className="shrink-0 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center transition-colors disabled:opacity-25 disabled:pointer-events-none"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={curPage === 0}
              aria-label="이전 사진"
            >
              &#9664;
            </button>
          )}

          <div className="flex flex-col items-center gap-3">
            <div className="grid grid-cols-2 gap-6 portrait:gap-4">
              {pagePhotos.map((photo, li) => {
                const i = pageStart + li;
                return (
                  <div
                    key={i}
                    className={`photo-thumbnail w-80 portrait:w-56 bg-black/30 relative overflow-hidden ${selectedPhotos.includes(i) ? "selected" : ""}`}
                    style={{ aspectRatio: "auto" }}
                    onClick={() => togglePhoto(i)}
                  >
                    {selectedPhotos.includes(i) && <span className="check-mark">&#10003;</span>}
                    <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-auto block" />
                  </div>
                );
              })}
            </div>
            {pageCount > 1 && (
              <div className="flex gap-2">
                {Array.from({ length: pageCount }).map((_, p) => (
                  <button
                    key={p}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${p === curPage ? "bg-white" : "bg-white/30 hover:bg-white/50"}`}
                    onClick={() => setPage(p)}
                    aria-label={`${p + 1}페이지`}
                  />
                ))}
              </div>
            )}
          </div>

          {pageCount > 1 && (
            <button
              className="shrink-0 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center transition-colors disabled:opacity-25 disabled:pointer-events-none"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={curPage >= pageCount - 1}
              aria-label="다음 사진"
            >
              &#9654;
            </button>
          )}
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
            scale={24}
          />
        )}
      </div>
      </div>

      <ServiceNav onPrev={onPrev} onNext={onNext} prevKey="select.reshoot" nextDisabled={!canProceed} />
    </section>
  );
}
