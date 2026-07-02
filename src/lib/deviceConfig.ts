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
