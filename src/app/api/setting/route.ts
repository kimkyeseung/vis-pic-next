import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

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
  try {
    const body = await request.json();

    for (const [name, value] of Object.entries(body)) {
      if (typeof value === "string") {
        await prisma.setting.upsert({
          where: { name },
          update: { value },
          create: { name, value },
        });
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
