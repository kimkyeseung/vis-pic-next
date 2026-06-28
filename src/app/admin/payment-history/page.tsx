"use client";

import { useEffect, useState } from "react";

interface Payment {
  id: number;
  orderId: string;
  deviceId: string;
  amount: number;
  goodname: string;
  status: string;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  device: { name: string } | null;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "대기중",
  paid: "결제완료",
  refunded: "환불",
  failed: "실패",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-yellow-900/50 text-yellow-300",
  paid: "bg-green-900/50 text-green-300",
  refunded: "bg-blue-900/50 text-blue-300",
  failed: "bg-red-900/50 text-red-300",
};

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");

  const fetchPayments = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      if (deviceFilter) params.set("deviceId", deviceFilter);

      const res = await fetch(`/api/admin/payments?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setPayments(data.payments || []);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Failed to fetch payments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, deviceFilter]);

  const totalAmount = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">결제 내역</h2>
        <div className="text-gray-400 text-sm">
          조회된 결제완료 합계:{" "}
          <span className="text-green-400 font-semibold">{totalAmount.toLocaleString()}원</span>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">전체 상태</option>
          <option value="pending">대기중</option>
          <option value="paid">결제완료</option>
          <option value="refunded">환불</option>
          <option value="failed">실패</option>
        </select>
        <input
          type="text"
          value={deviceFilter}
          onChange={(e) => setDeviceFilter(e.target.value)}
          placeholder="장치 ID 검색"
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-48"
        />
        <span className="text-gray-500 text-sm self-center">총 {pagination.total}건</span>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="text-gray-400">로딩중...</div>
      ) : payments.length === 0 ? (
        <div className="p-12 bg-gray-800 rounded-xl text-center border border-gray-700">
          <p className="text-gray-400">결제 내역이 없습니다.</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">주문번호</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">장치</th>
                <th className="px-4 py-3 text-right text-gray-300 font-medium">금액</th>
                <th className="px-4 py-3 text-center text-gray-300 font-medium">상태</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">결제일시</th>
                <th className="px-4 py-3 text-left text-gray-300 font-medium">요청일시</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <code className="text-blue-400 text-xs">{p.orderId}</code>
                  </td>
                  <td className="px-4 py-3 text-white">
                    <div>{p.device?.name || p.deviceId}</div>
                    <div className="text-gray-500 text-xs">{p.deviceId}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {p.amount.toLocaleString()}원
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_CLASS[p.status] || "bg-gray-700 text-gray-300"}`}>
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {p.paidAt
                      ? new Date(p.paidAt).toLocaleString("ko-KR")
                      : p.cancelledAt
                        ? new Date(p.cancelledAt).toLocaleString("ko-KR")
                        : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(p.createdAt).toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => fetchPayments(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-40"
          >
            이전
          </button>
          <span className="px-4 py-2 text-gray-400">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => fetchPayments(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
