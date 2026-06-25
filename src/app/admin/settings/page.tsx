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
    key: "capture",
    label: "촬영 설정",
    prefix: ["CAPTURE_", "CAMERA_", "CHROMAKEY_"],
    fields: [
      { name: "CAPTURE_SECONDS", label: "카운트다운 (초)", type: "number" },
      { name: "CAPTURE_COUNT_MODE", label: "촬영 횟수 모드", type: "select", options: [{ value: "uniform", label: "균일" }, { value: "custom", label: "커스텀" }] },
      { name: "CAPTURE_COUNT_UNIFORM", label: "슬롯당 촬영 횟수", type: "number" },
      { name: "CAPTURE_COUNT_CUSTOM", label: "커스텀 촬영 횟수 (JSON)" },
      { name: "CAMERA_AUTO_TIMER", label: "자동 촬영 타이머 (초, 기본 60)", type: "number" },
      { name: "CHROMAKEY_MODE", label: "배경 제거 모드", type: "select", options: [{ value: "mediapipe", label: "AI 배경 제거 (기본)" }, { value: "chromakey", label: "크로마키 (그린스크린)" }, { value: "off", label: "비활성" }] },
      { name: "CHROMAKEY_RGB", label: "크로마키 색상 (R,G,B)" },
      { name: "CAPTURE_THRESHOLD", label: "캡처 임계값", type: "number" },
      { name: "CAPTURE_SMOOTHNESS", label: "캡처 부드러움", type: "number" },
    ],
  },
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
        return { name: k, label: suffix, type: "text" as const };
      });
  };

  // Keys managed in dedicated pages (print-setting) — hide from this page
  const PRINT_SETTING_KEYS = new Set([
    "PICTURE_WIDTH", "PICTURE_HEIGHT", "PRINT_BACKGROUND", "CAPTURE_MODES",
    ...Object.keys(settings).filter((k) => k.startsWith("MODE_") || k.startsWith("PAYMENT_") || k.startsWith("PAYAPP_")),
  ]);

  const assignedKeys = new Set(GROUPS.flatMap((g) => {
    if (g.fields) return g.fields.map((f) => f.name);
    return Object.keys(settings).filter((k) => g.prefix.some((p) => k.startsWith(p)));
  }));
  const otherKeys = Object.keys(settings)
    .filter((k) => !assignedKeys.has(k) && !PRINT_SETTING_KEYS.has(k))
    .sort();

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
