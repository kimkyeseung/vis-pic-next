import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { deleteImage } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const imageId = parseInt(id);
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (typeof body.focalX === "number") data.focalX = Math.max(0, Math.min(1, body.focalX));
    if (typeof body.focalY === "number") data.focalY = Math.max(0, Math.min(1, body.focalY));
    if (typeof body.name === "string") data.name = body.name.slice(0, 32);
    if (typeof body.priority === "number" && Number.isFinite(body.priority)) {
      data.priority = Math.trunc(body.priority);
    }

    // deviceIds 배열이 오면 조인 행을 통째로 교체한다(빈 배열 = 모든 디바이스).
    const hasDeviceIds = Array.isArray(body.deviceIds);
    const deviceIds: string[] = hasDeviceIds
      ? body.deviceIds.filter((d: unknown): d is string => typeof d === "string" && d.length > 0)
      : [];

    if (Object.keys(data).length === 0 && !hasDeviceIds) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.image.update({ where: { id: imageId }, data });
      }
      if (hasDeviceIds) {
        await tx.imageDevice.deleteMany({ where: { imageId } });
        if (deviceIds.length > 0) {
          await tx.imageDevice.createMany({
            data: deviceIds.map((deviceId) => ({ imageId, deviceId })),
          });
        }
      }
    });

    const updated = await prisma.image.findUnique({
      where: { id: imageId },
      include: { devices: { select: { deviceId: true } } },
    });

    return NextResponse.json({
      success: true,
      image: updated && {
        id: updated.id,
        name: updated.name,
        priority: updated.priority,
        focalX: updated.focalX,
        focalY: updated.focalY,
        deviceIds: updated.devices.map((d) => d.deviceId),
      },
    });
  } catch (error) {
    console.error("Error updating image:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;

    const image = await prisma.image.findUnique({
      where: { id: parseInt(id) },
    });

    if (!image) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    // Delete file from storage (local + Supabase if configured)
    await deleteImage(image.filename);

    // Delete from database
    await prisma.image.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
