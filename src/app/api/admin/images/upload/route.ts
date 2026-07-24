import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { uploadImage, getImageBaseUrl } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";
import { defaultActiveForNewImage } from "@/lib/imageActive";

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "mp4", "webp"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string;
    const imageType = parseInt(formData.get("imageType") as string) || 1;
    const priority = parseInt(formData.get("priority") as string) || 0;

    // deviceIds: JSON 배열 문자열. 비어 있으면 모든 디바이스에 적용된다.
    let targetDeviceIds: string[] = [];
    const deviceIdsRaw = formData.get("deviceIds");
    if (typeof deviceIdsRaw === "string" && deviceIdsRaw) {
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

    // Generate unique filename (short UUID to fit VarChar(64))
    const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const filename = `${uid}.${ext}`;

    // Upload to Supabase Storage (throws on failure)
    await uploadImage(file, filename);

    // Save to database (name is VarChar(32))
    const image = await prisma.image.create({
      data: {
        name: name.slice(0, 32),
        filename,
        imageType,
        priority,
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
