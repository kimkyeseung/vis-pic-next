"use client";

import { useAdminDeviceSettings } from "@/hooks/useAdminDeviceSettings";

const PAYMENT_FIELDS = [
  { name: "PAYMENT_ENABLED", label: "결제 사용", type: "select" as const, options: [{ value: "1", label: "사용" }, { value: "0", label: "사용 안함" }] },
  { name: "PAYMENT_AMOUNT", label: "1장당 가격 (원)", type: "number" as const, hint: "결제 화면은 1장/2장/4장 고정. 총액 = 1장당 가격 × 매수 (예: 5000 → 1장 5,000 / 2장 10,000 / 4장 20,000)" },
  { name: "PAYMENT_TERMINAL_MODE", label: "결제 방식", type: "select" as const, options: [{ value: "manual", label: "수동" }, { value: "payapp_lite", label: "PayApp Lite" }] },
];

// 결제요청 API(/api/payments/request)가 이 값(지점 ← 전역)을 쓰고, 비운 항목은 서버 환경변수로 폴백한다.
const PAYAPP_FIELDS = [
  { name: "PAYAPP_USERID", label: "판매자 ID" },
  { name: "PAYAPP_GOODNAME", label: "상품명", placeholder: "AR-pic 촬영" },
  { name: "PAYAPP_RECVPHONE", label: "수신 전화번호" },
  { name: "PAYAPP_FEEDBACK_URL", label: "피드백 URL", placeholder: "https://도메인/api/payments/feedback" },
  { name: "PAYAPP_RETURN_URL", label: "리턴 URL" },
  { name: "PAYAPP_OPENPAYTYPE", label: "결제 수단", placeholder: "비우면 전체 · 예: card,kakaopay,naverpay" },
];

const FIELD_NAMES = [...PAYMENT_FIELDS, ...PAYAPP_FIELDS].map((f) => f.name);

export default function PaymentPage() {
  const { selectedDevice, settings, update, save, loading, saving, message } = useAdminDeviceSettings();

  const paymentEnabled = settings["PAYMENT_ENABLED"] === "1";

  if (loading) return <div className="text-gray-400">로딩중...</div>;
  if (!selectedDevice) return <div className="p-8 bg-gray-800 rounded-xl text-center text-gray-400">상단에서 지점을 선택하세요.</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">결제 설정</h2>
        <p className="mt-1 text-sm text-gray-500">
          <span className="text-white font-medium">{selectedDevice.name}</span> 지점 설정입니다.
        </p>
      </div>

      {/* 기본 결제 설정 */}
      <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3">기본 설정</h3>
        {PAYMENT_FIELDS.map((field) => (
          <div key={field.name} className="grid grid-cols-[200px_1fr] gap-4 items-start">
            <label className="text-gray-400 text-sm pt-2">{field.label}</label>
            <div>
              {field.type === "select" && "options" in field && field.options ? (
                <select
                  value={settings[field.name] || ""}
                  onChange={(e) => update(field.name, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-</option>
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={settings[field.name] || ""}
                  onChange={(e) => update(field.name, e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              )}
              {"hint" in field && field.hint && (
                <p className="text-gray-500 text-xs mt-1">{field.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* PayApp 연동 — 결제 사용 + PayApp Lite 선택 시만 표시 */}
      {paymentEnabled && settings["PAYMENT_TERMINAL_MODE"] === "payapp_lite" && (
        <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3">
            PayApp 연동 설정
          </h3>
          <p className="text-gray-500 text-xs">
            비워 둔 항목은 서버 환경변수 값을 사용합니다. 판매자 ID·수신 전화번호·피드백 URL·리턴 URL이 모두 있어야 결제창이 열립니다.
            피드백 위변조 검증용 연동 KEY/VALUE는 보안상 서버 환경변수(PAYAPP_LINKKEY/LINKVAL)로만 설정합니다.
          </p>
          {PAYAPP_FIELDS.map((field) => (
            <div key={field.name} className="grid grid-cols-[200px_1fr] gap-4 items-center">
              <label className="text-gray-400 text-sm">{field.label}</label>
              <input
                type="text"
                value={settings[field.name] || ""}
                onChange={(e) => update(field.name, e.target.value)}
                placeholder={"placeholder" in field && field.placeholder ? field.placeholder : "미설정 (서버 기본값 사용)"}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
      )}

      {message && (
        <div className={`p-4 rounded-lg ${message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-[#2a2a2a]">
        <button
          onClick={() => save(FIELD_NAMES)}
          disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </div>
  );
}
