import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, sealAdminSession, sessionCookieOptions } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const admin = await prisma.adminAccount.findUnique({
      where: { username },
    });

    if (!admin || !admin.isActive) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    let isValid = false;
    const isHashed = /^\$2[aby]\$/.test(admin.password);

    if (isHashed) {
      isValid = await bcrypt.compare(password, admin.password);
    } else if (admin.password === password) {
      isValid = true;
      const hashed = await bcrypt.hash(password, 10);
      await prisma.adminAccount.update({
        where: { id: admin.id },
        data: { password: hashed },
      });
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // 세션 쿠키 — iron-session으로 봉인(암호화·서명)해 위조를 막는다.
    // Secure는 Tauri 임베디드 HTTP 서버(http://localhost:3001)에서 쿠키가 저장/전송되도록
    // COOKIE_SECURE=true일 때만 켠다(HTTPS 서빙 시).
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, await sealAdminSession(admin.id), sessionCookieOptions());

    return NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
