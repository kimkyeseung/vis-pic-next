import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getImageBaseUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";
import { STICKER_IMAGE_TYPE, MAX_ACTIVE_STICKERS } from "@/constants/images";

// 지점별 노출 스티커(뱅크 모델):
//  - 스티커(imageType 3)는 ImageDevice 연결이 "이 지점에 노출"을 의미하며 sortOrder로 순서를 관리한다.
//  - 촬영 화면과 관리자 좌측 패널이 이 목록(정렬됨, 최대 N개)을 사용한다.

/** 이 지점에 노출되도록 선택된 스티커 목록(순서대로) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { deviceId } = await params;
    const links = await prisma.imageDevice.findMany({
      where: { deviceId, image: { imageType: STICKER_IMAGE_TYPE } },
      orderBy: { sortOrder: "asc" },
      include: { image: true },
    });
    const images = links.map((l) => ({
      id: l.image.id,
      name: l.image.name,
      filename: l.image.filename,
    }));
    return NextResponse.json(
      { images, baseUrl: getImageBaseUrl() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching device stickers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** 이 지점의 노출 스티커 선택/순서를 통째로 교체. body: { imageIds: number[] } (순서대로, 최대 N개) */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { deviceId } = await params;
    const body = await request.json();
    const rawIds: unknown[] = Array.isArray(body.imageIds) ? body.imageIds : [];
    const requested = rawIds
      .filter((n): n is number => Number.isInteger(n))
      .slice(0, MAX_ACTIVE_STICKERS);

    // 실제 스티커(type 3) 이미지만 허용
    const valid = await prisma.image.findMany({
      where: { id: { in: requested }, imageType: STICKER_IMAGE_TYPE },
      select: { id: true },
    });
    const validSet = new Set(valid.map((v) => v.id));
    const ordered = requested.filter((id) => validSet.has(id));

    await prisma.$transaction(async (tx) => {
      // 이 지점의 스티커 연결만 교체 (다른 이미지 타입의 연결은 건드리지 않음)
      await tx.imageDevice.deleteMany({
        where: { deviceId, image: { imageType: STICKER_IMAGE_TYPE } },
      });
      if (ordered.length > 0) {
        await tx.imageDevice.createMany({
          data: ordered.map((imageId, i) => ({ imageId, deviceId, sortOrder: i })),
        });
      }
    });

    return NextResponse.json({ success: true, count: ordered.length });
  } catch (error) {
    console.error("Error saving device stickers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
