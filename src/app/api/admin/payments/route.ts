import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const status = searchParams.get("status") || "";
    // 지점 검색어: 장치 ID 또는 지점 이름의 부분 일치(대소문자 무시).
    const deviceQuery = (searchParams.get("deviceId") || "").trim();

    const where = {
      ...(status ? { status } : {}),
      ...(deviceQuery
        ? {
            OR: [
              { deviceId: { contains: deviceQuery, mode: "insensitive" as const } },
              { device: { name: { contains: deviceQuery, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [total, paidSum, payments] = await Promise.all([
      prisma.payappPayment.count({ where }),
      // 결제완료 합계는 현재 페이지가 아니라 조회 조건 전체 기준으로 낸다.
      prisma.payappPayment.aggregate({ where: { ...where, status: "paid" }, _sum: { amount: true } }),
      prisma.payappPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: { select: { name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      payments,
      paidTotal: paidSum._sum.amount ?? 0,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
