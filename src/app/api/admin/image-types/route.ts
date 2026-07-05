import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    // 기본 타입 보장: Image.imageType이 ImageType FK라서 row가 없으면 업로드가 실패한다.
    // 시드 이전 DB에서도 3종(배경/프레임/스티커)이 항상 존재하도록 자가 복구한다.
    const DEFAULT_TYPES = [
      { id: 1, name: "background" },
      { id: 2, name: "image" },
      { id: 3, name: "sticker" },
    ];
    for (const t of DEFAULT_TYPES) {
      await prisma.imageType.upsert({
        where: { id: t.id },
        update: {},
        create: t,
      });
    }

    const imageTypes = await prisma.imageType.findMany({
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ imageTypes });
  } catch (error) {
    console.error("Error fetching image types:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
