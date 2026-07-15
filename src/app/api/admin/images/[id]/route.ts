import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { deleteImage } from "@/lib/storage";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (typeof body.focalX === "number") data.focalX = Math.max(0, Math.min(1, body.focalX));
    if (typeof body.focalY === "number") data.focalY = Math.max(0, Math.min(1, body.focalY));

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    const updated = await prisma.image.update({
      where: { id: parseInt(id) },
      data,
    });

    return NextResponse.json({ success: true, focalX: updated.focalX, focalY: updated.focalY });
  } catch (error) {
    console.error("Error updating image:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

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

    // Delete file from storage (local + Supabase if configured)
    await deleteImage(image.filename);

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
