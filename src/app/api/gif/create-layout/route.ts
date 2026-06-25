import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir, readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GIFEncoder = require("gif-encoder-2");

const BUCKET_NAME = "prints";
const EXPIRY_DAYS = 3;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function decodeBase64Image(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  const raw = match ? match[1] : dataUrl;
  return Buffer.from(raw, "base64");
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

    // Save
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const gifId = crypto.randomUUID().slice(0, 8);
    const filename = `${dateStr}_${gifId}.gif`;

    let gifUrl: string;
    let uploaded = false;

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, gifBuffer, {
          contentType: "image/gif",
          upsert: false,
        });

      if (!error) {
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
        gifUrl = publicUrl;
        uploaded = true;
      }
    }

    if (!uploaded) {
      const printsDir = path.join(process.cwd(), "public", "static", "prints");
      await mkdir(printsDir, { recursive: true });
      await writeFile(path.join(printsDir, filename), gifBuffer);
      gifUrl = `/static/prints/${filename}`;
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + EXPIRY_DAYS);
    const expiryDate = `${expiry.getFullYear()}년 ${String(expiry.getMonth() + 1).padStart(2, "0")}월 ${String(expiry.getDate()).padStart(2, "0")}일`;

    return NextResponse.json({
      success: true,
      gif_id: gifId,
      gif_url: gifUrl!,
      frame_count: maxFrames,
      expiry_date: expiryDate,
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
