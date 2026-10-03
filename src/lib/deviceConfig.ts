import type { BgRemovalMode, ButtonImageOptions, ButtonRole, PaymentTerminalMode, PaymentTier, SegmentProcessScale } from "@/types";
import { CAMERA_RESOLUTIONS, DEFAULT_CAMERA_RESOLUTION, type CameraResolutionId } from "@/constants/camera";

/** parseInt 실패(NaN) 시 기본값 반환. 0은 유효한 값으로 처리. */
export function parseIntSafe(value: string, defaultValue: number): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

export function parseBgRemovalMode(modeRaw: string): BgRemovalMode {
  if (modeRaw === "0" || modeRaw === "off") return "off";
  if (modeRaw === "1" || modeRaw === "chromakey") return "chromakey";
  if (modeRaw === "chromakey-yuv") return "chromakey-yuv";
  return "mediapipe";
}

export function parsePaymentTerminalMode(raw: string): PaymentTerminalMode {
  // 공백·대소문자 차이로 운영자가 의도한 수동 모드가 실카드결제로 떨어지는 함정을 방지.
  return raw.trim().toLowerCase() === "manual" ? "manual" : "payapp_lite";
}

/** 저장된 카메라 해상도 id를 검증. 알 수 없는 값이면 기본(FHD). */
export function parseCameraResolution(raw: string): CameraResolutionId {
  const v = raw.trim();
  return CAMERA_RESOLUTIONS.some((r) => r.id === v) ? (v as CameraResolutionId) : DEFAULT_CAMERA_RESOLUTION;
}

export function parseCaptureModes(raw: string): string[] {
  return raw.split(",").map((m) => m.trim()).filter(Boolean);
}

/** "1,2,4" → [1,2,4]. 양의 정수만, 중복 제거, 오름차순. 유효값이 없으면 [1] 폴백. */
export function parseQuantityOptions(raw: string): number[] {
  const nums = raw
    .split(",")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  const unique = Array.from(new Set(nums)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [1];
}

/**
 * "1:5000,2:9000,4:18000" → [{qty:1,price:5000}, ...].
 * 각 항목은 `수량:가격`. 수량은 양의 정수, 가격은 0 이상 정수.
 * qty 기준 오름차순, 중복 qty는 뒤 값이 우선. 유효값 없으면 빈 배열.
 */
export function parsePaymentTiers(raw: string): PaymentTier[] {
  const byQty = new Map<number, number>();
  for (const part of raw.split(",")) {
    const [q, p] = part.split(":").map((s) => parseInt(s.trim(), 10));
    if (Number.isInteger(q) && q > 0 && Number.isInteger(p) && p >= 0) {
      byQty.set(q, p);
    }
  }
  return Array.from(byQty.entries())
    .map(([qty, price]) => ({ qty, price }))
    .sort((a, b) => a.qty - b.qty);
}

/** 0-100 범위로 고정. min을 주면 0으로 나누기 등을 막기 위한 하한을 별도로 지정할 수 있다. */
export function clampPercent(value: number, min = 0): number {
  return Math.min(100, Math.max(min, value));
}

/** 저장된 AI 배경제거 처리 해상도 배율을 검증. 알 수 없는 값이면 "auto". */
export function parseSegmentProcessScale(raw: string): SegmentProcessScale {
  const v = raw.trim();
  return v === "100" || v === "50" || v === "25" ? v : "auto";
}

/**
 * 처리 해상도 설정을 실제 배율로 바꾼다. "auto"는 4K(2560+)에서만 0.25로 낮춰
 * 처리 픽셀 수를 1/16로 만든다(기존 하드코딩 규칙).
 */
export function segmentProcessScaleFor(setting: SegmentProcessScale, frameWidth: number): number {
  if (setting === "auto") return frameWidth >= 2560 ? 0.25 : 0.5;
  return parseInt(setting, 10) / 100;
}

/** -100~100 범위로 고정. 대비/명암/감마처럼 0을 중심으로 양쪽 조정이 필요한 값에 사용. */
export function clampSigned(value: number, min = -100, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export const BUTTON_ROLES: readonly ButtonRole[] = ["capture", "next", "payment"];

/** 버튼별 이미지 표시 옵션 설정 키. 예: THEME_BTN_IMAGE_ONLY_CAPTURE / THEME_BTN_HIDE_TEXT_NEXT */
export function buttonImageOptionKeys(role: ButtonRole) {
  const suffix = role.toUpperCase();
  return { imageOnly: `THEME_BTN_IMAGE_ONLY_${suffix}`, hideText: `THEME_BTN_HIDE_TEXT_${suffix}` };
}

/** 설정 맵 → 버튼별 이미지 옵션. 이미지만 표시는 미설정 시 켬("0"일 때만 끔), 텍스트 숨김은 "1"일 때만 켬. */
export function parseButtonImageOptions(s: Record<string, string | undefined>): Record<ButtonRole, ButtonImageOptions> {
  const out = {} as Record<ButtonRole, ButtonImageOptions>;
  for (const role of BUTTON_ROLES) {
    const k = buttonImageOptionKeys(role);
    out[role] = { imageOnly: s[k.imageOnly] !== "0", hideText: s[k.hideText] === "1" };
  }
  return out;
}
