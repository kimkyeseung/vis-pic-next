import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// 초기 화면(장치 선택)에서 쓰는 공개 목록 — 관리자 인증 없이
// 활성 장치의 최소 정보(deviceId, name)만 노출한다.
export async function GET() {
  try {
    const devices = await prisma.device.findMany({
      where: { isActive: true },
      select: { deviceId: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ devices });
  } catch (error) {
    console.error("Error fetching devices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
