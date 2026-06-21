"use client";

import { useEffect, useState } from "react";

interface SettingGroup {
  key: string;
  label: string;
  prefix: string[];
  fields?: { name: string; label: string; type?: "text" | "number" | "select"; options?: { value: string; label: string }[] }[];
}

const GROUPS: SettingGroup[] = [
  {
    key: "basic",
    label: "기본 설정",
    prefix: ["PICTURE_", "PRINT_"],
    fields: [
      { name: "PICTURE_WIDTH", label: "인화 가로 (cm)", type: "number" },
      { name: "PICTURE_HEIGHT", label: "인화 세로 (cm)", type: "number" },
      { name: "PRINT_BACKGROUND", label: "인쇄 배경 이미지 경로" },
    ],
  },
  {
    key: "capture",
    label: "촬영 설정",
    prefix: ["CAPTURE_"],
    fields: [
      { name: "CAPTURE_SECONDS", label: "카운트다운 (초)", type: "number" },
      { name: "CAPTURE_MODES", label: "지원 프레임 (예: 1x1,2x2,2x1)" },
      { name: "CAPTURE_COUNT_MODE", label: "촬영 횟수 모드", type: "select", options: [{ value: "uniform", label: "균일" }, { value: "custom", label: "커스텀" }] },
      { name: "CAPTURE_COUNT_UNIFORM", label: "슬롯당 촬영 횟수", type: "number" },
      { name: "CAPTURE_COUNT_CUSTOM", label: "커스텀 촬영 횟수 (JSON)" },
      { name: "CAPTURE_THRESHOLD", label: "캡처 임계값", type: "number" },
      { name: "CAPTURE_SMOOTHNESS", label: "캡처 부드러움", type: "number" },
    ],
  },
  {
    key: "chromakey",
    label: "크로마키",
    prefix: ["CHROMAKEY_"],
    fields: [
      { name: "CHROMAKEY_MODE", label: "배경 제거 모드", type: "select", options: [{ value: "mediapipe", label: "AI 배경 제거 (기본)" }, { value: "chromakey", label: "크로마키 (그린스크린)" }, { value: "off", label: "비활성" }] },
      { name: "CHROMAKEY_RGB", label: "크로마키 색상 (R,G,B)" },
    ],
  },
  {
    key: "payment",
    label: "결제",
    prefix: ["PAYMENT_"],
    fields: [
      { name: "PAYMENT_ENABLED", label: "결제 사용", type: "select", options: [{ value: "1", label: "사용" }, { value: "0", label: "사용 안함" }] },
      { name: "PAYMENT_AMOUNT", label: "결제 금액 (원)", type: "number" },
      { name: "PAYMENT_TERMINAL_MODE", label: "결제 방식", type: "select", options: [{ value: "manual", label: "수동" }, { value: "payapp_lite", label: "PayApp Lite" }] },
    ],
  },
  {
    key: "payapp",
    label: "PayApp 연동",
    prefix: ["PAYAPP_"],
    fields: [
      { name: "PAYAPP_USERID", label: "판매자 ID" },
      { name: "PAYAPP_SHOPNAME", label: "상점명" },
      { name: "PAYAPP_GOODNAME", label: "상품명" },
      { name: "PAYAPP_RECVPHONE", label: "수신 전화번호" },
      { name: "PAYAPP_FEEDBACK_URL", label: "피드백 URL" },
      { name: "PAYAPP_RETURN_URL", label: "리턴 URL" },
      { name: "PAYAPP_OPENPAYTYPE", label: "결제 수단 (card,phone,...)" },
    ],
  },
  { key: "mode_1_1", label: "프레임 1x1 (1컷)", prefix: ["MODE_1_1_"] },
  { key: "mode_1_2", label: "프레임 1x2 (2컷 가로)", prefix: ["MODE_1_2_"] },
  { key: "mode_2_1", label: "프레임 2x1 (2컷 세로)", prefix: ["MODE_2_1_"] },
  { key: "mode_2_2", label: "프레임 2x2 (4컷)", prefix: ["MODE_2_2_"] },
  { key: "mode_2_3", label: "프레임 2x3 (6컷)", prefix: ["MODE_2_3_"] },
  { key: "mode_2_4", label: "프레임 2x4 (8컷)", prefix: ["MODE_2_4_"] },
  { key: "mode_4_1", label: "프레임 4x1 (4컷 세로)", prefix: ["MODE_4_1_"] },
  {
    key: "admin",
    label: "관리자",
    prefix: ["ADMIN_"],
    fields: [
      { name: "ADMIN_ID", label: "관리자 ID" },
      { name: "ADMIN_PASSWORD", label: "관리자 비밀번호" },
    ],
  },
];

const FRAME_FIELD_LABELS: Record<string, string> = {
  WIDTH: "가로 (cm)",
  HEIGHT: "세로 (cm)",
  HGAP: "가로 간격 (cm)",
  VGAP: "세로 간격 (cm)",
  MARGIN_TOP: "상단 여백 (cm)",
  MARGIN_BOTTOM: "하단 여백 (cm)",
  MARGIN_LEFT: "좌측 여백 (cm)",
  MARGIN_RIGHT: "우측 여백 (cm)",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["basic", "capture", "payment"]));

  useEffect(() => {
    fetch("/api/setting")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setMessage(res.ok ? "설정이 저장되었습니다." : "저장 실패");
      if (res.ok) setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("서버 연결 실패");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (name: string, value: string) => {
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const getGroupSettings = (group: SettingGroup) => {
    if (group.fields) return group.fields;
    return Object.keys(settings)
      .filter((k) => group.prefix.some((p) => k.startsWith(p)))
      .sort()
      .map((k) => {
        const suffix = group.prefix.reduce((s, p) => (k.startsWith(p) ? k.slice(p.length) : s), k);
        return { name: k, label: FRAME_FIELD_LABELS[suffix] || suffix, type: "text" as const };
      });
  };

  const assignedKeys = new Set(GROUPS.flatMap((g) => {
    if (g.fields) return g.fields.map((f) => f.name);
    return Object.keys(settings).filter((k) => g.prefix.some((p) => k.startsWith(p)));
  }));
  const otherKeys = Object.keys(settings).filter((k) => !assignedKeys.has(k)).sort();

  if (loading) return <div className="text-gray-400">로딩중...</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">전역 설정</h2>
        <span className="text-gray-500 text-sm">{Object.keys(settings).length}개 항목</span>
      </div>

      {GROUPS.map((group) => {
        const fields = getGroupSettings(group);
        if (fields.length === 0) return null;
        const isOpen = openGroups.has(group.key);

        return (
          <div key={group.key} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <button
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-750 transition-colors"
              onClick={() => toggleGroup(group.key)}
            >
              <div className="flex items-center gap-3">
                <span className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>&#9654;</span>
                <span className="text-white font-semibold">{group.label}</span>
                <span className="text-gray-500 text-sm">({fields.length})</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-6 pb-6 space-y-4 border-t border-gray-700 pt-4">
                {fields.map((field) => (
                  <div key={field.name} className="grid grid-cols-[200px_1fr] gap-4 items-center">
                    <label className="text-gray-400 text-sm truncate" title={field.name}>
                      {field.label}
                    </label>
                    {field.type === "select" && field.options ? (
                      <select
                        value={settings[field.name] || ""}
                        onChange={(e) => updateSetting(field.name, e.target.value)}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
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
                        onChange={(e) => updateSetting(field.name, e.target.value)}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        placeholder={field.name}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {otherKeys.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <button
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-750 transition-colors"
            onClick={() => toggleGroup("_other")}
          >
            <div className="flex items-center gap-3">
              <span className={`text-gray-400 transition-transform ${openGroups.has("_other") ? "rotate-90" : ""}`}>&#9654;</span>
              <span className="text-white font-semibold">기타</span>
              <span className="text-gray-500 text-sm">({otherKeys.length})</span>
            </div>
          </button>
          {openGroups.has("_other") && (
            <div className="px-6 pb-6 space-y-4 border-t border-gray-700 pt-4">
              {otherKeys.map((key) => (
                <div key={key} className="grid grid-cols-[200px_1fr] gap-4 items-center">
                  <label className="text-gray-400 text-sm truncate" title={key}>{key}</label>
                  <input
                    type="text"
                    value={settings[key] || ""}
                    onChange={(e) => updateSetting(key, e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          )}
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
