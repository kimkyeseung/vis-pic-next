import type { CSSProperties } from "react";
import type { BGImage } from "@/types";
import { FRAME_INFO, FALLBACK_BACKGROUNDS, DUMMY_SLOT_GRADIENT } from "@/constants/frames";
import { resolveImageSrc } from "@/lib/imageUrl";
import {
  computePrintLayout,
  getPaperDimensions,
  FRAME_CORNER_RADIUS_CM,
  FRAME_BORDER_CM,
  FRAME_BORDER_COLOR,
} from "@/lib/printLayout";

// 미리보기 축척 기본값: 1cm → 12px (FrameSection.PaperPreview와 동일 기준)
const DEFAULT_PREVIEW_SCALE = 12;

const DEFAULT_GRADIENT = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

/**
 * 선택된 프레임(컷 레이아웃) 위에 실제 선택 사진들을 슬롯에 배치해 보여주는
 * 미리보기. CompleteSection.createComposite()와 동일한 배경 우선순위
 * (인화 배경 > PRINT_BACKGROUND 설정 > 촬영 배경 > 폴백 그라디언트)를 따른다.
 */
export function FramedPreview({
  selectedFrame,
  photos,
  selectedPhotos,
  printSettings,
  imageBaseUrl,
  selectedBackground,
  backgroundImages,
  selectedPrintBg,
  printBgImages,
  scale = DEFAULT_PREVIEW_SCALE,
  activeSlot,
  onSlotClick,
}: {
  selectedFrame: string | null;
  photos: string[];
  selectedPhotos: number[];
  printSettings: Record<string, string>;
  imageBaseUrl: string;
  selectedBackground?: number | null;
  backgroundImages?: BGImage[];
  selectedPrintBg?: number | null;
  printBgImages?: BGImage[];
  /** 미리보기 축척(px/cm). 미지정 시 기본값 12. */
  scale?: number;
  /** 현재 active(선택) 슬롯 인덱스. 지정 시 해당 슬롯을 강조 표시한다. */
  activeSlot?: number;
  /** 슬롯 클릭 핸들러. 지정 시 슬롯이 클릭 가능해지고 사진 배치 대상 슬롯을 고를 수 있다. */
  onSlotClick?: (slotIndex: number) => void;
}) {
  const frame = selectedFrame ? FRAME_INFO[selectedFrame] : null;
  if (!frame) return null;

  const paperWCm = parseFloat(printSettings.PICTURE_WIDTH || "10");
  const paperHCm = parseFloat(printSettings.PICTURE_HEIGHT || "15");
  const { pw, ph } = getPaperDimensions(paperWCm, paperHCm, frame.orientation);

  const { slots } = computePrintLayout({ frame, mode: selectedFrame!, paperW: pw, paperH: ph, settings: printSettings });

  // 프레임 선택 전(selectedPrintBg 없음)에는 대표 프레임을 미리 씌우지 않고 흰 용지 + 회색
  // 슬롯(더미)로만 보여준다(레이아웃 V3). 프레임을 확정한 뒤에만 선택 프레임을 합성해 보여준다.
  const frameSelected = selectedPrintBg != null;
  const frameInfo = frameSelected
    ? (printBgImages || []).find((b) => b.id === selectedPrintBg)
    : null;
  const frameSrc = frameInfo ? resolveImageSrc(frameInfo.filename, imageBaseUrl) : null;

  // 프레임 미선택: 흰 더미 용지. 선택 후: PRINT_BACKGROUND 설정 > 촬영 배경 > 폴백 그라디언트.
  let backgroundStyle: CSSProperties = { background: DEFAULT_GRADIENT };
  if (!frameSelected) {
    backgroundStyle = { background: "#ffffff" };
  } else if (printSettings.PRINT_BACKGROUND) {
    backgroundStyle = {
      backgroundImage: `url(${resolveImageSrc(printSettings.PRINT_BACKGROUND, imageBaseUrl)})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  } else {
    const bgInfo = selectedBackground != null && selectedBackground > 0
      ? (backgroundImages || []).find((b) => b.id === selectedBackground)
      : null;
    if (bgInfo) {
      backgroundStyle = {
        backgroundImage: `url(${imageBaseUrl}/${bgInfo.filename})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    } else {
      const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === selectedBackground);
      backgroundStyle = { background: fb ? fb.gradient : DEFAULT_GRADIENT };
    }
  }

  const isPortrait = frame.orientation === "portrait";
  const wPx = pw * scale;
  const hPx = ph * scale;

  return (
    <div
      data-testid="framed-preview"
      className="relative rounded-[3px] shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden"
      style={{ width: wPx, height: hPx, ...backgroundStyle }}
    >
      {/* 프레임 이미지(가로 디자인)를 용지 배경으로. 세로 인쇄 모드면 90도 회전해 맞춘다. */}
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
      {slots.map((s, i) => {
        const photoIdx = selectedPhotos[i];
        const photo = photoIdx !== undefined && photoIdx >= 0 ? photos[photoIdx] : null;
        const interactive = !!onSlotClick;
        const isActive = activeSlot === i;
        return (
          <div
            key={i}
            onClick={onSlotClick ? () => onSlotClick(i) : undefined}
            className={`absolute overflow-hidden flex items-center justify-center ${interactive ? "cursor-pointer" : ""}`}
            style={{
              left: `${(s.x / pw) * 100}%`,
              top: `${(s.y / ph) * 100}%`,
              width: `${(s.w / pw) * 100}%`,
              height: `${(s.h / ph) * 100}%`,
              borderRadius: FRAME_CORNER_RADIUS_CM * scale,
              border: `${FRAME_BORDER_CM * scale}px solid ${FRAME_BORDER_COLOR}`,
              // 빈 슬롯 자리 표시: 프레임 미선택(더미)이면 회색 그라디언트, 선택 후면 반투명 흰색.
              background: frameSelected ? "rgba(255,255,255,0.1)" : DUMMY_SLOT_GRADIENT,
            }}
          >
            {photo ? (
              <img src={photo} alt={`slot-${i}`} className="w-full h-full object-cover" />
            ) : interactive ? (
              // 빈 슬롯: 순번을 보여줘 어떤 순서로 채워지는지 알 수 있게 한다.
              <span
                className="font-bold select-none"
                style={{ color: isActive ? "var(--theme-primary, #6c6fb4)" : "rgba(255,255,255,0.5)", fontSize: Math.max(12, scale * 0.9) }}
              >
                {i + 1}
              </span>
            ) : null}
            {/* active 슬롯 강조 링 — 사진 위에 그려지도록 오버레이(사진이 있어도 보임) */}
            {isActive && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  borderRadius: FRAME_CORNER_RADIUS_CM * scale,
                  boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(scale * 0.18))}px var(--theme-primary, #6c6fb4)`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
