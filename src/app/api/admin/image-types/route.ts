import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const imageTypes = await prisma.imageType.findMany({
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ imageTypes });
  } catch (error) {
    console.error("Error fetching image types:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
