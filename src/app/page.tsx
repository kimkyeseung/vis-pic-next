"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Device {
  id: number;
  deviceId: string;
  name: string;
  isActive: boolean;
}

export default function Home() {
  const router = useRouter();
  const [showDeviceInput, setShowDeviceInput] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showDeviceInput) {
      const saved = localStorage.getItem("last_device_id");
      if (saved) setDeviceId(saved);

      fetch("/api/admin/devices")
        .then((r) => r.json())
        .then((d) => setDevices((d.devices || []).filter((dev: Device) => dev.isActive)))
        .catch(() => {});
    }
  }, [showDeviceInput]);

  const handleStart = () => {
    if (!deviceId.trim()) return;
    localStorage.setItem("last_device_id", deviceId.trim());
    setLoading(true);
    router.push(`/service?device=${encodeURIComponent(deviceId.trim())}`);
  };

  return (
    <main className="w-full h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <div className="pattern-overlay" />
      <div className="floating-elements">
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
        <div className="floating-element" />
      </div>

      <div className="main-container flex flex-col items-center relative z-10">
        <div style={{ marginTop: "150px" }} />

        <div className="text-center mb-0 animate-fadeInUp">
          <h1
            className="text-6xl font-extrabold mb-5 tracking-widest text-white"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
          >
            AR-pic
          </h1>
        </div>

        <div className="flex gap-16 animate-fadeInUp" style={{ animationDelay: "0.3s" }}>
          <button
            onClick={() => setShowDeviceInput(true)}
            className="service-button flex-col gap-3 w-52 min-h-44 p-6 text-xl rounded-2xl"
          >
            <span className="text-3xl opacity-80">📸</span>
            <span className="tracking-wide">서비스 화면</span>
          </button>

          <Link
            href="/admin"
            className="service-button flex-col gap-3 w-52 min-h-44 p-6 text-xl rounded-2xl"
          >
            <span className="text-3xl opacity-80">⚙️</span>
            <span className="tracking-wide">관리자 화면</span>
          </Link>
        </div>

        <img
          src="/static/images/viswave_logo.png"
          className="mt-24 opacity-80"
          style={{ width: "200px" }}
          alt="Viswave"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>

      <div
        className="absolute bottom-8 text-center text-gray-500 text-sm animate-fadeInUp"
        style={{ animationDelay: "0.6s" }}
      >
        <p>터치 또는 클릭하여 원하는 모드를 선택하세요</p>
      </div>

      {showDeviceInput && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowDeviceInput(false)}
        >
          <div
            className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-white mb-6 text-center">장치 선택</h2>

            {devices.length > 0 && (
              <div className="mb-6">
                <label className="block text-gray-400 text-sm mb-2">등록된 장치</label>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {devices.map((dev) => (
                    <button
                      key={dev.deviceId}
                      onClick={() => setDeviceId(dev.deviceId)}
                      className={`text-left px-4 py-3 rounded-lg transition-colors ${
                        deviceId === dev.deviceId
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      <div className="font-semibold">{dev.name}</div>
                      <div className="text-sm opacity-70">{dev.deviceId}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-gray-400 text-sm mb-2">
                {devices.length > 0 ? "또는 직접 입력" : "장치 ID"}
              </label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="장치 ID를 입력하세요"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeviceInput(false)}
                className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleStart}
                disabled={!deviceId.trim() || loading}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? "이동 중..." : "시작"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
