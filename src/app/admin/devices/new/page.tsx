"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewDevicePage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, name, description }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "장치 생성에 실패했습니다.");
        return;
      }

      router.push("/admin/devices");
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/devices"
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          ← 뒤로
        </Link>
        <h2 className="text-2xl font-bold text-white">새 장치 추가</h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-6 bg-gray-800 rounded-xl space-y-6"
      >
        <div>
          <label className="block text-gray-300 mb-2">
            장치 ID <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            placeholder="예: booth-001"
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            영문, 숫자, 하이픈만 사용 가능합니다
          </p>
        </div>

        <div>
          <label className="block text-gray-300 mb-2">
            장치 이름 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            placeholder="예: 1층 포토부스"
            required
          />
        </div>

        <div>
          <label className="block text-gray-300 mb-2">설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            placeholder="장치에 대한 설명을 입력하세요"
          />
        </div>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "생성 중..." : "장치 추가"}
          </button>
          <Link
            href="/admin/devices"
            className="px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-500 transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
