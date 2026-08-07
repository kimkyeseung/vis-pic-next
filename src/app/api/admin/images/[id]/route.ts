import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { deleteImage } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";
import { BACKGROUND_IMAGE_TYPE, MAX_ACTIVE_BACKGROUNDS, normalizeEffectGesture } from "@/constants/images";

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
    // 타입 재분류 허용 (배경/프레임/스티커). 잘못된 타입으로 올린 이미지를 삭제·재업로드 없이 교정.
    if (body.imageType === 1 || body.imageType === 2 || body.imageType === 3) {
      data.imageType = body.imageType;
    }
    if (typeof body.active === "boolean") data.active = body.active;
    // 배경 이펙트 최대 재생 시간(초). null이면 기본값 사용(컬럼 비움).
    if (body.effectDuration === null) {
      data.effectDuration = null;
    } else if (typeof body.effectDuration === "number" && Number.isFinite(body.effectDuration)) {
      data.effectDuration = Math.max(1, Math.min(30, Math.trunc(body.effectDuration)));
    }
    // 이펙트 발동 제스처. null이면 기본값 사용(컬럼 비움), 문자열이면 허용 목록으로 정규화.
    if (body.effectGesture === null) {
      data.effectGesture = null;
    } else if (typeof body.effectGesture === "string") {
      data.effectGesture = normalizeEffectGesture(body.effectGesture);
    }

    // 배경(type 1)을 활성화하려는 경우, 이미 최대치만큼 활성화돼 있으면 거부한다.
    if (data.active === true) {
      const target = await prisma.image.findUnique({
        where: { id: imageId },
        select: { imageType: true, active: true },
      });
      if (
        target?.imageType === BACKGROUND_IMAGE_TYPE &&
        !target.active // 이미 활성인 것을 다시 활성화하는 요청은 카운트 변화 없음
      ) {
        const activeCount = await prisma.image.count({
          where: { imageType: BACKGROUND_IMAGE_TYPE, active: true },
        });
        if (activeCount >= MAX_ACTIVE_BACKGROUNDS) {
          return NextResponse.json(
            {
              error: `배경은 최대 ${MAX_ACTIVE_BACKGROUNDS}개까지만 활성화할 수 있습니다.`,
              code: "MAX_ACTIVE_BACKGROUNDS",
            },
            { status: 409 },
          );
        }
      }
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
        active: updated.active,
        focalX: updated.focalX,
        focalY: updated.focalY,
        effectFilename: updated.effectFilename,
        effectDuration: updated.effectDuration,
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
    // 배경 이펙트 영상이 붙어 있으면 함께 정리
    if (image.effectFilename) await deleteImage(image.effectFilename).catch(() => {});

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
