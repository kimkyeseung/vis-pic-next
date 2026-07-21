import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

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

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set("admin_session", admin.id.toString(), {
      httpOnly: true,
      // 프로덕션 빌드도 Tauri 임베디드 서버(http://localhost:3001)에서 HTTP로
      // 서빙된다. NODE_ENV=production 기준으로 Secure를 켜면 HTTP origin에서
      // 브라우저가 쿠키를 저장/전송하지 않아 로그인 후 proxy 인증 게이트가
      // 세션을 못 보고 로그인 페이지로 되돌린다. HTTPS로 서빙할 때만 명시적으로 켠다.
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
    });

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
