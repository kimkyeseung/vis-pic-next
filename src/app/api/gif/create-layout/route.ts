import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { EXPIRY_DAYS, decodeBase64Image, uploadPrintFile, formatExpiryDate } from "@/lib/prints";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GIFEncoder = require("gif-encoder-2");

/**
 * 단색 배경 버퍼 생성. sharp({create})는 출력 포맷을 지정하지 않으면
 * 헤더 없는 raw 픽셀을 반환해 이후 sharp(bgBuffer) 재파싱이
 * "unsupported image format"으로 실패하므로 png로 인코딩한다.
 */
function solidBackground(w: number, h: number, color: string): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: color },
  })
    .ensureAlpha()
    .png()
    .toBuffer();
}

interface LayoutGifRequest {
  intermediate_pictures: Record<string, string[]>;
  layout_cols: number;
  layout_rows: number;
  photo_width: number;
  photo_height: number;
  h_gap: number;
  v_gap: number;
  duration: number;
  background_color: string;
  background_image: string | null;
  /** 배경 전체를 데이터 URL로 직접 전달 (합성 사진과 동일한 배경 사용) */
  background_image_data?: string | null;
  /** 사진 슬롯 프레임 스타일 (px) — 합성 사진의 둥근 모서리·테두리와 동일하게 */
  corner_radius?: number;
  border_width?: number;
  border_color?: string;
  canvas_width: number;
  canvas_height: number;
  start_x: number;
  start_y: number;
}

export async function POST(request: NextRequest) {
  try {
    const data: LayoutGifRequest = await request.json();

    const {
      intermediate_pictures,
      layout_cols,
      layout_rows,
      photo_width,
      photo_height,
      h_gap,
      v_gap,
      duration = 500,
      background_color = "#ffffff",
      background_image,
      background_image_data,
      corner_radius = 0,
      border_width = 0,
      border_color = "rgba(255,255,255,0.8)",
      canvas_width,
      canvas_height,
      start_x,
      start_y,
    } = data;

    if (!intermediate_pictures || Object.keys(intermediate_pictures).length === 0) {
      return NextResponse.json(
        { error: "intermediate_pictures is required" },
        { status: 400 },
      );
    }

    const maxFrames = Math.max(
      ...Object.values(intermediate_pictures).map((arr) => arr.length),
    );
    if (maxFrames < 2) {
      return NextResponse.json(
        { error: "At least 2 frames are required" },
        { status: 400 },
      );
    }

    const cw = Math.round(canvas_width);
    const ch = Math.round(canvas_height);
    const pw = Math.round(photo_width);
    const ph = Math.round(photo_height);

    // 사진 슬롯 프레임 스타일: 둥근 모서리 마스크 + 테두리 (합성 사진과 동일)
    const radius = Math.max(0, Math.round(corner_radius));
    const bw = Math.max(0, Math.round(border_width));
    const roundedMask =
      radius > 0
        ? Buffer.from(
            `<svg width="${pw}" height="${ph}"><rect width="${pw}" height="${ph}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
          )
        : null;
    const borderOverlay =
      bw > 0
        ? Buffer.from(
            `<svg width="${pw}" height="${ph}"><rect x="${bw / 2}" y="${bw / 2}" width="${pw - bw}" height="${ph - bw}" rx="${radius}" ry="${radius}" fill="none" stroke="${border_color}" stroke-width="${bw}"/></svg>`,
          )
        : null;

    async function styledPhoto(img: string): Promise<Buffer> {
      const resized = await sharp(decodeBase64Image(img))
        .resize(pw, ph, { fit: "cover" })
        .ensureAlpha()
        .png()
        .toBuffer();
      if (!roundedMask && !borderOverlay) return resized;
      const overlays: sharp.OverlayOptions[] = [];
      if (roundedMask) overlays.push({ input: roundedMask, blend: "dest-in" });
      if (borderOverlay) overlays.push({ input: borderOverlay, blend: "over" });
      return sharp(resized).composite(overlays).png().toBuffer();
    }

    // Pre-decode and resize all position images
    const positionBuffers: Record<string, Buffer[]> = {};
    for (const [posKey, frames] of Object.entries(intermediate_pictures)) {
      positionBuffers[posKey] = await Promise.all(frames.map(styledPhoto));
    }

    // Prepare background
    let bgBuffer: Buffer;
    if (background_image_data) {
      // 클라이언트가 합성 사진과 동일한 배경을 데이터 URL로 전달한 경우
      try {
        bgBuffer = await sharp(decodeBase64Image(background_image_data))
          .resize(cw, ch, { fit: "cover" })
          .ensureAlpha()
          .png()
          .toBuffer();
      } catch {
        bgBuffer = await solidBackground(cw, ch, background_color);
      }
    } else if (background_image) {
      try {
        const bgPath = path.join(
          process.cwd(),
          "public",
          "static",
          "images",
          background_image,
        );
        const rawBg = await readFile(bgPath);
        bgBuffer = await sharp(rawBg).resize(cw, ch, { fit: "cover" }).ensureAlpha().png().toBuffer();
      } catch {
        bgBuffer = await solidBackground(cw, ch, background_color);
      }
    } else {
      bgBuffer = await solidBackground(cw, ch, background_color);
    }

    // Encode GIF
    const encoder = new GIFEncoder(cw, ch, "neuquant", true);
    encoder.setDelay(duration);
    encoder.setRepeat(0);
    encoder.setQuality(10);
    encoder.start();

    for (let frameIdx = 0; frameIdx < maxFrames; frameIdx++) {
      const compositeInputs: sharp.OverlayOptions[] = [];

      for (let row = 0; row < layout_rows; row++) {
        for (let col = 0; col < layout_cols; col++) {
          const posIdx = row * layout_cols + col;
          const posKey = `position_${posIdx}`;
          const frames = positionBuffers[posKey];
          if (!frames || frames.length === 0) continue;

          const imgIdx = Math.min(frameIdx, frames.length - 1);
          const x = Math.round(start_x + col * (pw + h_gap));
          const y = Math.round(start_y + row * (ph + v_gap));

          compositeInputs.push({
            input: frames[imgIdx],
            left: Math.max(0, x),
            top: Math.max(0, y),
          });
        }
      }

      const frameBuffer = await sharp(bgBuffer)
        .composite(compositeInputs)
        .ensureAlpha()
        .raw()
        .toBuffer();

      encoder.addFrame(frameBuffer);
    }

    encoder.finish();
    const gifBuffer = encoder.out.getData();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const gifId = crypto.randomUUID().slice(0, 8);
    const filename = `${dateStr}_${gifId}.gif`;

    const gifUrl = await uploadPrintFile(filename, gifBuffer, "image/gif");

    return NextResponse.json({
      success: true,
      gif_id: gifId,
      gif_url: gifUrl,
      frame_count: maxFrames,
      expiry_date: formatExpiryDate(),
      expiry_days: EXPIRY_DAYS,
    });
  } catch (error) {
    console.error("Error creating layout GIF:", error);
    return NextResponse.json(
      { error: "Failed to create layout GIF" },
      { status: 500 },
    );
  }
}
