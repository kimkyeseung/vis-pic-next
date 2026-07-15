"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  {
    key: "basic",
    label: "기본 타이머",
    description: "화면 유휴 시 자동으로 이전 단계로 이동하는 타이머입니다. (프레임·배경·선택·인화배경 단계에 적용)",
    fields: [
      { name: "IDLE_TIMEOUT_SECONDS", label: "유휴 타임아웃 (초)", placeholder: "기본 30" },
    ],
  },
  {
    key: "camera",
    label: "촬영 타이머",
    description: "촬영 단계에서 일정 시간이 지나면 자동으로 사진을 촬영합니다.",
    fields: [
      { name: "CAMERA_AUTO_TIMER", label: "자동 촬영 타이머 (초)", placeholder: "기본 60, 0이면 비활성" },
    ],
  },
  {
    key: "print",
    label: "인화 타이머",
    description: "인화 완료 화면에서 일정 시간이 지나면 자동으로 처음 화면으로 돌아갑니다.",
    fields: [
      { name: "PRINT_AUTO_TIMER", label: "인화 자동 복귀 타이머 (초)", placeholder: "기본 30, 0이면 비활성" },
    ],
  },
];

export default function TimerSettingPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/setting/")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const updateSetting = (name: string, value: string) => {
    setSettings((prev) => ({ ...prev, [name]: value }));
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

  if (loading) return <div className="text-gray-400">로딩중...</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">타이머 설정</h2>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.key} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-6 pt-5 pb-2">
            <h3 className="text-white font-semibold text-base mb-1">{section.label}</h3>
            <p className="text-gray-500 text-xs mb-4">{section.description}</p>
            <div className="space-y-4">
              {section.fields.map((field) => (
                <div key={field.name} className="grid grid-cols-[220px_1fr] gap-4 items-center">
                  <label className="text-gray-400 text-sm">{field.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={settings[field.name] ?? ""}
                    onChange={(e) => updateSetting(field.name, e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="h-5" />
        </div>
      ))}

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
