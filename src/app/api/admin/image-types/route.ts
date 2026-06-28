import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

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
