import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, data } = body;

    if (!deviceId) {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const session = await prisma.session.create({
      data: {
        deviceId,
        data: JSON.stringify(data || {}),
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        deviceId: session.deviceId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error creating session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
