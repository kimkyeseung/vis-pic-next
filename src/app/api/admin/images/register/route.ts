import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getImageBaseUrl, downloadImage, uploadImage } from "@/lib/storage";
import { BANK_IMAGE_TYPES, FRAME_IMAGE_TYPE } from "@/constants/images";
import { normalizeFrameToLandscape } from "@/lib/frameOrientation";
import { defaultActiveForNewImage } from "@/lib/imageActive";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { filename, name, imageType, deviceIds } = await request.json();

    if (!filename || !name) {
      return NextResponse.json({ error: "filename and name are required" }, { status: 400 });
    }

    const truncatedName = String(name).slice(0, 32);
    const resolvedType = parseInt(imageType) || 1;

    // 연결할 디바이스 코드 목록(테마 이미지용). 배경·프레임·스티커(뱅크 타입)는 지점 노출을
    // 노출 목록 API로만 바꾸므로 무시한다(여기서 연결하면 최대 개수·순서를 우회한다).
    const targetDeviceIds: string[] = Array.isArray(deviceIds) && !BANK_IMAGE_TYPES.has(resolvedType)
      ? deviceIds.filter((d): d is string => typeof d === "string" && d.length > 0)
      : [];

    // 프레임은 가로 디자인 전제 — 브라우저가 스토리지에 직접 올린(presign) 파일을 내려받아
    // 세로면 시계방향 90° 회전 후 같은 파일명으로 덮어쓴다(upload 라우트와 동일 규칙).
    if (resolvedType === FRAME_IMAGE_TYPE) {
      const ext = String(filename).split(".").pop()?.toLowerCase() ?? "";
      const { buffer, rotated } = await normalizeFrameToLandscape(await downloadImage(filename), ext);
      if (rotated) await uploadImage(buffer, filename);
    }

    const image = await prisma.image.create({
      data: {
        name: truncatedName,
        filename,
        imageType: resolvedType,
        active: await defaultActiveForNewImage(resolvedType),
        devices: {
          create: targetDeviceIds.map((deviceId) => ({ deviceId })),
        },
      },
    });

    return NextResponse.json({
      success: true,
      image: {
        id: image.id,
        name: image.name,
        filename: image.filename,
        url: `${getImageBaseUrl()}/${image.filename}`,
        imageType: image.imageType,
      },
    });
  } catch (error) {
    console.error("Error registering image:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
