"use client";

import { useEffect, useState } from "react";

interface SettingField {
  name: string;
  label: string;
  type: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  description?: string;
}

const settingFields: SettingField[] = [
  {
    name: "PICTURE_WIDTH",
    label: "인화 가로 크기 (cm)",
    type: "number",
    description: "인화 사진의 가로 크기",
  },
  {
    name: "PICTURE_HEIGHT",
    label: "인화 세로 크기 (cm)",
    type: "number",
    description: "인화 사진의 세로 크기",
  },
  {
    name: "CAPTURE_MODES",
    label: "지원 프레임",
    type: "text",
    description: "쉼표로 구분 (예: 1x1,1x2,2x2)",
  },
  {
    name: "DEFAULT_COUNTDOWN",
    label: "기본 카운트다운 (초)",
    type: "number",
    description: "촬영 전 카운트다운 시간",
  },
  {
    name: "AUTO_PRINT",
    label: "자동 인쇄",
    type: "select",
    options: [
      { value: "1", label: "사용" },
      { value: "0", label: "사용 안함" },
    ],
    description: "촬영 완료 후 자동 인쇄 여부",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/setting");
        const data = await res.json();
        setSettings(data.settings || {});
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setMessage("설정이 저장되었습니다.");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("설정 저장에 실패했습니다.");
      }
    } catch {
      setMessage("서버 연결에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-gray-400">로딩중...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">전역 설정</h2>
      </div>

      <div className="p-6 bg-gray-800 rounded-xl space-y-6">
        {settingFields.map((field) => (
          <div key={field.name}>
            <label className="block text-gray-300 mb-2">{field.label}</label>
            {field.type === "select" ? (
              <select
                value={settings[field.name] || ""}
                onChange={(e) =>
                  setSettings({ ...settings, [field.name]: e.target.value })
                }
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">선택하세요</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={settings[field.name] || ""}
                onChange={(e) =>
                  setSettings({ ...settings, [field.name]: e.target.value })
                }
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            )}
            {field.description && (
              <p className="mt-1 text-sm text-gray-500">{field.description}</p>
            )}
          </div>
        ))}
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.includes("실패")
              ? "bg-red-900/50 border border-red-500 text-red-300"
              : "bg-green-900/50 border border-green-500 text-green-300"
          }`}
        >
          {message}
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </div>
  );
}
