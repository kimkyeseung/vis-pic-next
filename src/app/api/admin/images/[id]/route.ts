import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { unlink } from "fs/promises";
import path from "path";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const image = await prisma.image.findUnique({
      where: { id: parseInt(id) },
    });

    if (!image) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    // Delete file from disk
    try {
      const filepath = path.join(
        process.cwd(),
        "public",
        "static",
        "images",
        image.filename
      );
      await unlink(filepath);
    } catch {
      // File may not exist, continue with database deletion
    }

    // Delete from database
    await prisma.image.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
