"use client";

import { useEffect, useState } from "react";

const FIELDS: { name: string; label: string; type?: "text" | "number" | "select"; options?: { value: string; label: string }[]; min?: number; max?: number; hint?: string }[] = [
  { name: "CAPTURE_SECONDS", label: "카운트다운 (초)", type: "number" },
  { name: "CAPTURE_COUNT_MODE", label: "촬영 횟수 모드", type: "select", options: [{ value: "uniform", label: "균일" }, { value: "custom", label: "커스텀" }] },
  { name: "CAPTURE_COUNT_UNIFORM", label: "슬롯당 촬영 횟수", type: "number" },
  { name: "CAPTURE_COUNT_CUSTOM", label: "커스텀 촬영 횟수 (JSON)" },
  { name: "CHROMAKEY_MODE", label: "배경 제거 모드", type: "select", options: [{ value: "mediapipe", label: "AI 배경 제거 (기본)" }, { value: "chromakey", label: "크로마키 (그린스크린)" }, { value: "off", label: "비활성" }] },
  { name: "CHROMAKEY_RGB", label: "크로마키 색상 (R,G,B)" },
  {
    name: "CAPTURE_THRESHOLD",
    label: "AI 배경제거 경계 침식 (%)",
    type: "number",
    min: 0,
    max: 100,
    hint: "높일수록 인물 가장자리를 안쪽으로 더 깎아내 배경과의 경계가 또렷해집니다. 기본값 15.",
  },
  {
    name: "CAPTURE_SMOOTHNESS",
    label: "AI 배경제거 경계 부드러움 (%)",
    type: "number",
    min: 1,
    max: 100,
    hint: "낮을수록 경계가 딱딱하게 잘리고, 높을수록 부드럽게 번집니다. 기본값 35.",
  },
];

export default function CaptureSettingPage() {
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
        <h2 className="text-2xl font-bold text-white">촬영 설정</h2>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 py-6 space-y-4">
          {FIELDS.map((field) => (
            <div key={field.name} className="grid grid-cols-[220px_1fr] gap-4 items-center">
              <label className="text-gray-400 text-sm truncate" title={field.name}>
                {field.label}
              </label>
              <div>
                {field.type === "select" && field.options ? (
                  <select
                    value={settings[field.name] || ""}
                    onChange={(e) => updateSetting(field.name, e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">- 기본값 사용 -</option>
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    min={field.min}
                    max={field.max}
                    value={settings[field.name] || ""}
                    onChange={(e) => updateSetting(field.name, e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="미설정 (기본값 사용)"
                  />
                )}
                {field.hint && <p className="text-gray-500 text-xs mt-1">{field.hint}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

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
