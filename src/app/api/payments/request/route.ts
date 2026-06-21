import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, amount } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const orderId = `arpic-${deviceId}-${Date.now()}`;
    const goodname = process.env.PAYAPP_GOODNAME || "AR-pic 촬영";

    const payment = await prisma.payappPayment.create({
      data: {
        orderId,
        deviceId,
        amount,
        goodname,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const payappUserId = process.env.PAYAPP_USERID;
    const recvphone = process.env.PAYAPP_RECVPHONE;
    const feedbackurl = process.env.PAYAPP_FEEDBACK_URL;
    const returnurl = process.env.PAYAPP_RETURN_URL;

    if (!payappUserId || !recvphone || !feedbackurl || !returnurl) {
      return NextResponse.json({
        orderId: payment.orderId,
        payUrl: null,
        mulNo: null,
        warning: "PayApp is not configured",
      });
    }

    const params = new URLSearchParams();
    params.append("cmd", "payrequest");
    params.append("userid", payappUserId);
    params.append("goodname", goodname);
    params.append("price", String(amount));
    params.append("recvphone", recvphone);
    params.append("feedbackurl", feedbackurl);
    params.append("returnurl", returnurl);
    params.append("var1", orderId);
    params.append("var2", deviceId);

    try {
      const payappRes = await fetch("https://api.payapp.kr/oapi/apiLoad.html", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const payappData = await payappRes.json();

      if (payappData.state === 1) {
        await prisma.payappPayment.update({
          where: { orderId },
          data: {
            mulNo: String(payappData.mul_no),
            userid: payappUserId,
            updatedAt: new Date(),
          },
        });
        return NextResponse.json({
          orderId: payment.orderId,
          payUrl: payappData.payurl,
          mulNo: payappData.mul_no,
        });
      }

      return NextResponse.json({
        orderId: payment.orderId,
        payUrl: null,
        mulNo: null,
        error: payappData.errorMessage || "PayApp request failed",
      });
    } catch {
      return NextResponse.json({
        orderId: payment.orderId,
        payUrl: null,
        mulNo: null,
        warning: "PayApp API unreachable",
      });
    }
  } catch (error) {
    console.error("Error creating payment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
