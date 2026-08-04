import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { uploadImage, deleteImage, getImageBaseUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";
import { BACKGROUND_IMAGE_TYPE, EFFECT_VIDEO_EXTENSIONS, EFFECT_DURATION_RANGE } from "@/constants/images";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * 배경(type 1)의 동작 트리거 이펙트 영상을 업로드/교체한다.
 * multipart form: { file: video, duration?: number(초) }
 * 기존 이펙트 영상이 있으면 스토리지에서 삭제하고 새 파일로 교체한다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const imageId = parseInt(id);

    const target = await prisma.image.findUnique({
      where: { id: imageId },
      select: { imageType: true, effectFilename: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    if (target.imageType !== BACKGROUND_IMAGE_TYPE) {
      return NextResponse.json(
        { error: "이펙트 영상은 배경 이미지에만 설정할 수 있습니다." },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size exceeds 50MB limit" }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !EFFECT_VIDEO_EXTENSIONS.includes(ext as (typeof EFFECT_VIDEO_EXTENSIONS)[number])) {
      return NextResponse.json(
        { error: "이펙트 영상은 " + EFFECT_VIDEO_EXTENSIONS.join(", ") + " 파일만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }

    const durationRaw = formData.get("duration");
    let effectDuration: number | undefined;
    if (typeof durationRaw === "string" && durationRaw) {
      const n = parseInt(durationRaw, 10);
      if (Number.isFinite(n)) {
        effectDuration = Math.max(EFFECT_DURATION_RANGE.min, Math.min(EFFECT_DURATION_RANGE.max, n));
      }
    }

    const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const filename = `${uid}.${ext}`;
    await uploadImage(file, filename);

    // 새 파일 저장 성공 후 이전 이펙트 파일 정리
    const oldFilename = target.effectFilename;

    await prisma.image.update({
      where: { id: imageId },
      data: {
        effectFilename: filename,
        ...(effectDuration !== undefined ? { effectDuration } : {}),
      },
    });

    if (oldFilename && oldFilename !== filename) {
      await deleteImage(oldFilename).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      effectFilename: filename,
      url: `${getImageBaseUrl()}/${filename}`,
    });
  } catch (error) {
    console.error("Error uploading effect video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** 배경의 이펙트 영상을 제거한다(파일 삭제 + 컬럼 비움). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const imageId = parseInt(id);

    const target = await prisma.image.findUnique({
      where: { id: imageId },
      select: { effectFilename: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    await prisma.image.update({
      where: { id: imageId },
      data: { effectFilename: null, effectDuration: null },
    });

    if (target.effectFilename) {
      await deleteImage(target.effectFilename).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting effect video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
