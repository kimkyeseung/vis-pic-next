import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin, getAdminId } from "@/lib/adminAuth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!["name", "isActive"].includes(key)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }

    const account = await prisma.adminAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.adminAccount.update({
      where: { id: accountId },
      data: { [key]: value },
      select: { id: true, username: true, name: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ account: updated });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { id } = await params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const currentAdminId = await getAdminId();
  if (currentAdminId === accountId) {
    return NextResponse.json({ error: "자신의 계정은 삭제할 수 없습니다." }, { status: 400 });
  }

  try {
    const account = await prisma.adminAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.adminAccount.delete({ where: { id: accountId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
