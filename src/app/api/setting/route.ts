import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  try {
    const settings = await prisma.setting.findMany();

    const result: Record<string, string> = {};
    for (const setting of settings) {
      result[setting.name] = setting.value;
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();

    for (const [name, value] of Object.entries(body)) {
      if (typeof value === "string") {
        await prisma.setting.upsert({
          where: { name },
          update: { value },
          create: { name, value },
        });
      } else if (value === null) {
        // null 값은 해당 설정 삭제를 의미 (예: 인쇄 배경 제거)
        await prisma.setting.deleteMany({ where: { name } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
