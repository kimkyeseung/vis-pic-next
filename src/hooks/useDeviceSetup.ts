import { useState, useEffect } from "react";
import type { DeviceConfig, BGImage } from "@/types";
import { parseIntSafe, parseBgRemovalMode, parsePaymentTerminalMode, parseCaptureModes, parseQuantityOptions, clampPercent } from "@/lib/deviceConfig";
import { MAX_ACTIVE_BACKGROUNDS, LOGO_IMAGE_TYPE } from "@/constants/images";

const DEFAULT_CONFIG: DeviceConfig = {
  deviceId: "test",
  deviceName: "테스트 장치",
  paymentEnabled: false,
  paymentAmount: 1000,
  paymentQuantityOptions: [1, 2, 4],
  paymentTerminalMode: "payapp_lite",
  captureSeconds: 3,
  captureCount: 4,
  chromakeyRgb: "0,255,0",
  captureModes: ["1x1", "2x2"],
  bgRemovalMode: "mediapipe",
  idleTimeoutSeconds: 30,
  cameraAutoTimerSeconds: 60,
  printAutoTimerSeconds: 30,
  segmentThreshold: 15,
  segmentFeather: 35,
  themeTextColor: "#ffffff",
  themePrimaryColor: "#6c6fb4",
};

export function useDeviceSetup(deviceId: string) {
  const [config, setConfig] = useState<DeviceConfig>(DEFAULT_CONFIG);
  const [backgroundImages, setBackgroundImages] = useState<BGImage[]>([]);
  const [printBgImages, setPrintBgImages] = useState<BGImage[]>([]);
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("");
  const [printSettings, setPrintSettings] = useState<Record<string, string>>({});
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // 설정 계층: 하드코딩 기본값 ← 전역 설정(Setting) ← 디바이스별 설정(DeviceSetting)
    // 일시적 실패 시 기본값(결제 비활성 등)으로 남지 않도록 재시도한다
    async function loadSettings(id: string, attempt = 0) {
      const MAX_RETRIES = 5;
      const retry = () => {
        if (signal.aborted || attempt >= MAX_RETRIES) return;
        const timer = setTimeout(() => loadSettings(id, attempt + 1), 3000);
        signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      };
      try {
        const [globalRes, deviceRes] = await Promise.all([
          fetch("/api/setting/", { signal }).catch(() => null),
          fetch(`/api/device/${id}/settings/`, { signal }).catch(() => null),
        ]);

        if ((!globalRes || !globalRes.ok) && (!deviceRes || !deviceRes.ok)) {
          retry();
          return;
        }

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
          paymentQuantityOptions: parseQuantityOptions(s.PAYMENT_QUANTITY_OPTIONS || "1,2,4"),
          paymentTerminalMode,
          captureSeconds: parseIntSafe(s.CAPTURE_SECONDS || "", 3),
          captureCount,
          chromakeyRgb: s.CHROMAKEY_RGB || "0,255,0",
          captureModes: modes,
          bgRemovalMode,
          idleTimeoutSeconds: parseIntSafe(s.IDLE_TIMEOUT_SECONDS || "", 30),
          cameraAutoTimerSeconds: parseIntSafe(s.CAMERA_AUTO_TIMER || "", 60),
          printAutoTimerSeconds: parseIntSafe(s.PRINT_AUTO_TIMER || "", 30),
          segmentThreshold: clampPercent(parseIntSafe(s.CAPTURE_THRESHOLD || "", 15)),
          segmentFeather: clampPercent(parseIntSafe(s.CAPTURE_SMOOTHNESS || "", 35), 1),
          themeTextColor: s.THEME_TEXT_COLOR || "#ffffff",
          themePrimaryColor: s.THEME_PRIMARY_COLOR || "#6c6fb4",
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        retry();
      }
    }

    // 서버 기동 직후 등 일시적 실패 시 폴백 그라디언트로 남지 않도록 재시도한다
    async function loadBackgrounds(id: string, attempt = 0) {
      const MAX_RETRIES = 5;
      const retry = () => {
        if (signal.aborted || attempt >= MAX_RETRIES) return;
        const timer = setTimeout(() => loadBackgrounds(id, attempt + 1), 3000);
        signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      };
      try {
        const res = await fetch(`/api/image/list/1/?device_id=${id}`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) {
          retry();
          return;
        }
        const data = await res.json();
        // 활성 배경만, 우선순위 상위 최대 6개만 서비스 화면에 노출
        if (data.images?.length > 0) {
          const activeBgs = data.images
            .filter((img: { active?: boolean }) => img.active !== false)
            .slice(0, MAX_ACTIVE_BACKGROUNDS);
          setBackgroundImages(activeBgs);
        }
        if (data.baseUrl) setImageBaseUrl(data.baseUrl);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        retry();
      }
    }

    async function loadPrintBackgrounds(id: string, attempt = 0) {
      const MAX_RETRIES = 5;
      const retry = () => {
        if (signal.aborted || attempt >= MAX_RETRIES) return;
        const timer = setTimeout(() => loadPrintBackgrounds(id, attempt + 1), 3000);
        signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      };
      try {
        const res = await fetch(`/api/image/list/2/?device_id=${id}`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) { retry(); return; }
        const data = await res.json();
        if (data.images) setPrintBgImages(data.images);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        retry();
      }
    }

    // 테마 배경화면(wallpaper, imageType 5) — 서비스 화면 전체 배경.
    // 여러 장 있으면 priority 최상위(목록 첫 항목) 한 장만 사용한다.
    async function loadWallpaper(id: string, attempt = 0) {
      const MAX_RETRIES = 5;
      const retry = () => {
        if (signal.aborted || attempt >= MAX_RETRIES) return;
        const timer = setTimeout(() => loadWallpaper(id, attempt + 1), 3000);
        signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      };
      try {
        const res = await fetch(`/api/image/list/5/?device_id=${id}`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) { retry(); return; }
        const data = await res.json();
        const first = data.images?.[0];
        setWallpaperUrl(first && data.baseUrl ? `${data.baseUrl}/${first.filename}` : null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        retry();
      }
    }

    // 테마 로고(imageType 6) — 서비스 화면 로고. 첫 항목 한 장만 사용.
    async function loadLogo(id: string, attempt = 0) {
      const MAX_RETRIES = 5;
      const retry = () => {
        if (signal.aborted || attempt >= MAX_RETRIES) return;
        const timer = setTimeout(() => loadLogo(id, attempt + 1), 3000);
        signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      };
      try {
        const res = await fetch(`/api/image/list/${LOGO_IMAGE_TYPE}/?device_id=${id}`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) { retry(); return; }
        const data = await res.json();
        const first = data.images?.[0];
        setLogoUrl(first && data.baseUrl ? `${data.baseUrl}/${first.filename}` : null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        retry();
      }
    }

    loadSettings(deviceId);
    loadBackgrounds(deviceId);
    loadPrintBackgrounds(deviceId);
    loadWallpaper(deviceId);
    loadLogo(deviceId);

    return () => controller.abort();
  }, [deviceId]);

  return { config, backgroundImages, printBgImages, imageBaseUrl, printSettings, wallpaperUrl, logoUrl };
}
