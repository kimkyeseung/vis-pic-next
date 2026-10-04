import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getImageBaseUrl, downloadImage, uploadImage } from "@/lib/storage";
import { FRAME_IMAGE_TYPE } from "@/constants/images";
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

    // 연결할 디바이스 코드 목록. 비어 있으면 모든 디바이스에 적용된다.
    const targetDeviceIds: string[] = Array.isArray(deviceIds)
      ? deviceIds.filter((d): d is string => typeof d === "string" && d.length > 0)
      : [];

    const truncatedName = String(name).slice(0, 32);
    const resolvedType = parseInt(imageType) || 1;

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
