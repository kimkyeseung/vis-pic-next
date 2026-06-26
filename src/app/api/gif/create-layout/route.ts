import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { EXPIRY_DAYS, decodeBase64Image, uploadPrintFile, formatExpiryDate } from "@/lib/prints";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GIFEncoder = require("gif-encoder-2");

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

    // Pre-decode and resize all position images
    const positionBuffers: Record<string, Buffer[]> = {};
    for (const [posKey, frames] of Object.entries(intermediate_pictures)) {
      positionBuffers[posKey] = await Promise.all(
        frames.map(async (img) => {
          const buf = decodeBase64Image(img);
          return sharp(buf)
            .resize(pw, ph, { fit: "cover" })
            .toBuffer();
        }),
      );
    }

    // Prepare background
    let bgBuffer: Buffer;
    if (background_image) {
      try {
        const bgPath = path.join(
          process.cwd(),
          "public",
          "static",
          "images",
          background_image,
        );
        const rawBg = await readFile(bgPath);
        bgBuffer = await sharp(rawBg).resize(cw, ch, { fit: "cover" }).ensureAlpha().toBuffer();
      } catch {
        bgBuffer = await sharp({
          create: { width: cw, height: ch, channels: 4, background: background_color },
        })
          .ensureAlpha()
          .toBuffer();
      }
    } else {
      bgBuffer = await sharp({
        create: { width: cw, height: ch, channels: 4, background: background_color },
      })
        .ensureAlpha()
        .toBuffer();
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
