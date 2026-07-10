import type { FrameInfoEntry, Orientation } from "@/types";

export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrintLayout {
  /** 슬롯 좌표 (인화지와 같은 단위, 보통 cm) */
  slots: SlotRect[];
  /** MODE_* 설정값 기반 배치인지 (false = 설정 없음 → 자동 폴백 배치) */
  fromSettings: boolean;
  /** 슬롯 영역이 인화지를 벗어나는지 */
  overflow: boolean;
}

/** "MODE_2_2_" 형태의 설정 키 프리픽스 */
export function modeSettingPrefix(mode: string): string {
  return `MODE_${mode.replace("x", "_")}_`;
}

/**
 * 설정값 파싱: 빈 문자열·NaN·음수는 "미설정"으로 취급한다.
 * (기존에 합성은 `!== undefined`, GIF는 truthy 검사로 갈라져
 * 빈 문자열 저장 시 NaN 좌표가 되던 문제를 여기서 일원화)
 */
export function parseCm(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 인화지 실측 가로/세로(cm)를 촬영 모드의 인쇄 방향에 맞춰 배정한다.
 * 관리자 미리보기(print-setting)와 실제 합성(CompleteSection)이 같은 결과를
 * 쓰도록 하는 단일 소스 — 두 곳에서 각자 구현해 어긋나는 것을 방지한다.
 */
export function getPaperDimensions(
  paperW: number,
  paperH: number,
  orientation: Orientation,
): { pw: number; ph: number } {
  const longer = Math.max(paperW, paperH);
  const shorter = Math.min(paperW, paperH);
  return orientation === "landscape" ? { pw: longer, ph: shorter } : { pw: shorter, ph: longer };
}

const FALLBACK_PHOTO_RATIO = 4 / 3;

// ── 사진 슬롯 프레임 스타일 (합성 사진과 레이아웃 GIF가 공유) ──────────
// cm 단위로 정의하고 각 렌더러의 px/cm 배율을 곱해 사용한다.
export const FRAME_CORNER_RADIUS_CM = 0.1;
export const FRAME_BORDER_CM = 0.025;
export const FRAME_BORDER_COLOR = "rgba(255,255,255,0.8)";

/**
 * 인화지 크기와 MODE_* 설정으로 사진 슬롯 배치를 계산한다.
 * 미리보기(관리자)와 실제 합성/GIF(서비스)가 같은 결과를 쓰도록 하는 단일 소스.
 *
 * 여백 규칙 (축마다 독립):
 * - 상단 여백 지정 → 위 기준 배치, 하단 여백만 지정 → 아래 기준 배치
 * - 둘 다 비우면 세로 중앙 정렬 (좌/우도 동일)
 * - 둘 다 지정된 경우 상단/좌측이 우선 (UI에서 동시 입력을 막는다)
 */
export function computePrintLayout(opts: {
  frame: FrameInfoEntry;
  mode: string;
  paperW: number;
  paperH: number;
  settings: Record<string, string>;
}): PrintLayout {
  const { frame, mode, paperW, paperH, settings } = opts;
  const prefix = modeSettingPrefix(mode);

  const photoW = parseCm(settings[prefix + "WIDTH"]);
  const photoH = parseCm(settings[prefix + "HEIGHT"]);

  if (!photoW || !photoH) {
    return {
      slots: fallbackSlots(frame, paperW, paperH),
      fromSettings: false,
      overflow: false,
    };
  }

  const hGap = parseCm(settings[prefix + "HGAP"]) ?? 0;
  const vGap = parseCm(settings[prefix + "VGAP"]) ?? 0;

  const totalW = frame.cols * photoW + (frame.cols - 1) * hGap;
  const totalH = frame.rows * photoH + (frame.rows - 1) * vGap;

  const marginTop = parseCm(settings[prefix + "MARGIN_TOP"]);
  const marginBottom = parseCm(settings[prefix + "MARGIN_BOTTOM"]);
  const marginLeft = parseCm(settings[prefix + "MARGIN_LEFT"]);
  const marginRight = parseCm(settings[prefix + "MARGIN_RIGHT"]);

  const startX =
    marginLeft !== null
      ? marginLeft
      : marginRight !== null
        ? paperW - totalW - marginRight
        : (paperW - totalW) / 2;
  const startY =
    marginTop !== null
      ? marginTop
      : marginBottom !== null
        ? paperH - totalH - marginBottom
        : (paperH - totalH) / 2;

  const slots: SlotRect[] = [];
  for (let i = 0; i < frame.count; i++) {
    const col = i % frame.cols;
    const row = Math.floor(i / frame.cols);
    slots.push({
      x: startX + col * (photoW + hGap),
      y: startY + row * (photoH + vGap),
      w: photoW,
      h: photoH,
    });
  }

  const EPS = 1e-6;
  const overflow =
    startX < -EPS ||
    startY < -EPS ||
    startX + totalW > paperW + EPS ||
    startY + totalH > paperH + EPS;

  return { slots, fromSettings: true, overflow };
}

/** 설정이 없을 때의 자동 배치: 균등 분할 영역 안에 4:3 셀을 중앙 배치 */
function fallbackSlots(frame: FrameInfoEntry, paperW: number, paperH: number): SlotRect[] {
  const padding = Math.min(paperW, paperH) * 0.04;
  const allocW = (paperW - padding * (frame.cols + 1)) / frame.cols;
  const allocH = (paperH - padding * (frame.rows + 1)) / frame.rows;

  let cellW: number, cellH: number;
  if (allocW / allocH > FALLBACK_PHOTO_RATIO) {
    cellH = allocH;
    cellW = cellH * FALLBACK_PHOTO_RATIO;
  } else {
    cellW = allocW;
    cellH = cellW / FALLBACK_PHOTO_RATIO;
  }

  const slots: SlotRect[] = [];
  for (let i = 0; i < frame.count; i++) {
    const col = i % frame.cols;
    const row = Math.floor(i / frame.cols);
    const ax = padding + col * (allocW + padding);
    const ay = padding + row * (allocH + padding);
    slots.push({
      x: ax + (allocW - cellW) / 2,
      y: ay + (allocH - cellH) / 2,
      w: cellW,
      h: cellH,
    });
  }
  return slots;
}
