import { FRAME_INFO } from "@/constants/frames";
import { computePrintLayout } from "@/lib/printLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { ServiceNav } from "./ServiceNav";
import { resolveImageSrc } from "@/lib/imageUrl";
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

  return (
    <section className="w-full h-full grid grid-rows-[auto_1fr] justify-items-center relative z-10 pt-24 portrait:pt-16 pb-52 portrait:pb-40">
      <h2 className="text-title font-extrabold text-white animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("frame.title")}
      </h2>

      <div className="min-h-0 flex items-center justify-center">
      <div className="flex gap-10 animate-fadeInUp portrait:flex-col portrait:gap-5 portrait:w-full portrait:max-w-md portrait:items-stretch">
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`frame-option w-64 portrait:w-full text-center ${selectedFrame === frame.id ? "selected" : ""}`}
            onClick={() => onSelect(frame.id)}
          >
            {selectedFrame === frame.id && <span className="check-mark">&#10003;</span>}
            <div className="h-48 portrait:h-36 flex items-center justify-center mb-5">
              <PaperPreview mode={frame.id} frame={frame} frameSrc={frameSrc} />
            </div>
            <span className="text-2xl font-bold text-white">{t("frame.cut", { n: frame.count })}</span>
          </div>
        ))}
      </div>
      </div>

      <ServiceNav onPrev={onPrev} onNext={onNext} nextDisabled={!selectedFrame} />
    </section>
  );
}
