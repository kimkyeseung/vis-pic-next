import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { evaluateDevicePasswordGate } from "@/lib/deviceAuth";

/**
 * 실행 시 장치 선택 잠금 검증(공개 — 키오스크는 관리자 인증이 없다).
 * body: { password?: string }
 * 응답:
 *  - { ok: true }                     → 비밀번호 미설정 or 일치 → 실행 허용
 *  - { ok: false, required: true }    → 비밀번호 설정됨 + (미입력 또는 불일치) → 입력 요구
 *  - { ok: false, required: false }   → 장치 없음/비활성 → 실행 불가
 * 해시나 비밀번호 존재 여부 외 정보는 노출하지 않는다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { deviceId } = await params;
    const body = await request.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";

    const device = await prisma.device.findFirst({
      where: { deviceId, isActive: true },
      select: { password: true },
    });

    const result = await evaluateDevicePasswordGate(!!device, device?.password, password);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error verifying device password:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
