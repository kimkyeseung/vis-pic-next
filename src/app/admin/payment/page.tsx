"use client";

import { useEffect, useState } from "react";

const PAYMENT_FIELDS = [
  { name: "PAYMENT_ENABLED", label: "결제 사용", type: "select" as const, options: [{ value: "1", label: "사용" }, { value: "0", label: "사용 안함" }] },
  { name: "PAYMENT_AMOUNT", label: "결제 금액 (원)", type: "number" as const },
  { name: "PAYMENT_TERMINAL_MODE", label: "결제 방식", type: "select" as const, options: [{ value: "manual", label: "수동" }, { value: "payapp_lite", label: "PayApp Lite" }] },
];

const PAYAPP_FIELDS = [
  { name: "PAYAPP_USERID", label: "판매자 ID" },
  { name: "PAYAPP_SHOPNAME", label: "상점명" },
  { name: "PAYAPP_GOODNAME", label: "상품명" },
  { name: "PAYAPP_RECVPHONE", label: "수신 전화번호" },
  { name: "PAYAPP_FEEDBACK_URL", label: "피드백 URL" },
  { name: "PAYAPP_RETURN_URL", label: "리턴 URL" },
  { name: "PAYAPP_OPENPAYTYPE", label: "결제 수단 (card,phone,...)" },
];

export default function PaymentPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/setting")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const update = (name: string, value: string) =>
    setSettings((prev) => ({ ...prev, [name]: value }));

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setMessage(res.ok ? "저장되었습니다." : "저장 실패");
      if (res.ok) setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("서버 연결 실패");
    } finally {
      setSaving(false);
    }
  };

  const paymentEnabled = settings["PAYMENT_ENABLED"] === "1";

  if (loading) return <div className="text-gray-400">로딩중...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">결제 설정</h2>

      {/* 기본 결제 설정 */}
      <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
        <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3">기본 설정</h3>
        {PAYMENT_FIELDS.map((field) => (
          <div key={field.name} className="grid grid-cols-[200px_1fr] gap-4 items-center">
            <label className="text-gray-400 text-sm">{field.label}</label>
            {field.type === "select" && field.options ? (
              <select
                value={settings[field.name] || ""}
                onChange={(e) => update(field.name, e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">-</option>
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                value={settings[field.name] || ""}
                onChange={(e) => update(field.name, e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            )}
          </div>
        ))}
      </div>

      {/* PayApp 연동 — 결제 사용 + PayApp Lite 선택 시만 표시 */}
      {paymentEnabled && settings["PAYMENT_TERMINAL_MODE"] === "payapp_lite" && (
        <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3">
            PayApp 연동 설정
          </h3>
          {PAYAPP_FIELDS.map((field) => (
            <div key={field.name} className="grid grid-cols-[200px_1fr] gap-4 items-center">
              <label className="text-gray-400 text-sm">{field.label}</label>
              <input
                type="text"
                value={settings[field.name] || ""}
                onChange={(e) => update(field.name, e.target.value)}
                placeholder={field.name}
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
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </div>
  );
}
