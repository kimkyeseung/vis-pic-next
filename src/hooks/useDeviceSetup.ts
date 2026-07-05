import { useState, useEffect } from "react";
import type { DeviceConfig, BGImage } from "@/types";
import { parseIntSafe, parseBgRemovalMode, parsePaymentTerminalMode, parseCaptureModes } from "@/lib/deviceConfig";

const DEFAULT_CONFIG: DeviceConfig = {
  deviceId: "test",
  deviceName: "테스트 장치",
  paymentEnabled: false,
  paymentAmount: 1000,
  paymentTerminalMode: "payapp_lite",
  captureSeconds: 3,
  captureCount: 4,
  chromakeyRgb: "0,255,0",
  captureModes: ["1x1", "2x2"],
  bgRemovalMode: "mediapipe",
  idleTimeoutSeconds: 30,
  cameraAutoTimerSeconds: 60,
};

export function useDeviceSetup(deviceId: string) {
  const [config, setConfig] = useState<DeviceConfig>(DEFAULT_CONFIG);
  const [backgroundImages, setBackgroundImages] = useState<BGImage[]>([]);
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("/static/images");
  const [printSettings, setPrintSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    loadSettings(deviceId, signal);
    loadBackgrounds(deviceId, signal);

    return () => controller.abort();
  }, [deviceId]);

  // 설정 계층: 하드코딩 기본값 ← 전역 설정(Setting) ← 디바이스별 설정(DeviceSetting)
  async function loadSettings(id: string, signal: AbortSignal) {
    try {
      const [globalRes, deviceRes] = await Promise.all([
        fetch("/api/setting", { signal }).catch(() => null),
        fetch(`/api/device/${id}/settings`, { signal }).catch(() => null),
      ]);

      const globalData = globalRes?.ok ? await globalRes.json() : {};
      const deviceData = deviceRes?.ok ? await deviceRes.json() : {};
      const s: Record<string, string> = {
        ...(globalData.settings || {}),
        ...(deviceData.settings || {}),
      };

      setPrintSettings(s);

      const captureCount = parseIntSafe(s.CAPTURE_COUNT_UNIFORM || "", 4) || 4;
      const modes = parseCaptureModes(s.CAPTURE_MODES || "1x1,2x2");
      const bgRemovalMode = parseBgRemovalMode(s.CHROMAKEY_MODE || "mediapipe");
      const paymentTerminalMode = parsePaymentTerminalMode(s.PAYMENT_TERMINAL_MODE || "payapp_lite");

      setConfig({
        deviceId: id,
        deviceName: deviceData.device?.name || id,
        paymentEnabled: s.PAYMENT_ENABLED === "1",
        paymentAmount: parseIntSafe(s.PAYMENT_AMOUNT || "", 1000),
        paymentTerminalMode,
        captureSeconds: parseIntSafe(s.CAPTURE_SECONDS || "", 3),
        captureCount,
        chromakeyRgb: s.CHROMAKEY_RGB || "0,255,0",
        captureModes: modes,
        bgRemovalMode,
        idleTimeoutSeconds: parseIntSafe(s.IDLE_TIMEOUT_SECONDS || "", 30),
        cameraAutoTimerSeconds: parseIntSafe(s.CAMERA_AUTO_TIMER || "", 60),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // use defaults
    }
  }

  async function loadBackgrounds(id: string, signal: AbortSignal) {
    try {
      const res = await fetch(`/api/image/list/1?device_id=${id}&check_files=1`, { signal });
      if (!res.ok) return;
      const data = await res.json();
      if (data.images?.length > 0) setBackgroundImages(data.images);
      if (data.baseUrl) setImageBaseUrl(data.baseUrl);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // use fallback
    }
  }

  return { config, backgroundImages, imageBaseUrl, printSettings };
}
