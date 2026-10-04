import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getImageBaseUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";
import { FRAME_IMAGE_TYPE, MAX_ACTIVE_FRAMES } from "@/constants/images";

// 지점별 노출 프레임(뱅크 모델):
//  - 프레임(imageType 2)은 ImageDevice 연결이 "이 지점에 노출"을 의미하며 sortOrder로 순서를 관리한다.
//  - 서비스 화면(인화 배경 선택)과 관리자 좌측 패널이 이 목록(정렬됨, 최대 6개)을 사용한다.

/** 이 지점에 노출되도록 선택된 프레임 목록(순서대로) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { deviceId } = await params;
    const links = await prisma.imageDevice.findMany({
      where: { deviceId, image: { imageType: FRAME_IMAGE_TYPE } },
      // 노출 순서(sortOrder)가 같은 연결(예전 업로드·편집 경로로 생긴 연결은 0으로 들어갔다)은 먼저 등록된 이미지 순.
      orderBy: [{ sortOrder: "asc" }, { imageId: "asc" }],
      // 연결이 몇 개든 상위 프레임 최대 개수만 내보낸다 — 저장(PUT)만 자르면 다른 경로로 쌓인 연결이 서비스에 그대로 노출된다.
      // 관리자 노출 목록도 이 결과를 쓰므로, 거기서 저장하면 초과분 연결은 정리된다.
      take: MAX_ACTIVE_FRAMES,
      include: { image: true },
    });
    const images = links.map((l) => ({
      id: l.image.id,
      name: l.image.name,
      filename: l.image.filename,
      focalX: l.image.focalX ?? 0.5,
      focalY: l.image.focalY ?? 0.5,
    }));
    return NextResponse.json(
      { images, baseUrl: getImageBaseUrl() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching device frames:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** 이 지점의 노출 프레임 선택/순서를 통째로 교체. body: { imageIds: number[] } (순서대로, 최대 6개) */
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
      .slice(0, MAX_ACTIVE_FRAMES);

    // 실제 프레임(type 2) 이미지만 허용
    const valid = await prisma.image.findMany({
      where: { id: { in: requested }, imageType: FRAME_IMAGE_TYPE },
      select: { id: true },
    });
    const validSet = new Set(valid.map((v) => v.id));
    const ordered = requested.filter((id) => validSet.has(id));

    await prisma.$transaction(async (tx) => {
      // 이 지점의 프레임 연결만 교체 (다른 이미지 타입의 연결은 건드리지 않음)
      await tx.imageDevice.deleteMany({
        where: { deviceId, image: { imageType: FRAME_IMAGE_TYPE } },
      });
      if (ordered.length > 0) {
        await tx.imageDevice.createMany({
          data: ordered.map((imageId, i) => ({ imageId, deviceId, sortOrder: i })),
        });
      }
    });

    return NextResponse.json({ success: true, count: ordered.length });
  } catch (error) {
    console.error("Error saving device frames:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
