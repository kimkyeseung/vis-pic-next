import type { CSSProperties } from "react";
import type { BGImage } from "@/types";
import { FRAME_INFO, FALLBACK_BACKGROUNDS } from "@/constants/frames";
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

function resolveImageUrl(value: string, baseUrl: string) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) return value;
  const filename = value.split("/").pop()!;
  return `${baseUrl}/${filename}`;
}

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
}) {
  const frame = selectedFrame ? FRAME_INFO[selectedFrame] : null;
  if (!frame) return null;

  const paperWCm = parseFloat(printSettings.PICTURE_WIDTH || "10");
  const paperHCm = parseFloat(printSettings.PICTURE_HEIGHT || "15");
  const { pw, ph } = getPaperDimensions(paperWCm, paperHCm, frame.orientation);

  const { slots } = computePrintLayout({ frame, mode: selectedFrame!, paperW: pw, paperH: ph, settings: printSettings });

  let backgroundStyle: CSSProperties = { background: DEFAULT_GRADIENT };

  const printBgInfo = selectedPrintBg != null ? (printBgImages || []).find((b) => b.id === selectedPrintBg) : null;
  if (printBgInfo) {
    backgroundStyle = {
      backgroundImage: `url(${imageBaseUrl}/${printBgInfo.filename})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  } else if (printSettings.PRINT_BACKGROUND) {
    backgroundStyle = {
      backgroundImage: `url(${resolveImageUrl(printSettings.PRINT_BACKGROUND, imageBaseUrl)})`,
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

  return (
    <div
      data-testid="framed-preview"
      className="relative rounded-[3px] shadow-[0_10px_30px_rgba(0,0,0,0.45)] overflow-hidden"
      style={{ width: pw * scale, height: ph * scale, ...backgroundStyle }}
    >
      {slots.map((s, i) => {
        const photoIdx = selectedPhotos[i];
        const photo = photoIdx !== undefined ? photos[photoIdx] : null;
        return (
          <div
            key={i}
            className="absolute overflow-hidden flex items-center justify-center bg-white/10"
            style={{
              left: `${(s.x / pw) * 100}%`,
              top: `${(s.y / ph) * 100}%`,
              width: `${(s.w / pw) * 100}%`,
              height: `${(s.h / ph) * 100}%`,
              borderRadius: FRAME_CORNER_RADIUS_CM * scale,
              border: `${FRAME_BORDER_CM * scale}px solid ${FRAME_BORDER_COLOR}`,
            }}
          >
            {photo && <img src={photo} alt={`slot-${i}`} className="w-full h-full object-cover" />}
          </div>
        );
      })}
    </div>
  );
}
