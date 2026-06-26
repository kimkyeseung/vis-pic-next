import { NextRequest, NextResponse } from "next/server";
import { EXPIRY_DAYS, uploadPrintFile, formatExpiryDate } from "@/lib/prints";

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

    const base64Match = image_data.match(/^data:image\/\w+;base64,(.+)$/);
    const raw = base64Match ? base64Match[1] : image_data;
    const buffer = Buffer.from(raw, "base64");

    const ext = image_type === "gif" ? "gif" : "jpg";
    const contentType = image_type === "gif" ? "image/gif" : "image/jpeg";
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const imageId = crypto.randomUUID().slice(0, 8);
    const filename = `${dateStr}_${imageId}.${ext}`;

    const imageUrl = await uploadPrintFile(filename, buffer, contentType);

    return NextResponse.json({
      success: true,
      image_id: imageId,
      image_url: imageUrl,
      expiry_date: formatExpiryDate(),
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
