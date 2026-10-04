import "dotenv/config";
import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/db";

// 회귀 대상: PayApp 피드백 웹훅은 orderId(var1)만 알면 누구나 결제완료로
// 조작할 수 있었다. linkkey/linkval/userid/mul_no/price 교차검증이 다시
// 빠지는 회귀를 잡기 위한 테스트.
const BASE = process.env.INTEGRATION_BASE_URL || "http://localhost:3000"; // 다른 포트로 띄웠으면 INTEGRATION_BASE_URL로 지정
const DEVICE_ID = "test2"; // FK 제약 — 활성 장치여야 함
// 실제 서버가 검증에 쓰는 값을 .env에서 그대로 읽는다 (테스트 코드에 비밀값 하드코딩 금지)
const REAL_USERID = process.env.PAYAPP_USERID;

function feedbackBody(fields: Record<string, string>) {
  return new URLSearchParams(fields).toString();
}

async function createPendingPayment(overrides: Partial<{ amount: number; mulNo: string; userid: string }> = {}) {
  const orderId = `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.payappPayment.create({
    data: {
      orderId,
      deviceId: DEVICE_ID,
      amount: overrides.amount ?? 1000,
      goodname: "테스트 상품",
      status: "pending",
      mulNo: overrides.mulNo ?? "TESTMUL0001",
      userid: overrides.userid ?? null,
    },
  });
}

describe("POST /api/payments/feedback — 위조 방지 검증", () => {
  afterEach(async () => {
    await prisma.payappPayment.deleteMany({ where: { orderId: { startsWith: "probe-" } } });
  });

  it("var1(orderId) 없이 요청하면 400", async () => {
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({ pay_state: "4" }),
    });
    expect(res.status).toBe(400);
  });

  // 판매자 ID는 지점별 관리자 설정으로 바뀔 수 있어, 결제요청 때 실제로 쓴 값(payment.userid)과 비교한다.
  it("userid가 결제요청 때 쓴 판매자 ID와 다르면 403이고 결제 상태는 바뀌지 않는다", async () => {
    const payment = await createPendingPayment({ mulNo: "REALMUL333", userid: "probe-seller-a" });
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({
        var1: payment.orderId,
        pay_state: "4",
        mul_no: payment.mulNo!,
        price: String(payment.amount),
        userid: "forged-userid",
      }),
    });
    expect(res.status).toBe(403);

    const after = await prisma.payappPayment.findUnique({ where: { orderId: payment.orderId } });
    expect(after?.status).toBe("pending");
  });

  it("결제요청 때 저장한 판매자 ID(환경변수와 달라도)와 일치하면 결제완료로 갱신된다", async () => {
    const payment = await createPendingPayment({ mulNo: "REALMUL444", userid: "probe-seller-db" });
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({
        var1: payment.orderId,
        pay_state: "4",
        mul_no: payment.mulNo!,
        price: String(payment.amount),
        userid: "probe-seller-db",
      }),
    });
    expect(res.status).toBe(200);

    const after = await prisma.payappPayment.findUnique({ where: { orderId: payment.orderId } });
    expect(after?.status).toBe("paid");
  });

  it("존재하지 않는 orderId는 404", async () => {
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({
        var1: "probe-nonexistent-order",
        pay_state: "4",
        ...(REAL_USERID ? { userid: REAL_USERID } : {}),
      }),
    });
    expect(res.status).toBe(404);
  });

  it("mul_no가 저장된 값과 다르면 403이고 결제 상태는 바뀌지 않는다", async () => {
    const payment = await createPendingPayment({ mulNo: "REALMUL999" });
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({
        var1: payment.orderId,
        pay_state: "4",
        mul_no: "FORGEDMUL000",
        price: String(payment.amount),
        ...(REAL_USERID ? { userid: REAL_USERID } : {}),
      }),
    });
    expect(res.status).toBe(403);

    const after = await prisma.payappPayment.findUnique({ where: { orderId: payment.orderId } });
    expect(after?.status).toBe("pending");
  });

  it("price가 저장된 금액과 다르면 403이고 결제 상태는 바뀌지 않는다", async () => {
    const payment = await createPendingPayment({ amount: 1000, mulNo: "REALMUL111" });
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({
        var1: payment.orderId,
        pay_state: "4",
        mul_no: payment.mulNo!,
        price: "1", // 실제 결제 금액(1000원)보다 낮게 위조 시도
        ...(REAL_USERID ? { userid: REAL_USERID } : {}),
      }),
    });
    expect(res.status).toBe(403);

    const after = await prisma.payappPayment.findUnique({ where: { orderId: payment.orderId } });
    expect(after?.status).toBe("pending");
  });

  it("모든 값이 일치하면 결제완료(paid)로 갱신된다", async () => {
    const payment = await createPendingPayment({ amount: 1000, mulNo: "REALMUL222" });
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({
        var1: payment.orderId,
        pay_state: "4",
        mul_no: payment.mulNo!,
        price: String(payment.amount),
        ...(REAL_USERID ? { userid: REAL_USERID } : {}),
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("SUCCESS");

    const after = await prisma.payappPayment.findUnique({ where: { orderId: payment.orderId } });
    expect(after?.status).toBe("paid");
    expect(after?.paidAt).toBeTruthy();
  });

  it("pay_state가 4/5가 아니면(처리중 등) 상태를 바꾸지 않고 SUCCESS만 반환한다", async () => {
    const payment = await createPendingPayment({ mulNo: "REALMUL333" });
    const res = await fetch(`${BASE}/api/payments/feedback/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: feedbackBody({
        var1: payment.orderId,
        pay_state: "1",
        ...(REAL_USERID ? { userid: REAL_USERID } : {}),
      }),
    });
    expect(res.status).toBe(200);

    const after = await prisma.payappPayment.findUnique({ where: { orderId: payment.orderId } });
    expect(after?.status).toBe("pending");
  });
});
