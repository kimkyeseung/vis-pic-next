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
    prefix: ["IDLE_"],
    fields: [
      { name: "IDLE_TIMEOUT_SECONDS", label: "유휴 타임아웃 (초, 기본 30)", type: "number" },
    ],
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["basic", "capture"]));

  useEffect(() => {
    fetch("/api/setting/")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/setting/", {
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

  // Keys managed in dedicated pages (print-setting, payment) — hide from this page.
  // ADMIN_*: 로그인은 AdminAccount 테이블 기반이라 미사용 레거시 키 — 노출하지 않음 (평문 비밀번호 포함)
  const HIDDEN_KEYS = new Set([
    "PICTURE_WIDTH", "PICTURE_HEIGHT", "PRINT_BACKGROUND", "CAPTURE_MODES",
    ...Object.keys(settings).filter(
      (k) =>
        k.startsWith("MODE_") || k.startsWith("PAYMENT_") || k.startsWith("PAYAPP_") || k.startsWith("ADMIN_") ||
        k.startsWith("CAPTURE_") || k.startsWith("CAMERA_") || k.startsWith("CHROMAKEY_"),
    ),
  ]);

  const assignedKeys = new Set(GROUPS.flatMap((g) => {
    if (g.fields) return g.fields.map((f) => f.name);
    return Object.keys(settings).filter((k) => g.prefix.some((p) => k.startsWith(p)));
  }));
  const otherKeys = Object.keys(settings)
    .filter((k) => !assignedKeys.has(k) && !HIDDEN_KEYS.has(k))
    .sort();

  const visibleCount =
    GROUPS.reduce((n, g) => n + getGroupSettings(g).length, 0) + otherKeys.length;

  if (loading) return <div className="text-gray-400">로딩중...</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">전역 설정</h2>
        <span className="text-gray-500 text-sm">{visibleCount}개 항목</span>
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
                        placeholder="미설정 (기본값 사용)"
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
