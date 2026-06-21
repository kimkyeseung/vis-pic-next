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

    const isValid = await bcrypt.compare(password, admin.password);
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
      secure: process.env.NODE_ENV === "production",
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
