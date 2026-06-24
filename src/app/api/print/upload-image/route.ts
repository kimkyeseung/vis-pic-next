import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const BUCKET_NAME = "prints";
const EXPIRY_DAYS = 3;

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image_data, image_type = "photo" } = body;

    if (!image_data) {
      return NextResponse.json(
        { error: "image_data is required" },
        { status: 400 }
      );
    }

    const base64Match = image_data.match(
      /^data:image\/\w+;base64,(.+)$/
    );
    const raw = base64Match ? base64Match[1] : image_data;
    const buffer = Buffer.from(raw, "base64");

    const ext = image_type === "gif" ? "gif" : "jpg";
    const contentType = image_type === "gif" ? "image/gif" : "image/jpeg";
    const dateStr = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const imageId = crypto.randomUUID().slice(0, 8);
    const filename = `${dateStr}_${imageId}.${ext}`;

    let imageUrl: string;

    const supabase = getSupabaseClient();
    let uploaded = false;

    if (supabase) {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, buffer, { contentType, upsert: false });

      if (!error) {
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filename);
        imageUrl = publicUrl;
        uploaded = true;
      }
    }

    if (!uploaded) {
      const printsDir = path.join(process.cwd(), "public", "static", "prints");
      await mkdir(printsDir, { recursive: true });
      await writeFile(path.join(printsDir, filename), buffer);
      imageUrl = `/static/prints/${filename}`;
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + EXPIRY_DAYS);
    const expiryDate = `${expiry.getFullYear()}년 ${String(expiry.getMonth() + 1).padStart(2, "0")}월 ${String(expiry.getDate()).padStart(2, "0")}일`;

    return NextResponse.json({
      success: true,
      image_id: imageId,
      image_url: imageUrl!,
      expiry_date: expiryDate,
      expiry_days: EXPIRY_DAYS,
    });
  } catch (error) {
    console.error("Error uploading print image:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
