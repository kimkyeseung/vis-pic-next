import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { uploadImage, getImageBaseUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";
import { defaultActiveForNewImage } from "@/lib/imageActive";
import { BANK_IMAGE_TYPES, FRAME_IMAGE_TYPE, STICKER_IMAGE_TYPE } from "@/constants/images";
import { normalizeFrameToLandscape } from "@/lib/frameOrientation";

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "mp4", "webp"];
// 프레임·스티커는 PNG/JPG만 허용 (동영상·gif 불필요, 투명 배경 지원)
const IMAGE_ONLY_TYPES = new Set<number>([FRAME_IMAGE_TYPE, STICKER_IMAGE_TYPE]);
const IMAGE_ONLY_EXTENSIONS = ["png", "jpg", "jpeg"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const imageType = parseInt(formData.get("imageType") as string) || 1;

    // deviceIds: JSON 배열 문자열 — 테마 이미지(지점 전용) 연결용. 배경·프레임·스티커(뱅크 타입)는
    // 지점 노출을 노출 목록 API로만 바꾸므로 무시한다(여기서 연결하면 최대 개수·순서를 우회한다).
    let targetDeviceIds: string[] = [];
    const deviceIdsRaw = formData.get("deviceIds");
    if (typeof deviceIdsRaw === "string" && deviceIdsRaw && !BANK_IMAGE_TYPES.has(imageType)) {
      try {
        const parsed = JSON.parse(deviceIdsRaw);
        if (Array.isArray(parsed)) {
          targetDeviceIds = parsed.filter(
            (d): d is string => typeof d === "string" && d.length > 0
          );
        }
      } catch {
        // 무시하고 전체 적용
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 400 }
      );
    }

    // Check file extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: " + ALLOWED_EXTENSIONS.join(", ") },
        { status: 400 }
      );
    }
    // 프레임·스티커는 PNG/JPG만 허용
    if (IMAGE_ONLY_TYPES.has(imageType) && !IMAGE_ONLY_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "프레임·스티커는 PNG·JPG 파일만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }

    // Generate unique filename (short UUID to fit VarChar(64))
    const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const filename = `${uid}.${ext}`;

    // 프레임은 가로 디자인 전제 — 세로 시안이면 시계방향 90° 회전해 가로로 저장한다.
    let body: File | Buffer = file;
    if (imageType === FRAME_IMAGE_TYPE) {
      body = (await normalizeFrameToLandscape(Buffer.from(await file.arrayBuffer()), ext)).buffer;
    }

    // Upload to Supabase Storage (throws on failure)
    await uploadImage(body, filename);

    // Save to database (name is VarChar(32))
    const image = await prisma.image.create({
      data: {
        name: name.slice(0, 32),
        filename,
        imageType,
        active: await defaultActiveForNewImage(imageType),
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
    console.error("Error uploading image:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
