import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: orderId } = await params;

    const payment = await prisma.payappPayment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({
      orderId: payment.orderId,
      paymentStatus: payment.status,
      amount: payment.amount,
    });
  } catch (error) {
    console.error("Error fetching payment status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
