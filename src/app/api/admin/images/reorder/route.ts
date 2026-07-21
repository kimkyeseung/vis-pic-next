import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

/**
 * 이미지 순서(priority) 재정렬.
 * body: { ids: number[] } — 화면에 보이는 순서대로의 id 배열(맨 앞이 최상단).
 * 앞에 있을수록 높은 priority 를 부여한다(목록은 priority desc 로 정렬됨).
 */
export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number")) {
      return NextResponse.json(
        { error: "ids must be an array of numbers" },
        { status: 400 }
      );
    }

    const total = ids.length;
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.image.update({
          where: { id },
          data: { priority: total - index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering images:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
