import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { deleteImage } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";
import {
  BACKGROUND_IMAGE_TYPE,
  BANK_IMAGE_TYPES,
  MAX_ACTIVE_BACKGROUNDS,
  normalizeEffectGesture,
  normalizeEffectMode,
  normalizeEffectBlendMode,
  normalizeEffectTransition,
  normalizeRgbString,
  EFFECT_TRANSITION_MS_RANGE,
} from "@/constants/images";

class MaxActiveBackgroundsError extends Error {}

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
    // 이펙트 재생 모드 및 모드별 파라미터. null이면 컬럼 비움(기본값 사용), 값이면 정규화/클램프.
    if (body.effectMode === null) {
      data.effectMode = null;
    } else if (typeof body.effectMode === "string") {
      data.effectMode = normalizeEffectMode(body.effectMode);
    }
    if (body.effectBlendMode === null) {
      data.effectBlendMode = null;
    } else if (typeof body.effectBlendMode === "string") {
      data.effectBlendMode = normalizeEffectBlendMode(body.effectBlendMode);
    }
    if (body.effectTransition === null) {
      data.effectTransition = null;
    } else if (typeof body.effectTransition === "string") {
      data.effectTransition = normalizeEffectTransition(body.effectTransition);
    }
    if (body.effectTransitionMs === null) {
      data.effectTransitionMs = null;
    } else if (typeof body.effectTransitionMs === "number" && Number.isFinite(body.effectTransitionMs)) {
      data.effectTransitionMs = Math.max(
        EFFECT_TRANSITION_MS_RANGE.min,
        Math.min(EFFECT_TRANSITION_MS_RANGE.max, Math.trunc(body.effectTransitionMs)),
      );
    }
    if (body.effectChromaColor === null) {
      data.effectChromaColor = null;
    } else if (typeof body.effectChromaColor === "string") {
      data.effectChromaColor = normalizeRgbString(body.effectChromaColor);
    }
    if (body.effectChromaSimilarity === null) {
      data.effectChromaSimilarity = null;
    } else if (typeof body.effectChromaSimilarity === "number" && Number.isFinite(body.effectChromaSimilarity)) {
      data.effectChromaSimilarity = Math.max(1, Math.min(100, Math.trunc(body.effectChromaSimilarity)));
    }
    if (body.effectChromaSmoothness === null) {
      data.effectChromaSmoothness = null;
    } else if (typeof body.effectChromaSmoothness === "number" && Number.isFinite(body.effectChromaSmoothness)) {
      data.effectChromaSmoothness = Math.max(0, Math.min(100, Math.trunc(body.effectChromaSmoothness)));
    }

    // deviceIds 배열이 오면 조인 행을 통째로 교체한다(빈 배열 = 모든 디바이스). 테마 등 뱅크가 아닌 타입에만 적용.
    const hasDeviceIds = Array.isArray(body.deviceIds);
    const deviceIds: string[] = hasDeviceIds
      ? body.deviceIds.filter((d: unknown): d is string => typeof d === "string" && d.length > 0)
      : [];

    if (Object.keys(data).length === 0 && !hasDeviceIds) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    try {
      await prisma.$transaction(
        async (tx) => {
          // 배경(type 1)을 활성화하려는 경우, 이미 최대치만큼 활성화돼 있으면 거부한다.
          // 카운트 조회와 업데이트를 같은 Serializable 트랜잭션에 묶어, 동시 활성화
          // 요청이 동시에 카운트를 통과해 MAX를 초과하는 것을 DB가 감지·거부하게 한다.
          if (data.active === true) {
            const target = await tx.image.findUnique({
              where: { id: imageId },
              select: { imageType: true, active: true },
            });
            if (
              target?.imageType === BACKGROUND_IMAGE_TYPE &&
              !target.active // 이미 활성인 것을 다시 활성화하는 요청은 카운트 변화 없음
            ) {
              const activeCount = await tx.image.count({
                where: { imageType: BACKGROUND_IMAGE_TYPE, active: true },
              });
              if (activeCount >= MAX_ACTIVE_BACKGROUNDS) {
                throw new MaxActiveBackgroundsError();
              }
            }
          }

          const current = await tx.image.findUnique({ where: { id: imageId }, select: { imageType: true } });
          const typeChanged = data.imageType !== undefined && current !== null && data.imageType !== current.imageType;
          // 배경·프레임·스티커(뱅크 타입)의 지점 연결은 "노출 목록 + 순서"라 지점별 선택 API로만 바꾼다 —
          // 여기서 통째로 교체하면 순서(sortOrder)가 초기화되고 최대 개수도 우회된다.
          const isBank = current !== null && BANK_IMAGE_TYPES.has(current.imageType);

          if (Object.keys(data).length > 0) {
            await tx.image.update({ where: { id: imageId }, data });
          }
          if (typeChanged) {
            // 타입이 바뀌면 이전 타입 노출 목록의 연결을 끊는다(새 타입 목록에 몰래 끼어들지 않도록).
            await tx.imageDevice.deleteMany({ where: { imageId } });
          } else if (hasDeviceIds && !isBank) {
            await tx.imageDevice.deleteMany({ where: { imageId } });
            if (deviceIds.length > 0) {
              await tx.imageDevice.createMany({
                data: deviceIds.map((deviceId) => ({ imageId, deviceId })),
              });
            }
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof MaxActiveBackgroundsError) {
        return NextResponse.json(
          {
            error: `배경은 최대 ${MAX_ACTIVE_BACKGROUNDS}개까지만 활성화할 수 있습니다.`,
            code: "MAX_ACTIVE_BACKGROUNDS",
          },
          { status: 409 },
        );
      }
      // Serializable 격리 수준에서의 쓰기 충돌(동시 활성화 요청 등) — 재시도를 요청한다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return NextResponse.json(
          { error: "다른 요청과 충돌했습니다. 다시 시도해 주세요.", code: "CONFLICT" },
          { status: 409 },
        );
      }
      throw error;
    }

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
