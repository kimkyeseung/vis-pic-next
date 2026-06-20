"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

export default function PrinterSettingsPage() {
  const [printers, setPrinters] = useState<string[]>([]);
  const [cameras, setCameras] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    const checkTauri = async () => {
      if (typeof window !== "undefined" && window.__TAURI__) {
        setIsTauri(true);
        await loadDevices();
        await loadSettings();
      }
      setLoading(false);
    };

    checkTauri();
  }, []);

  const loadDevices = async () => {
    try {
      if (window.__TAURI__) {
        const printerList = await window.__TAURI__.core.invoke<string[]>("get_printers");
        setPrinters(printerList);

        const cameraList = await window.__TAURI__.core.invoke<string[]>("get_cameras");
        setCameras(cameraList);
      }
    } catch (error) {
      console.error("Failed to load devices:", error);
    }
  };

  const loadSettings = async () => {
    try {
      if (window.__TAURI__) {
        const settings = await window.__TAURI__.core.invoke<Record<string, string>>("load_settings");
        setSelectedPrinter(settings.printer || "");
        setSelectedCamera(settings.camera || "");
        setDeviceId(settings.deviceId || "");
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");

    try {
      if (window.__TAURI__) {
        await window.__TAURI__.core.invoke("save_settings", {
          settings: {
            printer: selectedPrinter,
            camera: selectedCamera,
            deviceId: deviceId,
          },
        });
        setMessage("설정이 저장되었습니다.");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage("설정 저장에 실패했습니다.");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async () => {
    if (!selectedPrinter) {
      setMessage("프린터를 선택해주세요.");
      return;
    }

    setMessage("테스트 인쇄 중...");
    try {
      // Create a test image path - in production, use an actual test image
      const testImagePath = "C:\\Windows\\Web\\Wallpaper\\Windows\\img0.jpg";

      if (window.__TAURI__) {
        await window.__TAURI__.core.invoke("print_image", {
          printerName: selectedPrinter,
          imagePath: testImagePath,
        });
        setMessage("테스트 인쇄가 전송되었습니다.");
      }
    } catch (error) {
      setMessage("인쇄에 실패했습니다: " + String(error));
    }
  };

  if (loading) {
    return <div className="text-gray-400">로딩중...</div>;
  }

  if (!isTauri) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/admin"
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            ← 뒤로
          </Link>
          <h2 className="text-2xl font-bold text-white">프린터/카메라 설정</h2>
        </div>

        <div className="p-8 bg-gray-800 rounded-xl text-center">
          <div className="text-6xl mb-4">🖥️</div>
          <h3 className="text-xl font-semibold text-white mb-2">
            데스크톱 앱에서만 사용 가능
          </h3>
          <p className="text-gray-400">
            프린터와 카메라 설정은 Tauri 데스크톱 앱에서만 사용할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin"
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          ← 뒤로
        </Link>
        <h2 className="text-2xl font-bold text-white">프린터/카메라 설정</h2>
      </div>

      <div className="p-6 bg-gray-800 rounded-xl space-y-6">
        <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3">
          장치 설정
        </h3>

        <div>
          <label className="block text-gray-300 mb-2">프린터</label>
          <select
            value={selectedPrinter}
            onChange={(e) => setSelectedPrinter(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">프린터 선택</option>
            {printers.map((printer) => (
              <option key={printer} value={printer}>
                {printer}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <button
              onClick={loadDevices}
              className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-500 transition-colors"
            >
              새로고침
            </button>
            <button
              onClick={handleTestPrint}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 transition-colors"
            >
              테스트 인쇄
            </button>
          </div>
        </div>

        <div>
          <label className="block text-gray-300 mb-2">카메라</label>
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">카메라 선택</option>
            {cameras.map((camera, idx) => (
              <option key={idx} value={camera}>
                {camera}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-gray-300 mb-2">장치 ID</label>
          <input
            type="text"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            placeholder="예: booth-001"
          />
          <p className="mt-1 text-sm text-gray-500">
            서버에 등록된 장치 ID를 입력하세요
          </p>
        </div>
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
