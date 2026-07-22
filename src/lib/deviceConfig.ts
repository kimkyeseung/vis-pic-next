import type { BgRemovalMode, PaymentTerminalMode } from "@/types";

/** parseInt 실패(NaN) 시 기본값 반환. 0은 유효한 값으로 처리. */
export function parseIntSafe(value: string, defaultValue: number): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? defaultValue : n;
}

export function parseBgRemovalMode(modeRaw: string): BgRemovalMode {
  if (modeRaw === "0" || modeRaw === "off") return "off";
  if (modeRaw === "1" || modeRaw === "chromakey") return "chromakey";
  return "mediapipe";
}

export function parsePaymentTerminalMode(raw: string): PaymentTerminalMode {
  return raw === "manual" ? "manual" : "payapp_lite";
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

/** 0-100 범위로 고정. min을 주면 0으로 나누기 등을 막기 위한 하한을 별도로 지정할 수 있다. */
export function clampPercent(value: number, min = 0): number {
  return Math.min(100, Math.max(min, value));
}
