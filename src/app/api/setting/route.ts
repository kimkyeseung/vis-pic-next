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

    // 설정을 병렬로 처리 (순차 upsert 시 원격 DB 왕복이 개수만큼 누적되어 느림)
    await Promise.all(
      Object.entries(body).map(([name, value]) => {
        if (typeof value === "string") {
          return prisma.setting.upsert({ where: { name }, update: { value }, create: { name, value } });
        }
        // null 값은 해당 설정 삭제를 의미 (예: 인쇄 배경 제거)
        if (value === null) {
          return prisma.setting.deleteMany({ where: { name } });
        }
        return null;
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
