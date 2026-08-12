import { FRAME_INFO } from "@/constants/frames";
import { computePrintLayout } from "@/lib/printLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { ServiceNav } from "./ServiceNav";
import { resolveImageSrc } from "@/lib/imageUrl";
import { SERVICE_SECTION_CLASS } from "./sectionLayout";
import type { BGImage, FrameInfoEntry } from "@/types";

// 미리보기 축척: 1cm → 12px (인화지 10×15cm 기준 120×180px)
const PREVIEW_SCALE = 12;

// 대표 프레임이 없을 때의 중립 용지 색
const FRAME_PLACEHOLDER = "#3f3f46";

/**
 * 컷 선택 단계 용지 미리보기용 대표 프레임(첫 번째) 이미지 URL. 없으면 null.
 * (프레임은 나중 "프레임 선택" 단계에서 확정 — 여기선 대표로 미리 보여준다)
 */
function resolveFrameSrc(printBgImages: BGImage[], imageBaseUrl: string): string | null {
  const first = printBgImages[0];
  if (!first) return null;
  return resolveImageSrc(first.filename, imageBaseUrl);
}

/** 실제 인화지 비율(10×15cm)과 공용 레이아웃 계산을 축소해 그리는 미리보기 */
function PaperPreview({
  mode,
  frame,
  frameSrc,
}: {
  mode: string;
  frame: FrameInfoEntry;
  frameSrc: string | null;
}) {
  const isPortrait = frame.orientation === "portrait";
  const paperW = isPortrait ? 10 : 15;
  const paperH = isPortrait ? 15 : 10;
  const wPx = paperW * PREVIEW_SCALE;
  const hPx = paperH * PREVIEW_SCALE;
  const { slots } = computePrintLayout({ frame, mode, paperW, paperH, settings: {} });

  return (
    <div
      className="relative rounded-[3px] shadow-[0_6px_16px_rgba(0,0,0,0.45)] overflow-hidden"
      style={{ width: wPx, height: hPx, background: FRAME_PLACEHOLDER }}
    >
      {/* 대표 프레임(가로 디자인)을 세로 인쇄 모드에선 90도 회전해 용지에 맞춘다 */}
      {frameSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={frameSrc}
          alt=""
          className="absolute left-1/2 top-1/2 max-w-none object-cover"
          style={{
            width: isPortrait ? hPx : wPx,
            height: isPortrait ? wPx : hPx,
            transform: `translate(-50%, -50%)${isPortrait ? " rotate(90deg)" : ""}`,
          }}
        />
      )}
      {slots.map((s, i) => (
        <div
          key={i}
          className="absolute bg-white shadow-inner"
          style={{
            left: `${(s.x / paperW) * 100}%`,
            top: `${(s.y / paperH) * 100}%`,
            width: `${(s.w / paperW) * 100}%`,
            height: `${(s.h / paperH) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

export function FrameSection({
  captureModes,
  selectedFrame,
  onSelect,
  onNext,
  onPrev,
  printBgImages = [],
  imageBaseUrl = "",
}: {
  captureModes: string[];
  selectedFrame: string | null;
  onSelect: (frame: string) => void;
  onNext: () => void;
  onPrev: () => void;
  printBgImages?: BGImage[];
  imageBaseUrl?: string;
}) {
  const { t } = useLanguage();
  const frames = captureModes
    .map((mode) => ({ id: mode, ...FRAME_INFO[mode] }))
    .filter((f) => f.label);
  const frameSrc = resolveFrameSrc(printBgImages, imageBaseUrl);
  // 세로 화면 배치: 옵션이 3개 이하면 가로 한 줄, 4개 이상이면 3열 그리드(예: 6개 → 2×3).
  // (가로 화면은 항상 한 줄) 세로 1열은 너무 길어져 스크롤이 생기므로 3열로 접는다.
  const usePortraitGrid = frames.length > 3;

  return (
    <section className={`${SERVICE_SECTION_CLASS} grid-rows-[auto_1fr] px-16`}>
      <h2 className="text-title text-center whitespace-pre-line font-extrabold text-white animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("frame.title")}
      </h2>

      {/* 결제 단계와 동일하게 w-full 래퍼로 폭을 채워 좌우 여백을 맞춘다(세로 3열 그리드가 넓게 퍼지도록). */}
      <div className="min-h-0 w-full flex items-center justify-center">
      <div className={`flex gap-10 animate-fadeInUp ${usePortraitGrid ? "portrait:grid portrait:grid-cols-3 portrait:gap-6 portrait:w-full portrait:max-w-5xl portrait:items-stretch" : "portrait:gap-6"}`}>
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`frame-option w-64 text-center ${usePortraitGrid ? "portrait:w-full" : ""} ${selectedFrame === frame.id ? "selected" : ""}`}
            onClick={() => onSelect(frame.id)}
          >
            {selectedFrame === frame.id && <span className="check-mark">&#10003;</span>}
            <div className="h-48 portrait:h-52 flex items-center justify-center mb-5">
              <PaperPreview mode={frame.id} frame={frame} frameSrc={frameSrc} />
            </div>
            <span className="text-2xl portrait:text-3xl font-bold text-white">{t("frame.cut", { n: frame.count })}</span>
          </div>
        ))}
      </div>
      </div>

      <ServiceNav onPrev={onPrev} onNext={onNext} nextDisabled={!selectedFrame} />
    </section>
  );
}
