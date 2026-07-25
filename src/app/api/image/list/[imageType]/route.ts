import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getImageBaseUrl } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imageType: string }> }
) {
  try {
    const { imageType } = await params;
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("device_id");
    // linked=1: "해당 디바이스에 연결된 것만"(전체 디바이스용 제외) — 지점별 전용 이미지(테마 등)에 사용
    const linkedOnly = searchParams.get("linked") === "1";

    const whereClause: Record<string, unknown> = {
      imageType: parseInt(imageType),
    };

    if (deviceId) {
      if (linkedOnly) {
        whereClause.devices = { some: { deviceId } };
      } else {
        // 연결 행이 없으면(모든 디바이스) 또는 해당 디바이스에 연결된 이미지만 노출
        whereClause.OR = [
          { devices: { none: {} } },
          { devices: { some: { deviceId } } },
        ];
      }
    }

    const images = await prisma.image.findMany({
      where: whereClause,
      orderBy: { priority: "desc" },
      include: { devices: { select: { deviceId: true } } },
    });

    const result = images.map((img) => ({
      id: img.id,
      deviceIds: img.devices.map((d) => d.deviceId),
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
      active: img.active,
      focalX: img.focalX ?? 0.5,
      focalY: img.focalY ?? 0.5,
    }));

    const baseUrl = getImageBaseUrl();

    return NextResponse.json(
      { images: result, baseUrl },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error fetching images:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
