import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { existsSync } from "fs";
import { join } from "path";
import { getImageBaseUrl } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageType: string }> }
) {
  try {
    const { imageType } = await params;
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("device_id");
    const checkFiles = searchParams.get("check_files") === "1";

    const whereClause: Record<string, unknown> = {
      imageType: parseInt(imageType),
    };

    if (deviceId) {
      whereClause.OR = [{ deviceId: null }, { deviceId }];
    }

    const images = await prisma.image.findMany({
      where: whereClause,
      orderBy: { priority: "desc" },
    });

    let result = images.map((img) => ({
      id: img.id,
      deviceId: img.deviceId,
      imageType: img.imageType,
      name: img.name,
      filename: img.filename,
      width: img.width,
      height: img.height,
      left: img.left,
      top: img.top,
      right: img.right,
      bottom: img.bottom,
      priority: img.priority,
    }));

    const publicDir = join(process.cwd(), "public", "static", "images");
    let baseUrl = getImageBaseUrl();

    if (checkFiles) {
      result = result.filter((img) => existsSync(join(publicDir, img.filename)));
      baseUrl = "/static/images";
    }

    return NextResponse.json({ images: result, baseUrl });
  } catch (error) {
    console.error("Error fetching images:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
