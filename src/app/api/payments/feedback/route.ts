import { NextRequest } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const mul_no = formData.get("mul_no") as string | null;
    const pay_state = formData.get("pay_state") as string | null;
    const price = formData.get("price") as string | null;
    const sessionId = formData.get("var1") as string | null;
    const deviceId = formData.get("var2") as string | null;

    if (!sessionId) {
      console.error("PayApp feedback missing var1 (sessionId)");
      return new Response("FAIL", { status: 400 });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      console.error(`PayApp feedback: session not found (id=${sessionId})`);
      return new Response("FAIL", { status: 404 });
    }

    const existingData = JSON.parse(session.data);

    let paymentStatus: string;
    const payStateNum = Number(pay_state);

    if (payStateNum === 4) {
      paymentStatus = "completed";
    } else if (payStateNum === 5) {
      paymentStatus = "refunded";
    } else {
      paymentStatus = "failed";
    }

    const updatedData = {
      ...existingData,
      paymentStatus,
      mul_no: mul_no || existingData.mul_no,
      pay_state: payStateNum,
      price: price ? Number(price) : existingData.amount,
      deviceId: deviceId || existingData.deviceId,
    };

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        data: JSON.stringify(updatedData),
      },
    });

    return new Response("SUCCESS", { status: 200 });
  } catch (error) {
    console.error("Error processing PayApp feedback:", error);
    return new Response("FAIL", { status: 500 });
  }
}
