import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { validateDeviceInput } from "@/lib/deviceConfig";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const deviceId = parseInt(id, 10);
    if (isNaN(deviceId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        settings: true,
      },
    });

    if (!device) {
      return NextResponse.json(
        { error: "Device not found" },
        { status: 404 }
      );
    }

    // 비밀번호 해시는 내보내지 않고 설정 여부(hasPassword)만 노출한다.
    return NextResponse.json({ device: { ...device, password: undefined, hasPassword: !!device.password } });
  } catch (error) {
    console.error("Error fetching device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const deviceId = parseInt(id, 10);
    if (isNaN(deviceId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const body = await request.json();
    const { name, description, isActive, password } = body;
    const invalid = validateDeviceInput({ name, description }, "update");
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be boolean" }, { status: 400 });
    }

    // password 처리:
    //  - 문자열(비어있지 않음) → 새 비밀번호로 해시 저장
    //  - null → 비밀번호 제거(잠금 해제)
    //  - undefined → 변경하지 않음
    let passwordData: { password?: string | null } = {};
    if (password === null) {
      passwordData = { password: null };
    } else if (typeof password === "string" && password.length > 0) {
      passwordData = { password: await bcrypt.hash(password, 10) };
    }

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...passwordData,
      },
    });

    return NextResponse.json({ success: true, device: { ...updated, password: undefined, hasPassword: !!updated.password } });
  } catch (error) {
    console.error("Error updating device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const deviceId = parseInt(id, 10);
    if (isNaN(deviceId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { deviceId: true } });
    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }
    // 결제 내역은 지점을 참조(FK)하고 회계 기록이라 지우지 않는다 — 내역이 있으면 삭제를 거부하고 비활성화를 안내한다.
    // (예전엔 설정을 먼저 지운 뒤 지점 삭제가 FK로 실패해 설정만 사라지고 500이 났다.)
    const paymentCount = await prisma.payappPayment.count({ where: { deviceId: device.deviceId } });
    if (paymentCount > 0) {
      return NextResponse.json(
        { error: `결제 내역(${paymentCount}건)이 있는 지점은 삭제할 수 없습니다. 장치 편집에서 '활성'을 꺼 주세요.` },
        { status: 409 },
      );
    }

    // 설정 삭제와 지점 삭제를 한 트랜잭션으로 묶어 중간 실패 시 설정만 사라지지 않게 한다.
    // (이미지 연결 ImageDevice는 onDelete: Cascade로 함께 정리된다)
    await prisma.$transaction([
      prisma.deviceSetting.deleteMany({ where: { deviceId: device.deviceId } }),
      prisma.device.delete({ where: { id: deviceId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
