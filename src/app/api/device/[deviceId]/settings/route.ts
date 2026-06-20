import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

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

    const settings: Record<string, string> = {};
    for (const setting of device.settings) {
      settings[setting.name] = setting.value;
    }

    const images = await prisma.image.findMany({
      where: {
        OR: [{ deviceId: null }, { deviceId }],
      },
      orderBy: { priority: "desc" },
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
        deviceId: img.deviceId,
        imageType: img.imageType,
        name: img.name,
        filename: img.filename,
        width: img.width,
        height: img.height,
        priority: img.priority,
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

    for (const [name, value] of Object.entries(body)) {
      if (typeof value === "string") {
        await prisma.deviceSetting.upsert({
          where: {
            deviceId_name: { deviceId, name },
          },
          update: { value },
          create: { deviceId, name, value },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating device settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
