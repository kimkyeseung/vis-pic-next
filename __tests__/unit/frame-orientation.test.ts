import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizeFrameToLandscape } from "@/lib/frameOrientation";

const solid = (width: number, height: number, format: "png" | "jpeg", orientation?: number) => {
  const img = sharp({ create: { width, height, channels: 3, background: "#6c6fb4" } });
  const withMeta = orientation ? img.withMetadata({ orientation }) : img;
  return (format === "png" ? withMeta.png() : withMeta.jpeg()).toBuffer();
};

describe("normalizeFrameToLandscape", () => {
  it("세로 이미지는 90° 회전해 가로로 만든다", async () => {
    const { buffer, rotated } = await normalizeFrameToLandscape(await solid(400, 600, "png"), "png");
    const meta = await sharp(buffer).metadata();
    expect(rotated).toBe(true);
    expect([meta.width, meta.height]).toEqual([600, 400]);
    expect(meta.format).toBe("png");
  });

  it("가로 이미지는 원본 그대로 둔다", async () => {
    const input = await solid(600, 400, "jpeg");
    const { buffer, rotated } = await normalizeFrameToLandscape(input, "jpg");
    expect(rotated).toBe(false);
    expect(buffer).toBe(input);
  });

  it("EXIF 회전값으로 실제 보이는 방향이 세로면 회전한다", async () => {
    // 저장은 가로(600×400)지만 orientation=6(90° 회전 표시) → 보이는 건 세로 400×600
    const { buffer, rotated } = await normalizeFrameToLandscape(await solid(600, 400, "jpeg", 6), "jpg");
    const meta = await sharp(buffer).metadata();
    expect(rotated).toBe(true);
    expect(meta.width! > meta.height!).toBe(true);
  });
});
