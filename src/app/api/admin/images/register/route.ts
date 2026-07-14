import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getImageBaseUrl } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { filename, name, imageType, deviceId, priority } = await request.json();

    if (!filename || !name) {
      return NextResponse.json({ error: "filename and name are required" }, { status: 400 });
    }

    const truncatedName = String(name).slice(0, 32);

    const image = await prisma.image.create({
      data: {
        name: truncatedName,
        filename,
        imageType: parseInt(imageType) || 1,
        deviceId: deviceId || null,
        priority: parseInt(priority) || 0,
      },
    });

    return NextResponse.json({
      success: true,
      image: {
        id: image.id,
        name: image.name,
        filename: image.filename,
        url: `${getImageBaseUrl()}/${image.filename}`,
        imageType: image.imageType,
      },
    });
  } catch (error) {
    console.error("Error registering image:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
