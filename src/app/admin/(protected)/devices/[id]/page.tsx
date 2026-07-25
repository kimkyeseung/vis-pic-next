"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DeviceWithSettings } from "@/types";

export default function DeviceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [device, setDevice] = useState<DeviceWithSettings | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchDevice() {
      try {
        const res = await fetch(`/api/admin/devices/${id}/`);
        const data = await res.json();

        if (res.ok && data.device) {
          setDevice(data.device);
          setName(data.device.name);
          setDescription(data.device.description || "");
        }
      } catch (error) {
        console.error("Failed to fetch device:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDevice();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      // Update device info
      const res = await fetch(`/api/admin/devices/${id}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "장치 수정에 실패했습니다.");
        return;
      }

      router.push("/admin/devices");
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-gray-400">로딩중...</div>;
  }

  if (!device) {
    return <div className="text-red-400">장치를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/devices"
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          ← 뒤로
        </Link>
        <h2 className="text-2xl font-bold text-white">장치 편집</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-6 bg-gray-800 rounded-xl space-y-6">
          <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3">
            기본 정보
          </h3>

          <div>
            <label className="block text-gray-300 mb-2">장치 ID</label>
            <input
              type="text"
              value={device.deviceId}
              disabled
              className="w-full px-4 py-3 bg-gray-600 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2">장치 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
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
            />
          </div>
        </div>

        <div className="p-6 bg-gray-800 rounded-xl">
          <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3 mb-3">
            지점 설정
          </h3>
          <p className="text-sm text-gray-400">
            결제·촬영·타이머·인화 등 지점별 설정은 상단에서 이 지점을 선택한 뒤
            좌측 메뉴의 각 설정 페이지(결제 설정, 촬영 설정, 타이머 설정, 인화 설정)에서 관리합니다.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
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
