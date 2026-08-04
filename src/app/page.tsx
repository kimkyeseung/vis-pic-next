"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DeviceOption {
  deviceId: string;
  name: string;
  hasPassword?: boolean;
}

export default function Home() {
  const router = useRouter();
  const [showDeviceInput, setShowDeviceInput] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resetGate = () => {
    setPassword("");
    setNeedPassword(false);
    setError("");
  };

  const openDevicePicker = () => {
    setShowDeviceInput(true);
    resetGate();
    const saved = localStorage.getItem("last_device_id");
    if (saved) setDeviceId(saved);

    // 관리자 인증이 없는 키오스크에서도 목록이 보이도록 공개 엔드포인트 사용
    fetch("/api/devices/")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices || []))
      .catch(() => {});
  };

  const closeDevicePicker = () => {
    setShowDeviceInput(false);
    resetGate();
  };

  // 목록에서 장치를 고르면 잠금 여부에 따라 비밀번호 입력칸을 미리 노출한다.
  const selectDevice = (dev: DeviceOption) => {
    setDeviceId(dev.deviceId);
    setPassword("");
    setError("");
    setNeedPassword(!!dev.hasPassword);
  };

  const handleStart = async () => {
    const id = deviceId.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      // 실행 잠금 검증 — 비밀번호 미설정 장치는 그대로 통과, 설정된 장치는 일치해야 진입.
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        localStorage.setItem("last_device_id", id);
        router.push(`/service?device=${encodeURIComponent(id)}`);
        return;
      }
      if (data.required) {
        setNeedPassword(true);
        setError(password ? "비밀번호가 올바르지 않습니다." : "이 장치는 비밀번호가 필요합니다.");
      } else {
        setError("장치를 찾을 수 없거나 비활성 상태입니다.");
      }
    } catch {
      setError("서버 연결에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="w-full h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute top-4 right-5 z-10 text-gray-500 text-xs select-none">
        빌드 {process.env.NEXT_PUBLIC_BUILD_DATE}
      </div>
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
            onClick={openDevicePicker}
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
          src="/static/viswave_logo.png"
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
          onClick={closeDevicePicker}
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
                      onClick={() => selectDevice(dev)}
                      className={`text-left px-4 py-3 rounded-lg transition-colors ${
                        deviceId === dev.deviceId
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      <div className="font-semibold flex items-center gap-2">
                        {dev.name}
                        {dev.hasPassword && <span title="비밀번호 필요">🔒</span>}
                      </div>
                      <div className="text-sm opacity-70">{dev.deviceId}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-2">
                {devices.length > 0 ? "또는 직접 입력" : "장치 ID"}
              </label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => { setDeviceId(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="장치 ID를 입력하세요"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {needPassword && (
              <div className="mb-4">
                <label className="block text-gray-400 text-sm mb-2">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  placeholder="장치 비밀번호를 입력하세요"
                  autoComplete="off"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            )}

            {error && (
              <p className="mb-4 text-sm text-red-400">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeDevicePicker}
                className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleStart}
                disabled={!deviceId.trim() || loading}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? "확인 중..." : "시작"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
