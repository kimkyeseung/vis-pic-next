import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      session: {
        id: session.id,
        deviceId: session.deviceId,
        data: JSON.parse(session.data),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingSession = await prisma.session.findUnique({
      where: { id },
    });

    if (!existingSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const existingData = JSON.parse(existingSession.data);
    const newData = { ...existingData, ...body };

    const session = await prisma.session.update({
      where: { id },
      data: {
        data: JSON.stringify(newData),
      },
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        deviceId: session.deviceId,
        data: JSON.parse(session.data),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error updating session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.session.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
