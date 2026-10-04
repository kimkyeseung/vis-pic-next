import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { validateDeviceInput } from "@/lib/deviceConfig";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { sourceDeviceId, newDeviceId, newName, newDescription } = body;

    if (!sourceDeviceId) {
      return NextResponse.json({ error: "복제할 원본 장치가 없습니다." }, { status: 400 });
    }
    const invalid = validateDeviceInput({ deviceId: newDeviceId, name: newName, description: newDescription || undefined }, "create");
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
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
        { error: "이미 사용 중인 장치 ID입니다." },
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
