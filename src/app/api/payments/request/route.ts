import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, amount } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        deviceId,
        data: JSON.stringify({
          paymentStatus: "pending",
          amount,
          mul_no: null,
        }),
        expiresAt,
      },
    });

    const payappUserId = process.env.PAYAPP_USERID;
    const goodname = process.env.PAYAPP_GOODNAME;
    const recvphone = process.env.PAYAPP_RECVPHONE;
    const feedbackurl = process.env.PAYAPP_FEEDBACK_URL;
    const returnurl = process.env.PAYAPP_RETURN_URL;

    if (!payappUserId || !goodname || !recvphone || !feedbackurl || !returnurl) {
      console.error("PayApp environment variables are not fully configured");
      return NextResponse.json({
        sessionId: session.id,
        payUrl: null,
        mul_no: null,
        warning: "PayApp is not configured. Payment session created but payment request was not sent.",
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
    params.append("var1", session.id);
    params.append("var2", deviceId);

    try {
      const payappResponse = await fetch(
        "https://api.payapp.kr/oapi/apiLoad.html",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }
      );

      const payappData = await payappResponse.json();

      if (payappData.state === 1) {
        const sessionData = JSON.parse(session.data);
        sessionData.mul_no = payappData.mul_no;

        await prisma.session.update({
          where: { id: session.id },
          data: {
            data: JSON.stringify(sessionData),
          },
        });

        return NextResponse.json({
          sessionId: session.id,
          payUrl: payappData.payurl,
          mul_no: payappData.mul_no,
        });
      }

      console.error("PayApp request failed:", payappData.errorMessage);
      return NextResponse.json({
        sessionId: session.id,
        payUrl: null,
        mul_no: null,
        error: payappData.errorMessage || "PayApp payment request failed",
      });
    } catch (fetchError) {
      console.error("PayApp API unreachable:", fetchError);
      return NextResponse.json({
        sessionId: session.id,
        payUrl: null,
        mul_no: null,
        warning: "PayApp API is unreachable. Payment session created for polling.",
      });
    }
  } catch (error) {
    console.error("Error creating payment request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
