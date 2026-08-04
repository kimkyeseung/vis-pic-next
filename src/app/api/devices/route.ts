import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// 초기 화면(장치 선택)에서 쓰는 공개 목록 — 관리자 인증 없이
// 활성 장치의 최소 정보(deviceId, name)만 노출한다.
export async function GET() {
  try {
    const devices = await prisma.device.findMany({
      where: { isActive: true },
      // password 자체는 내보내지 않고, 잠금 여부만 hasPassword로 노출한다(선택 화면이 비밀번호 입력을 띄울지 판단용).
      select: { deviceId: true, name: true, password: true },
      orderBy: { name: "asc" },
    });
    const safe = devices.map((d) => ({ deviceId: d.deviceId, name: d.name, hasPassword: !!d.password }));
    return NextResponse.json({ devices: safe });
  } catch (error) {
    console.error("Error fetching devices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
