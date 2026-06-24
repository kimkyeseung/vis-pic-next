import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import sharp from "sharp";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GIFEncoder = require("gif-encoder-2");

const BUCKET_NAME = "prints";
const EXPIRY_DAYS = 3;
const MAX_GIF_WIDTH = 400;

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, duration = 1000 } = body;

    if (!images || !Array.isArray(images) || images.length < 2) {
      return NextResponse.json(
        { error: "At least 2 images are required" },
        { status: 400 }
      );
    }

    const firstBuf = decodeBase64Image(images[0]);
    const firstMeta = await sharp(firstBuf).metadata();
    const targetW = Math.min(firstMeta.width || MAX_GIF_WIDTH, MAX_GIF_WIDTH);
    const targetH = Math.round(
      targetW *
        ((firstMeta.height || MAX_GIF_WIDTH) /
          (firstMeta.width || MAX_GIF_WIDTH))
    );

    const encoder = new GIFEncoder(targetW, targetH, "neuquant", true);
    encoder.setDelay(duration);
    encoder.setRepeat(0);
    encoder.setQuality(10);
    encoder.start();

    for (const img of images) {
      const buf = decodeBase64Image(img);
      const rgba = await sharp(buf)
        .resize(targetW, targetH, { fit: "cover" })
        .ensureAlpha()
        .raw()
        .toBuffer();
      encoder.addFrame(rgba);
    }

    encoder.finish();
    const gifBuffer = encoder.out.getData();

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
      const printsDir = path.join(
        process.cwd(),
        "public",
        "static",
        "prints"
      );
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
      image_count: images.length,
      expiry_date: expiryDate,
      expiry_days: EXPIRY_DAYS,
    });
  } catch (error) {
    console.error("Error creating GIF:", error);
    return NextResponse.json(
      { error: "Failed to create GIF" },
      { status: 500 }
    );
  }
}
