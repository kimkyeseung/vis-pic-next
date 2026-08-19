import { useState } from "react";
import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { FRAME_INFO } from "@/constants/frames";
import { FramedPreview } from "./FramedPreview";
import { SectionShell } from "./SectionShell";
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

  // 오른쪽 인화 미리보기 축척: 왼쪽 2×2 촬영본 그리드(≈2행)와 위아래 높이가
  // 맞도록 키운다. 세로 용지(2컷 등)는 같은 배율이면 훨씬 커지므로 방향별로
  // 배율을 달리해 미리보기 "높이"를 그리드와 비슷하게 유지한다(가로 용지 50 / 세로 용지 34).
  const previewIsPortrait =
    selectedFrame != null && FRAME_INFO[selectedFrame]?.orientation === "portrait";
  const previewScale = previewIsPortrait ? 34 : 50;

  // 세로 화면 + 촬영본 4장 + 세로 용지 프레임(2컷 등): 왼쪽 사진을 세로 1열로 세우고
  // 미리보기를 오른쪽에 나란히 둔다(첨부 레이아웃). 가로 용지 프레임(가로 4컷=2x2 등)은
  // 미리보기가 넓어 옆에 두면 어색하므로 제외 → 기존 세로 배치(2×2 위, 미리보기 아래)를 쓴다.
  // CSS portrait: 변형으로 세로 화면에서만 1열 배치가 적용된다.
  const fourShotColumn = photos.length === 4 && previewIsPortrait;
  // 촬영본 2장(1컷 등): 좌우로 나란히 두면 세로 1행이라 오른쪽 큰 미리보기보다 훨씬 낮다.
  // 세로 1열로 쌓아 두 장 합 높이가 미리보기 높이(가로 용지 기준 ≈500)와 맞도록 한다.
  const twoShotColumn = photos.length === 2;
  // 1컷(가로 용지 + 촬영본 2장): 세로 화면에서 위쪽 사진과 아래 미리보기의 좌우 폭을 맞추고,
  // 콘텐츠가 세로 공간을 채우도록 넓혀 타이틀↔콘텐츠 사이 여백(세로 중앙 정렬 여백)을 줄인다.
  // 사진 폭 portrait:w-[560px] ↔ 미리보기 폭 15×37=555로 맞춘다(세로로 넘치지 않는 최대치).
  // 가로 화면은 기존 배율(previewScale=50)을 유지한다.
  const oneCutColumn = twoShotColumn && !previewIsPortrait;
  const oneCutPortraitScale = 37;
  // 세로 화면에서는 세로 높이 여유가 커서 미리보기를 더 크게 키운다(사진 1열 높이와 비슷하게).
  // 가로 용지는 세로 화면 폭에 맞춰 더 작게 잡는다.
  const portraitBigScale = previewIsPortrait ? 64 : 46;

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount - 1);
  const pageStart = curPage * PAGE_SIZE;
  const pagePhotos = photos.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <SectionShell
      title={t("select.title")}
      titleClassName="text-center mb-4"
      rows="auto_auto_1fr"
      onPrev={onPrev}
      onNext={onNext}
      nextDisabled={!canProceed}
    >
      {/* 사진 영역(1fr)이 위로 넘쳐 문구와 겹치지 않도록 하단 여백으로 간격 확보. */}
      <p className="text-gray-400 text-xl mb-12 portrait:mb-8 animate-fadeInDown">
        {t("select.count", { req: requiredCount, sel: filledCount })}
      </p>

      <div className="min-h-0 w-full flex items-center justify-center">
      <div className={`flex items-center justify-center gap-12 max-w-[1550px] max-h-full animate-fadeInUp ${fourShotColumn ? "portrait:gap-8" : "portrait:flex-col portrait:items-center portrait:gap-6"}`}>
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
            <div className={`grid gap-6 portrait:gap-4 ${twoShotColumn ? "grid-cols-1" : "grid-cols-2"} ${fourShotColumn ? "portrait:grid-cols-1" : ""}`}>
              {pagePhotos.map((photo, li) => {
                const i = pageStart + li;
                const slotOf = photoToSlot.get(i);
                const isSelected = slotOf !== undefined;
                return (
                  <div
                    key={i}
                    className={`photo-thumbnail w-80 ${fourShotColumn ? "portrait:w-[330px]" : oneCutColumn ? "portrait:w-[560px]" : "portrait:w-[420px]"} bg-black/30 relative overflow-hidden ${isSelected ? "selected" : ""}`}
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

        {selectedFrame && (() => {
          const previewProps = {
            selectedFrame,
            photos,
            selectedPhotos,
            printSettings,
            imageBaseUrl,
            selectedBackground,
            backgroundImages,
            printBgImages,
            activeSlot,
            onSlotClick: setActiveSlot,
          };
          // 촬영본 4장: 가로 화면은 그리드 정렬용(previewScale), 세로 화면은 크게(portraitBigScale).
          // CSS로 방향에 따라 하나만 보이게 한다(JS는 미리보기의 강제세로를 감지하지 못함).
          if (fourShotColumn) {
            return (
              <>
                <div className="portrait:hidden">
                  <FramedPreview {...previewProps} scale={previewScale} />
                </div>
                <div className="hidden portrait:block">
                  <FramedPreview {...previewProps} scale={portraitBigScale} />
                </div>
              </>
            );
          }
          // 1컷: 세로 화면에서만 미리보기를 줄여(oneCutPortraitScale) 위쪽 사진 폭과 맞춘다.
          if (oneCutColumn) {
            return (
              <>
                <div className="portrait:hidden">
                  <FramedPreview {...previewProps} scale={previewScale} />
                </div>
                <div className="hidden portrait:block">
                  <FramedPreview {...previewProps} scale={oneCutPortraitScale} />
                </div>
              </>
            );
          }
          return <FramedPreview {...previewProps} scale={previewScale} />;
        })()}
      </div>
      </div>
    </SectionShell>
  );
}
