import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { SESSION_COOKIE, readSealedSession, type AdminSession } from "@/lib/session";

/** 현재 요청의 봉인 세션을 읽는다(서버 컴포넌트·라우트 핸들러용). */
export async function getServerAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  return readSealedSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getAdminId(): Promise<number | null> {
  const session = await getServerAdminSession();
  return session?.adminId ?? null;
}

export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = await prisma.adminAccount.findUnique({ where: { id: session.adminId } });
    if (!admin || !admin.isActive) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
