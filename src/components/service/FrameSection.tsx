import { FRAME_INFO } from "@/constants/frames";
import { computePrintLayout } from "@/lib/printLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import type { FrameInfoEntry } from "@/types";

// 미리보기 축척: 1cm → 12px (인화지 10×15cm 기준 120×180px)
const PREVIEW_SCALE = 12;

/** 실제 인화지 비율(10×15cm)과 공용 레이아웃 계산을 축소해 그리는 미리보기 */
function PaperPreview({ mode, frame }: { mode: string; frame: FrameInfoEntry }) {
  const paperW = frame.orientation === "landscape" ? 15 : 10;
  const paperH = frame.orientation === "landscape" ? 10 : 15;
  const { slots } = computePrintLayout({ frame, mode, paperW, paperH, settings: {} });

  return (
    <div
      className="relative bg-white rounded-[3px] shadow-[0_6px_16px_rgba(0,0,0,0.45)]"
      style={{ width: paperW * PREVIEW_SCALE, height: paperH * PREVIEW_SCALE }}
    >
      {slots.map((s, i) => (
        <div
          key={i}
          className="absolute bg-gradient-to-br from-gray-400 to-gray-500 shadow-inner"
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

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <h2 className="text-4xl font-extrabold text-white mb-16 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
        {t("frame.title")}
      </h2>

      <div className="flex gap-10 mb-20 animate-fadeInUp">
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`frame-option w-64 text-center ${selectedFrame === frame.id ? "selected" : ""}`}
            onClick={() => onSelect(frame.id)}
          >
            {selectedFrame === frame.id && <span className="check-mark">&#10003;</span>}
            <div className="h-48 flex items-center justify-center mb-5">
              <PaperPreview mode={frame.id} frame={frame} />
            </div>
            <span className="text-2xl font-bold text-white">{t("frame.cut", { n: frame.count })}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-6 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
        <button className="service-button nav-button" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} onClick={onPrev}>
          &#9664; {t("common.prev")}
        </button>
        <button
          className={`service-button nav-button ${!selectedFrame ? "disabled" : ""}`}
          onClick={onNext}
          style={!selectedFrame ? { opacity: 0.5, pointerEvents: "none" } : {}}
        >
          {t("common.next")} &#9654;
        </button>
      </div>
    </section>
  );
}
