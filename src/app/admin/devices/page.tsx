"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminContext";
import type { Device } from "@/types";

export default function DevicesPage() {
  const { refreshDevices } = useAdmin();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloneTarget, setCloneTarget] = useState<Device | null>(null);
  const [cloneForm, setCloneForm] = useState({ deviceId: "", name: "", description: "" });

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/admin/devices");
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (error) {
      console.error("Failed to fetch devices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/admin/devices/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDevices(devices.filter((d) => d.id !== id));
        refreshDevices();
      }
    } catch (error) {
      console.error("Failed to delete device:", error);
    }
  };

  const handleClone = async () => {
    if (!cloneTarget || !cloneForm.deviceId || !cloneForm.name) return;
    try {
      const res = await fetch("/api/admin/devices/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDeviceId: cloneTarget.deviceId,
          newDeviceId: cloneForm.deviceId,
          newName: cloneForm.name,
          newDescription: cloneForm.description || null,
        }),
      });
      if (res.ok) {
        setCloneTarget(null);
        setCloneForm({ deviceId: "", name: "", description: "" });
        fetchDevices();
        refreshDevices();
      } else {
        const data = await res.json();
        alert(data.error || "복제 실패");
      }
    } catch {
      alert("서버 연결 실패");
    }
  };

  const handleToggleActive = async (device: Device) => {
    try {
      const res = await fetch(`/api/admin/devices/${device.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !device.isActive }),
      });

      if (res.ok) {
        setDevices(
          devices.map((d) =>
            d.id === device.id ? { ...d, isActive: !d.isActive } : d
          )
        );
        refreshDevices();
      }
    } catch (error) {
      console.error("Failed to toggle device:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">장치 관리</h2>
        <Link
          href="/admin/devices/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 새 장치 추가
        </Link>
      </div>

      {loading ? (
        <div className="text-gray-400">로딩중...</div>
      ) : devices.length === 0 ? (
        <div className="p-8 bg-gray-800 rounded-xl text-center">
          <p className="text-gray-400 mb-4">등록된 장치가 없습니다.</p>
          <Link
            href="/admin/devices/new"
            className="text-blue-400 hover:underline"
          >
            새 장치 추가하기
          </Link>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-gray-300 font-medium">
                  장치 ID
                </th>
                <th className="px-6 py-4 text-left text-gray-300 font-medium">
                  이름
                </th>
                <th className="px-6 py-4 text-left text-gray-300 font-medium">
                  설명
                </th>
                <th className="px-6 py-4 text-left text-gray-300 font-medium">
                  상태
                </th>
                <th className="px-6 py-4 text-left text-gray-300 font-medium">
                  생성일
                </th>
                <th className="px-6 py-4 text-right text-gray-300 font-medium">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {devices.map((device) => (
                <tr key={device.id} className="hover:bg-gray-750">
                  <td className="px-6 py-4">
                    <code className="px-2 py-1 bg-gray-700 rounded text-blue-400">
                      {device.deviceId}
                    </code>
                  </td>
                  <td className="px-6 py-4 text-white">{device.name}</td>
                  <td className="px-6 py-4 text-gray-400">
                    {device.description || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(device)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        device.isActive
                          ? "bg-green-900/50 text-green-400"
                          : "bg-red-900/50 text-red-400"
                      }`}
                    >
                      {device.isActive ? "활성" : "비활성"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {new Date(device.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link
                      href={`/admin/devices/${device.id}`}
                      className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                    >
                      편집
                    </Link>
                    <button
                      onClick={() => {
                        setCloneTarget(device);
                        setCloneForm({ deviceId: "", name: `${device.name} (복사)`, description: device.description || "" });
                      }}
                      className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors"
                    >
                      복제
                    </button>
                    <button
                      onClick={() => handleDelete(device.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cloneTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">
              장치 복제: {cloneTarget.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">새 장치 ID</label>
                <input
                  type="text"
                  value={cloneForm.deviceId}
                  onChange={(e) => setCloneForm({ ...cloneForm, deviceId: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="예: device_02"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">장치 이름</label>
                <input
                  type="text"
                  value={cloneForm.name}
                  onChange={(e) => setCloneForm({ ...cloneForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1">설명 (선택)</label>
                <input
                  type="text"
                  value={cloneForm.description}
                  onChange={(e) => setCloneForm({ ...cloneForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setCloneTarget(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleClone}
                disabled={!cloneForm.deviceId || !cloneForm.name}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                복제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
