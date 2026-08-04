import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: "desc" },
    });

    // 비밀번호 해시는 절대 클라이언트로 내보내지 않고, 설정 여부만 hasPassword로 노출한다.
    // (password: undefined는 JSON 직렬화 시 제외된다)
    const safe = devices.map((d) => ({ ...d, password: undefined, hasPassword: !!d.password }));
    return NextResponse.json({ devices: safe });
  } catch (error) {
    console.error("Error fetching devices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { deviceId, name, description } = body;

    if (!deviceId || !name) {
      return NextResponse.json(
        { error: "Device ID and name are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.device.findUnique({
      where: { deviceId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Device ID already exists" },
        { status: 409 }
      );
    }

    const device = await prisma.device.create({
      data: {
        deviceId,
        name,
        description,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, device });
  } catch (error) {
    console.error("Error creating device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
