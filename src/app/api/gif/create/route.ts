import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { EXPIRY_DAYS, decodeBase64Image, uploadPrintFile, formatExpiryDate } from "@/lib/prints";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GIFEncoder = require("gif-encoder-2");

const MAX_GIF_WIDTH = 800;

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

    const gifUrl = await uploadPrintFile(filename, gifBuffer, "image/gif");

    return NextResponse.json({
      success: true,
      gif_id: gifId,
      gif_url: gifUrl,
      image_count: images.length,
      expiry_date: formatExpiryDate(),
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
