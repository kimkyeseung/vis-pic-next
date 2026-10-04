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

/**
 * 버튼별 이미지 표시 옵션 설정 키. 예: THEME_BTN_HIDE_TEXT_NEXT
 * (버튼 이미지는 항상 "이미지만 표시"라 예전 THEME_BTN_IMAGE_ONLY_* 키는 더 이상 읽지 않는다.)
 */
export function buttonImageOptionKeys(role: ButtonRole) {
  return { hideText: `THEME_BTN_HIDE_TEXT_${role.toUpperCase()}` };
}

/** 설정 맵 → 버튼별 이미지 옵션. 텍스트 숨김은 "1"일 때만 켬. */
export function parseButtonImageOptions(s: Record<string, string | undefined>): Record<ButtonRole, ButtonImageOptions> {
  const out = {} as Record<ButtonRole, ButtonImageOptions>;
  for (const role of BUTTON_ROLES) {
    const k = buttonImageOptionKeys(role);
    out[role] = { hideText: s[k.hideText] === "1" };
  }
  return out;
}

/**
 * 지점(장치) ID 규칙 — 영문·숫자·하이픈(-)·밑줄(_), 1~64자(DB VarChar(64)).
 * ID는 API 경로(/api/device/{id}/...)와 결제 주문번호에 그대로 들어가므로 공백·슬래시 등을 막는다.
 */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEVICE_NAME_MAX = 128; // DB VarChar(128)
const DEVICE_DESCRIPTION_MAX = 255; // DB VarChar(255)

/**
 * 지점 입력 검증. 문제가 없으면 null, 있으면 사용자에게 보여줄 메시지.
 * - "create"(생성·복제): ID·이름 필수.
 * - "update"(수정): 넘어온 필드만 검사하고 ID는 보지 않는다(생성 후 변경 불가).
 */
export function validateDeviceInput(
  input: { deviceId?: unknown; name?: unknown; description?: unknown },
  mode: "create" | "update",
): string | null {
  if (mode === "create") {
    if (typeof input.deviceId !== "string" || !DEVICE_ID_PATTERN.test(input.deviceId)) {
      return "장치 ID는 영문, 숫자, 하이픈(-), 밑줄(_)만 사용해 1~64자로 입력하세요.";
    }
  }
  if (mode === "create" || input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) return "장치 이름을 입력하세요.";
    if (input.name.length > DEVICE_NAME_MAX) return `장치 이름은 ${DEVICE_NAME_MAX}자 이하로 입력하세요.`;
  }
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") return "설명 형식이 올바르지 않습니다.";
    if (input.description.length > DEVICE_DESCRIPTION_MAX) return `설명은 ${DEVICE_DESCRIPTION_MAX}자 이하로 입력하세요.`;
  }
  return null;
}
