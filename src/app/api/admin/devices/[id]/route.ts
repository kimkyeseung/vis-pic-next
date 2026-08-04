import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;

    const device = await prisma.device.findUnique({
      where: { id: parseInt(id) },
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
    const body = await request.json();
    const { name, description, isActive, password } = body;

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
      where: { id: parseInt(id) },
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

    // Delete related settings first
    await prisma.deviceSetting.deleteMany({
      where: {
        device: {
          id: parseInt(id),
        },
      },
    });

    await prisma.device.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting device:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
