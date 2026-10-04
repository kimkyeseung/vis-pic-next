import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { isPayappSettingKey } from "@/lib/payapp";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const { deviceId } = await params;

    const device = await prisma.device.findUnique({
      where: { deviceId },
      include: {
        settings: true,
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found" },
        { status: 404 }
      );
    }

    // 이 API는 키오스크가 인증 없이 읽는다 — PayApp 연동 값(판매자 ID·전화번호 등)은 관리자에게만 내보낸다.
    const isAdmin = !(await requireAdmin());
    const settings: Record<string, string> = {};
    for (const setting of device.settings) {
      if (!isAdmin && isPayappSettingKey(setting.name)) continue;
      settings[setting.name] = setting.value;
    }

    const images = await prisma.image.findMany({
      where: {
        OR: [
          { devices: { none: {} } },
          { devices: { some: { deviceId } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { devices: { select: { deviceId: true } } },
    });

    return NextResponse.json({
      device: {
        id: device.id,
        deviceId: device.deviceId,
        name: device.name,
        description: device.description,
        isActive: device.isActive,
      },
      settings,
      images: images.map((img) => ({
        id: img.id,
        deviceIds: img.devices.map((d) => d.deviceId),
        imageType: img.imageType,
        name: img.name,
        filename: img.filename,
        width: img.width,
        height: img.height,
      })),
    });
  } catch (error) {
    console.error("Error fetching device settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { deviceId } = await params;
    const body = await request.json();

    const device = await prisma.device.findUnique({
      where: { deviceId },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found" },
        { status: 404 }
      );
    }

    // 설정을 병렬로 upsert (순차 처리 시 원격 DB 왕복이 개수만큼 누적되어 느림)
    await Promise.all(
      Object.entries(body).map(([name, value]) => {
        if (typeof value !== "string") return null;
        return prisma.deviceSetting.upsert({
          where: { deviceId_name: { deviceId, name } },
          update: { value },
          create: { deviceId, name, value },
        });
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating device settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
