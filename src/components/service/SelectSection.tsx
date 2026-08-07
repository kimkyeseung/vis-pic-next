import { useState } from "react";
import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { FramedPreview } from "./FramedPreview";
import { ServiceNav } from "./ServiceNav";
import { SERVICE_SECTION_CLASS } from "./sectionLayout";
import { normalizeSlots, firstEmptySlot, tapPhoto } from "@/lib/slotSelection";

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
  printBgImages,
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
  printBgImages?: BGImage[];
  onNext: () => void;
  onPrev: () => void;
}) {
  const { t } = useLanguage();

  // 슬롯-인덱스 표현: 길이 requiredCount, 각 칸은 사진 index 또는 -1(빈칸).
  // (다운스트림 FramedPreview·CompleteSection도 슬롯 i ← selectedPhotos[i]로 읽는다)
  const slots = normalizeSlots(selectedPhotos, requiredCount);

  // 사진 index → 배치된 슬롯 index (한 사진은 한 슬롯만)
  const photoToSlot = new Map<number, number>();
  slots.forEach((p, s) => { if (p >= 0) photoToSlot.set(p, s); });

  // 아무 슬롯도 안 고르면 첫 빈 슬롯이 active로 시작하고, 사진을 넣을 때마다 다음 순번으로 이동한다.
  const [activeSlot, setActiveSlot] = useState(() => firstEmptySlot(slots));

  const filledCount = slots.filter((v) => v >= 0).length;
  const canProceed = filledCount === requiredCount;

  const handlePhotoTap = (photoIndex: number) => {
    const result = tapPhoto(slots, activeSlot, photoIndex);
    setSelectedPhotos(result.slots);
    setActiveSlot(result.activeSlot);
  };

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount - 1);
  const pageStart = curPage * PAGE_SIZE;
  const pagePhotos = photos.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className={`${SERVICE_SECTION_CLASS} grid-rows-[auto_auto_1fr]`}>
      <h2 className="text-title font-extrabold text-white mb-4 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("select.title")}
      </h2>
      {/* 사진 영역(1fr)이 위로 넘쳐 문구와 겹치지 않도록 하단 여백으로 간격 확보. */}
      <p className="text-gray-400 text-xl mb-12 portrait:mb-8 animate-fadeInDown">
        {t("select.count", { req: requiredCount, sel: filledCount })}
      </p>

      <div className="min-h-0 w-full flex items-center justify-center">
      <div className="flex items-center justify-center gap-12 max-w-6xl max-h-full animate-fadeInUp portrait:flex-col portrait:items-center portrait:gap-6">
        {/* 촬영본이 많으면 4장씩 페이지로 나눠 좌우 화살표로 넘긴다 */}
        <div className="flex items-center gap-3">
          {pageCount > 1 && (
            <button
              className="shrink-0 px-1 text-white/70 hover:text-white text-4xl leading-none transition-colors disabled:opacity-25 disabled:pointer-events-none"
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
                const slotOf = photoToSlot.get(i);
                const isSelected = slotOf !== undefined;
                return (
                  <div
                    key={i}
                    className={`photo-thumbnail w-80 portrait:w-[420px] bg-black/30 relative overflow-hidden ${isSelected ? "selected" : ""}`}
                    style={{ aspectRatio: "auto" }}
                    onClick={() => handlePhotoTap(i)}
                  >
                    {isSelected && (
                      // 배치된 슬롯 번호를 배지로 보여준다.
                      <span
                        className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-lg shadow"
                        style={{ background: "var(--theme-primary, #6c6fb4)" }}
                      >
                        {slotOf! + 1}
                      </span>
                    )}
                    {isSelected && <span className="check-mark">&#10003;</span>}
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
              className="shrink-0 px-1 text-white/70 hover:text-white text-4xl leading-none transition-colors disabled:opacity-25 disabled:pointer-events-none"
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
            printBgImages={printBgImages}
            scale={24}
            activeSlot={activeSlot}
            onSlotClick={setActiveSlot}
          />
        )}
      </div>
      </div>

      <ServiceNav onPrev={onPrev} onNext={onNext} prevKey="select.reshoot" nextDisabled={!canProceed} />
    </section>
  );
}
