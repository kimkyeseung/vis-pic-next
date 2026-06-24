import { NextRequest } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const mulNo = formData.get("mul_no") as string | null;
    const payState = formData.get("pay_state") as string | null;
    const orderId = formData.get("var1") as string | null;

    if (!orderId) {
      return new Response("FAIL", { status: 400 });
    }

    const payment = await prisma.payappPayment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      return new Response("FAIL", { status: 404 });
    }

    const payStateNum = Number(payState);
    let status: string;

    if (payStateNum === 4) {
      status = "paid";
    } else if (payStateNum === 5) {
      status = "refunded";
    } else {
      status = "failed";
    }

    await prisma.payappPayment.update({
      where: { orderId },
      data: {
        status,
        payState: payState || undefined,
        mulNo: mulNo || undefined,
        rawPayload: JSON.stringify(Object.fromEntries(formData.entries())),
        paidAt: status === "paid" ? new Date() : undefined,
        cancelledAt: status === "refunded" ? new Date() : undefined,
        updatedAt: new Date(),
      },
    });

    return new Response("SUCCESS", { status: 200 });
  } catch (error) {
    console.error("Error processing PayApp feedback:", error);
    return new Response("FAIL", { status: 500 });
  }
}
