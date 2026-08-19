import { FRAME_INFO, DUMMY_SLOT_GRADIENT } from "@/constants/frames";
import { computePrintLayout } from "@/lib/printLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { SectionShell } from "./SectionShell";
import type { FrameInfoEntry } from "@/types";

// 미리보기 축척(1cm → N px) 기본값. 카드 크기에 따라 호출부에서 scale로 덮어쓴다.
// 소형(옵션 4개↑): 12px, 대형(1/2/4컷 고정): 20px.
const PREVIEW_SCALE = 12;

/**
 * 실제 인화지 비율(10×15cm)과 공용 레이아웃 계산을 축소해 그리는 미리보기.
 * 프레임은 나중 "프레임 선택" 단계에서 확정하므로, 여기선 대표 프레임을 미리 씌우지 않고
 * 흰 용지 + 회색 슬롯(더미)로만 보여준다(레이아웃 V3).
 */
function PaperPreview({
  mode,
  frame,
  scale = PREVIEW_SCALE,
}: {
  mode: string;
  frame: FrameInfoEntry;
  scale?: number;
}) {
  const isPortrait = frame.orientation === "portrait";
  const paperW = isPortrait ? 10 : 15;
  const paperH = isPortrait ? 15 : 10;
  const wPx = paperW * scale;
  const hPx = paperH * scale;
  const { slots } = computePrintLayout({ frame, mode, paperW, paperH, settings: {} });

  return (
    <div
      className="relative rounded-[3px] shadow-[0_6px_16px_rgba(0,0,0,0.45)] overflow-hidden bg-white"
      style={{ width: wPx, height: hPx }}
    >
      {slots.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-[2px]"
          style={{
            left: `${(s.x / paperW) * 100}%`,
            top: `${(s.y / paperH) * 100}%`,
            width: `${(s.w / paperW) * 100}%`,
            height: `${(s.h / paperH) * 100}%`,
            background: DUMMY_SLOT_GRADIENT,
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
}: {
  captureModes: string[];
  selectedFrame: string | null;
  onSelect: (frame: string) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const { t } = useLanguage();
  const frames = captureModes
    .map((mode) => ({ id: mode, ...FRAME_INFO[mode] }))
    .filter((f) => f.label);
  // 세로 화면 배치: 옵션이 3개 이하면 가로 한 줄, 4개 이상이면 3열 그리드(예: 6개 → 2×3).
  // (가로 화면은 항상 한 줄) 세로 1열은 너무 길어져 스크롤이 생기므로 3열로 접는다.
  const usePortraitGrid = frames.length > 3;
  // 1/2/4컷 고정 구성(옵션 3개 이하)에서는 카드를 크게 키운다(레이아웃 V3).
  // 4개 이상이면 가로 한 줄이 넘치므로 기존 소형 카드를 유지한다.
  const bigCards = frames.length <= 3;
  const previewScale = bigCards ? 20 : 12;

  return (
    <SectionShell
      title={t("frame.title")}
      titleClassName="text-center whitespace-pre-line"
      className="px-16"
      onPrev={onPrev}
      onNext={onNext}
      nextDisabled={!selectedFrame}
    >
      {/* 결제 단계와 동일하게 w-full 래퍼로 폭을 채워 좌우 여백을 맞춘다(세로 3열 그리드가 넓게 퍼지도록). */}
      <div className="min-h-0 w-full flex items-center justify-center">
      <div className={`flex ${bigCards ? "gap-14 portrait:flex-col portrait:w-full portrait:items-stretch" : "gap-10"} animate-fadeInUp ${usePortraitGrid ? "portrait:grid portrait:grid-cols-3 portrait:gap-6 portrait:w-full portrait:max-w-5xl portrait:items-stretch" : "portrait:gap-6"}`}>
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`frame-option ${bigCards ? "w-[26rem] portrait:w-full portrait:min-h-[24rem] portrait:flex portrait:flex-row portrait:items-center portrait:justify-center portrait:gap-12" : "w-64"} text-center ${usePortraitGrid ? "portrait:w-full" : ""} ${selectedFrame === frame.id ? "selected" : ""}`}
            onClick={() => onSelect(frame.id)}
          >
            {selectedFrame === frame.id && <span className="check-mark">&#10003;</span>}
            <div className={`${bigCards ? "h-80 mb-8 portrait:h-auto portrait:mb-0" : "h-48 portrait:h-52 mb-5"} flex items-center justify-center`}>
              <PaperPreview mode={frame.id} frame={frame} scale={previewScale} />
            </div>
            <span className={`${bigCards ? "text-6xl" : "text-2xl portrait:text-3xl"} font-bold text-white`}>{t("frame.cut", { n: frame.count })}</span>
          </div>
        ))}
      </div>
      </div>
    </SectionShell>
  );
}
