import { describe, it, expect, vi, afterEach } from "vitest";
import { stripDataUriPrefix } from "@/lib/canvas";
import { decodeBase64Image, formatExpiryDate, EXPIRY_DAYS } from "@/lib/prints";

afterEach(() => {
  vi.useRealTimers();
});

describe("stripDataUriPrefix", () => {
  it("strips jpeg prefix", () => {
    expect(stripDataUriPrefix("data:image/jpeg;base64,/9j/4AAQ==")).toBe("/9j/4AAQ==");
  });

  it("strips png prefix", () => {
    expect(stripDataUriPrefix("data:image/png;base64,iVBORw0KGg==")).toBe("iVBORw0KGg==");
  });

  it("strips webp prefix", () => {
    expect(stripDataUriPrefix("data:image/webp;base64,UklGRg==")).toBe("UklGRg==");
  });

  it("leaves plain base64 unchanged (no prefix to strip)", () => {
    const plain = "/9j/4AAQ==";
    expect(stripDataUriPrefix(plain)).toBe(plain);
  });

  it("leaves empty string unchanged", () => {
    expect(stripDataUriPrefix("")).toBe("");
  });
});

describe("decodeBase64Image", () => {
  it("decodes a data: URI back to the original bytes", () => {
    const original = Buffer.from("hello world");
    const dataUrl = `data:image/jpeg;base64,${original.toString("base64")}`;
    expect(decodeBase64Image(dataUrl)).toEqual(original);
  });

  it("decodes a raw base64 string without a data: prefix", () => {
    const original = Buffer.from([1, 2, 3, 4, 255]);
    expect(decodeBase64Image(original.toString("base64"))).toEqual(original);
  });

  it("supports png/webp mime types, not just jpeg", () => {
    const original = Buffer.from("png-bytes");
    const dataUrl = `data:image/png;base64,${original.toString("base64")}`;
    expect(decodeBase64Image(dataUrl)).toEqual(original);
  });
});

describe("formatExpiryDate", () => {
  it("returns today + N days in 'YYYY년 MM월 DD일' format", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10)); // 2026-01-10
    expect(formatExpiryDate(5)).toBe("2026년 01월 15일");
  });

  it("defaults to EXPIRY_DAYS when no argument is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 10));
    expect(formatExpiryDate()).toBe(formatExpiryDate(EXPIRY_DAYS));
  });

  it("rolls over into the next month correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 30)); // 2026-01-30
    expect(formatExpiryDate(3)).toBe("2026년 02월 02일");
  });

  it("rolls over into the next year correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 30)); // 2026-12-30
    expect(formatExpiryDate(3)).toBe("2027년 01월 02일");
  });
});
