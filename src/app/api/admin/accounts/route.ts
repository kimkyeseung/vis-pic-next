import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { validateAdminName, validateAdminPassword, validateAdminUsername } from "@/lib/accountRules";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)));
  const keyword = searchParams.get("keyword")?.trim() ?? "";

  const where = keyword
    ? {
        OR: [
          { username: { contains: keyword, mode: "insensitive" as const } },
          { name: { contains: keyword, mode: "insensitive" as const } },
        ],
      }
    : {};

  try {
    const [total, accounts] = await Promise.all([
      prisma.adminAccount.count({ where }),
      prisma.adminAccount.findMany({
        where,
        select: { id: true, username: true, name: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({ accounts, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { username, password, name } = await request.json();

    const invalid = validateAdminUsername(username) ?? validateAdminPassword(password) ?? validateAdminName(name);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    // 저장은 앞뒤 공백을 뺀 값으로 하므로 중복 검사도 같은 값으로 한다(예전엔 " admin"이 검사를 통과한 뒤 unique 위반 500).
    const trimmedUsername = username.trim();
    const existing = await prisma.adminAccount.findUnique({ where: { username: trimmedUsername } });
    if (existing) {
      return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const account = await prisma.adminAccount.create({
      data: { username: trimmedUsername, password: hashed, name: name?.trim() || null },
      select: { id: true, username: true, name: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
