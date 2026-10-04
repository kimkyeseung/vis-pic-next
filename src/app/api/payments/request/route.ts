import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getPayappConfig } from "@/lib/payapp";

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
    // 관리자 결제 설정(지점 ← 전역)에 저장한 값을 쓰고, 비어 있는 항목만 환경변수로 폴백한다.
    const payapp = await getPayappConfig(deviceId);
    const { goodname } = payapp;

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

    const { userid: payappUserId, recvphone, feedbackurl, returnurl, openpaytype } = payapp;

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
    // 결제수단 제한(콤마 구분, 예: "card,kakaopay"). 비우면 판매자 계정에서 가능한 수단이 모두 열린다.
    if (openpaytype) params.append("openpaytype", openpaytype);

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
