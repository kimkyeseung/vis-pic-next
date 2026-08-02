import type { BgRemovalMode, PaymentTerminalMode, PaymentTier } from "@/types";

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
  // 공백·대소문자 차이로 운영자가 의도한 수동 모드가 실카드결제로 떨어지는 함정을 방지.
  return raw.trim().toLowerCase() === "manual" ? "manual" : "payapp_lite";
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
