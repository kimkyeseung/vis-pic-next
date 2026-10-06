"use client";

import type { BGImage } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { ServiceNav } from "./ServiceNav";
import { SectionTitle } from "./SectionShell";
import { SERVICE_BIG_BUTTON_CLASS } from "./sectionLayout";
import { useCompositeGeneration } from "./complete/useCompositeGeneration";
import { useResultLayout } from "./complete/useResultLayout";
import { QRDownloadCard } from "./complete/QRDownloadCard";

export function CompleteSection({
  photos,
  selectedPhotos,
  selectedFrame,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  compositeImage,
  setCompositeImage,
  intermediateFrames,
  printSettings,
  selectedPrintBg,
  printBgImages,
  preparedPhotoUrl,
  preparedGifUrl,
  preparedExpiryDate,
  printQuantity = 1,
  onPrev,
  onRestart,
}: {
  photos: string[];
  selectedPhotos: number[];
  selectedFrame: string;
  selectedBackground: number | null;
  backgroundImages: BGImage[];
  imageBaseUrl: string;
  compositeImage: string | null;
  setCompositeImage: (img: string | null) => void;
  intermediateFrames: string[][];
  printSettings: Record<string, string>;
  selectedPrintBg?: number | null;
  printBgImages?: BGImage[];
  preparedPhotoUrl?: string | null;
  preparedGifUrl?: string | null;
  preparedExpiryDate?: string | null;
  /** 결제 화면에서 선택한 인쇄 매수. 이 수만큼 출력한다. */
  printQuantity?: number;
  /** 이전 단계로 이동 (좌하단 "이전") */
  onPrev: () => void;
  onRestart: () => void;
}) {
  const { t } = useLanguage();

  // 합성 이미지 생성 + QR 업로드 + 인쇄 — useCompositeGeneration 참고.
  const { printStatus, printError, qrPhotoUrl, qrGifUrl, qrExpiryDate, handlePrint } = useCompositeGeneration({
    photos, selectedPhotos, selectedFrame, selectedBackground, backgroundImages, imageBaseUrl,
    compositeImage, setCompositeImage, intermediateFrames, printSettings,
    selectedPrintBg, printBgImages, preparedPhotoUrl, preparedGifUrl, preparedExpiryDate, printQuantity,
  });

  // 좌우(미리보기|QR) 배치 반응형 측정 — useResultLayout 참고.
  const { sectionRef, previewBoxRef, previewH, matchHeight, photoMaxHClass } = useResultLayout({
    selectedFrame, compositeImage, printStatus,
  });

  return (
    <section ref={sectionRef} className="w-full h-full flex flex-col items-center justify-start pt-14 pb-52 portrait:justify-center portrait:pt-0 portrait:pb-0 relative z-10">
      <div className="w-full flex-1 flex flex-col text-center animate-fadeInUp portrait:flex-none portrait:px-16">
        {/* 타이틀은 다른 페이지처럼 상단 고정(pt-14 — getServiceSectionClass와 동일). 본문은 아래 flex-1 영역에서 중앙 정렬한다. */}
        {(printStatus === "ready" || printStatus === "done") && compositeImage && (
          <SectionTitle className="portrait:text-5xl break-keep mb-16 portrait:mb-8">
            {printStatus === "done" ? t("complete.done") : t("complete.ready")}
          </SectionTitle>
        )}
        {/* 남은 세로 공간에서 본문(미리보기·QR·로딩·에러)을 중앙 정렬. 세로 화면은 flex-none으로 기존 스택 유지. */}
        <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-center portrait:flex-none">
        {printStatus === "compositing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">{t("complete.compositing")}</p>
          </>
        )}

        {(printStatus === "ready" || printStatus === "done") && compositeImage && (
          <>
            {/* 좌우 반반(12컬럼 6/6): 미리보기 | QR. 세로에선 상하 스택.
                가로 결과물(matchHeight)에선 QR 카드 상·하단을 프레임에 맞추려 상단 정렬. */}
            <div className={`flex justify-center gap-10 mb-6 w-full max-w-[1600px] mx-auto portrait:flex-col portrait:items-center portrait:gap-8 portrait:w-full ${matchHeight ? "items-start" : "items-center"}`}>
              <div className="flex-1 flex justify-center min-w-0 portrait:w-full">
                <div ref={previewBoxRef} className="rounded-2xl overflow-hidden" style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
                  {/* 스테이지 고정 높이(가로 1080·세로 1920) 기준 px 상한 — 레터박스(창≠스테이지)에서도 정확. */}
                  <img src={compositeImage} alt="Composite" className={`${photoMaxHClass} portrait:max-h-[883px] portrait:max-w-full w-auto object-contain block`} />
                </div>
              </div>

              {(qrPhotoUrl || qrGifUrl) && (
                <div className="flex-1 flex flex-col items-center gap-6 min-w-0 portrait:w-full">
                  {/* matchHeight면 카드 블록 높이를 프레임 높이로 고정 → 카드가 stretch되어 상·하단 일치 */}
                  <div className="flex gap-6 portrait:gap-4 max-w-full portrait:w-full" style={matchHeight ? { height: previewH ?? undefined } : undefined}>
                    {qrPhotoUrl && <QRDownloadCard url={qrPhotoUrl} label={t("complete.photoDl")} matchHeight={matchHeight} />}
                    {qrGifUrl && <QRDownloadCard url={qrGifUrl} label={t("complete.gifDl")} matchHeight={matchHeight} />}
                  </div>

                  {qrExpiryDate && (
                    <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full text-sm">
                      <span className="text-gray-300">
                        {t("complete.expiry")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {printStatus === "done" && (
              <p className="text-gray-400 text-lg">{t("complete.printDone")}</p>
            )}
          </>
        )}

        {printStatus === "printing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">{t("complete.printing")}</p>
          </>
        )}

        {printStatus === "error" && (
          <>
            <p className="text-red-400 text-xl mb-4">{t("complete.printError")}</p>
            {printError && (
              <p className="text-red-300 text-sm mb-8 font-mono bg-black/40 px-4 py-2 rounded max-w-lg break-all">{printError}</p>
            )}
            <button className="service-button nav-button" onClick={handlePrint}>
              {t("common.retry")}
            </button>
            <button className="service-button touch-button mt-6" style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }} onClick={onRestart}>
              {t("complete.restart")}
            </button>
          </>
        )}
        </div>
      </div>

      {/* 하단 고정 버튼은 애니메이션(transform) 래퍼 밖 = section 기준으로 절대배치한다.
          transform이 걸린 안쪽 div를 기준으로 잡으면 QR 로드로 콘텐츠 높이가 커질 때
          버튼이 아래로 밀려 내려가므로, section 직속에 두어 위치를 고정한다. */}
      {compositeImage && printStatus === "ready" && (
        <ServiceNav onPrev={onPrev} onNext={handlePrint} nextKey="complete.print" role="print" />
      )}
      {compositeImage && printStatus === "done" && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
          <button className={`service-button nav-next-lg btn-role-restart ${SERVICE_BIG_BUTTON_CLASS}`} onClick={onRestart}>
            {t("complete.restart")}
          </button>
        </div>
      )}
    </section>
  );
}
