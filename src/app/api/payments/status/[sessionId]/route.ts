import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const data = JSON.parse(session.data);

    return NextResponse.json({
      sessionId: session.id,
      paymentStatus: data.paymentStatus || null,
      amount: data.amount || null,
    });
  } catch (error) {
    console.error("Error fetching payment status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
