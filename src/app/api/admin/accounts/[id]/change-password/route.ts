import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { validateAdminPassword } from "@/lib/accountRules";
import bcrypt from "bcryptjs";

export async function POST(
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
    const { password } = await request.json();

    const invalid = validateAdminPassword(password);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const account = await prisma.adminAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.adminAccount.update({
      where: { id: accountId },
      data: { password: hashed },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error changing password:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
