import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceDeviceId, newDeviceId, newName, newDescription } = body;

    if (!sourceDeviceId || !newDeviceId || !newName) {
      return NextResponse.json(
        { error: "sourceDeviceId, newDeviceId, newName are required" },
        { status: 400 },
      );
    }

    const source = await prisma.device.findUnique({
      where: { deviceId: sourceDeviceId },
      include: { settings: true },
    });

    if (!source) {
      return NextResponse.json(
        { error: "Source device not found" },
        { status: 404 },
      );
    }

    const existing = await prisma.device.findUnique({
      where: { deviceId: newDeviceId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Device ID already exists" },
        { status: 409 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const newDevice = await tx.device.create({
        data: {
          deviceId: newDeviceId,
          name: newName,
          description: newDescription || null,
          isActive: true,
        },
      });

      if (source.settings.length > 0) {
        await tx.deviceSetting.createMany({
          data: source.settings.map((s) => ({
            deviceId: newDeviceId,
            name: s.name,
            value: s.value,
            description: s.description,
          })),
        });
      }

      return newDevice;
    });

    return NextResponse.json({ success: true, device: result });
  } catch (error) {
    console.error("Error cloning device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
