import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getImageBaseUrl } from "@/lib/storage";
import { defaultActiveForNewImage } from "@/lib/imageActive";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { filename, name, imageType, deviceIds, priority } = await request.json();

    if (!filename || !name) {
      return NextResponse.json({ error: "filename and name are required" }, { status: 400 });
    }

    // 연결할 디바이스 코드 목록. 비어 있으면 모든 디바이스에 적용된다.
    const targetDeviceIds: string[] = Array.isArray(deviceIds)
      ? deviceIds.filter((d): d is string => typeof d === "string" && d.length > 0)
      : [];

    const truncatedName = String(name).slice(0, 32);
    const resolvedType = parseInt(imageType) || 1;

    const image = await prisma.image.create({
      data: {
        name: truncatedName,
        filename,
        imageType: resolvedType,
        priority: parseInt(priority) || 0,
        active: await defaultActiveForNewImage(resolvedType),
        devices: {
          create: targetDeviceIds.map((deviceId) => ({ deviceId })),
        },
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
