"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminContext";

interface Device {
  id: number;
  deviceId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function DevicesPage() {
  const { refreshDevices } = useAdmin();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

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
    </div>
  );
}
