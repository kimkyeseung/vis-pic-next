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

    // ── 위조 방지 검증 ─────────────────────────────────────────
    // PayApp은 피드백에 판매자 연동 KEY/VALUE(linkkey/linkval)를 담아 보낸다.
    // 환경변수가 설정돼 있으면 반드시 일치해야 한다 — orderId만 알아도
    // 임의 요청으로 결제완료 처리되는 것을 막는다.
    const expectedLinkKey = process.env.PAYAPP_LINKKEY;
    const expectedLinkVal = process.env.PAYAPP_LINKVAL;
    if (expectedLinkKey && formData.get("linkkey") !== expectedLinkKey) {
      console.warn("PayApp feedback rejected: linkkey mismatch", { orderId });
      return new Response("FAIL", { status: 403 });
    }
    if (expectedLinkVal && formData.get("linkval") !== expectedLinkVal) {
      console.warn("PayApp feedback rejected: linkval mismatch", { orderId });
      return new Response("FAIL", { status: 403 });
    }
    if (!expectedLinkKey && !expectedLinkVal) {
      console.warn(
        "PayApp feedback received without PAYAPP_LINKKEY/PAYAPP_LINKVAL configured — feedback authenticity cannot be verified"
      );
    }
    const expectedUserId = process.env.PAYAPP_USERID;
    if (expectedUserId && formData.get("userid") !== expectedUserId) {
      console.warn("PayApp feedback rejected: userid mismatch", { orderId });
      return new Response("FAIL", { status: 403 });
    }

    const payment = await prisma.payappPayment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      return new Response("FAIL", { status: 404 });
    }

    // 결제요청 시 저장해 둔 PayApp 결제번호·금액과 교차 검증
    if (payment.mulNo && mulNo && payment.mulNo !== mulNo) {
      console.warn("PayApp feedback rejected: mul_no mismatch", { orderId });
      return new Response("FAIL", { status: 403 });
    }
    const price = formData.get("price") as string | null;
    if (price && Number(price) !== payment.amount) {
      console.warn("PayApp feedback rejected: price mismatch", { orderId });
      return new Response("FAIL", { status: 403 });
    }

    const payStateNum = Number(payState);
    // PayApp 상태 코드: 4=결제완료, 5=환불. 그 외(처리 중 등)는 DB 갱신 없이 수신 확인만 반환.
    const statusMap: Record<number, string> = { 4: "paid", 5: "refunded" };
    const status = statusMap[payStateNum];
    if (!status) {
      return new Response("SUCCESS", { status: 200 });
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
