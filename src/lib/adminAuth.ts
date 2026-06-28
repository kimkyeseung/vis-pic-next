import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const sessionVal = cookieStore.get("admin_session")?.value;

  if (!sessionVal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseInt(sessionVal, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = await prisma.adminAccount.findUnique({ where: { id } });
    if (!admin || !admin.isActive) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
