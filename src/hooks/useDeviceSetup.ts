import { useState, useEffect } from "react";
import type { DeviceConfig, BGImage } from "@/types";
import { parseIntSafe, parseBgRemovalMode, parsePaymentTerminalMode, parseCaptureModes, parseCameraResolution, clampPercent, clampSigned, parseSegmentProcessScale } from "@/lib/deviceConfig";
import { DEFAULT_CAMERA_RESOLUTION } from "@/constants/camera";
import { LOGO_IMAGE_TYPE, WALLPAPER_IMAGE_TYPE, BUTTON_IMAGE_TYPE, WALLPAPER_NAME_LANDSCAPE, WALLPAPER_NAME_PORTRAIT, WALLPAPER_NAME_SUB_LANDSCAPE, WALLPAPER_NAME_SUB_PORTRAIT, BUTTON_NAME_CAPTURE, BUTTON_NAME_NEXT, BUTTON_NAME_PAYMENT } from "@/constants/images";

// 결제 화면 인쇄 매수 선택지(고정). 가격 = 1장당 가격(PAYMENT_AMOUNT) × 수량.
const PAYMENT_QUANTITIES = [1, 2, 4];

const RETRY_MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

/**
 * task가 false를 반환(또는 예외 발생)하면 RETRY_DELAY_MS 뒤 재시도한다.
 * AbortError나 signal.aborted는 즉시 중단, 최대 RETRY_MAX_ATTEMPTS회까지만 재시도.
 * 서버 기동 직후 등 일시적 실패로 폴백 값에 머무르지 않도록 각 로더가 공유하는 재시도 골격.
 */
async function withRetry(signal: AbortSignal, task: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (await task()) return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
    if (signal.aborted || attempt >= RETRY_MAX_ATTEMPTS) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, RETRY_DELAY_MS);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    if (signal.aborted) return;
  }
}

const DEFAULT_CONFIG: DeviceConfig = {
  deviceId: "test",
  deviceName: "테스트 장치",
  paymentEnabled: false,
  paymentAmount: 5000,
  paymentTiers: [
    { qty: 1, price: 5000 },
    { qty: 2, price: 10000 },
    { qty: 4, price: 20000 },
  ],
  paymentTerminalMode: "payapp_lite",
  captureSeconds: 3,
  captureCount: 4,
  cameraResolution: DEFAULT_CAMERA_RESOLUTION,
  chromakeyRgb: "0,255,0",
  chromakeySimilarity: 50,
  chromakeySmoothness: 50,
  chromakeySpill: 0,
  chromakeyChoke: 0,
  chromakeyLumaIndependent: false,
  chromakeyYuvRgb: "0,255,0",
  // 감도/부드러움 기본값이 chromakey 모드(50/50)보다 낮은 이유는 lib/chromakeyYuv.ts 헤더 주석 참고 —
  // UV 거리 스케일에서는 50/50이면 페더 구간이 인물 색까지 덮어 피사체가 반투명해진다.
  chromakeyYuvSimilarity: 30,
  chromakeyYuvSmoothness: 10,
  chromakeyYuvSpill: 0,
  chromakeyYuvOpacity: 100,
  chromakeyYuvContrast: 0,
  chromakeyYuvBrightness: 0,
  chromakeyYuvGamma: 0,
  captureModes: ["1x1", "2x1", "2x2"],
  bgRemovalMode: "mediapipe",
  idleTimeoutSeconds: 30,
  cameraAutoTimerSeconds: 60,
  printAutoTimerSeconds: 30,
  segmentThreshold: 15,
  segmentFeather: 35,
  segmentMaskBlur: 100,
  segmentEdgeShift: 0,
  segmentTemporal: 0,
  segmentRoi: true,
  segmentRoiMargin: 22,
  segmentProcessScale: "auto",
  segmentHandRescue: 50,
  themeTextColor: "#ffffff",
  themePrimaryColor: "#6c6fb4",
  themeBgColor: "#2a2a2a",
  btnGlowEnabled: true,
  btnGlowColor: "#6c6fb4",
  btnGlowSize: 28,
  btnCaptureTextColor: "#2a2a2a",
  btnNextTextColor: "#ffffff",
  btnPaymentTextColor: "#ffffff",
};

export function useDeviceSetup(deviceId: string) {
  const [config, setConfig] = useState<DeviceConfig>(DEFAULT_CONFIG);
  const [backgroundImages, setBackgroundImages] = useState<BGImage[]>([]);
  const [printBgImages, setPrintBgImages] = useState<BGImage[]>([]);
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("");
  const [printSettings, setPrintSettings] = useState<Record<string, string>>({});
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [wallpaperPortraitUrl, setWallpaperPortraitUrl] = useState<string | null>(null);
  const [wallpaperSubUrl, setWallpaperSubUrl] = useState<string | null>(null);
  const [wallpaperSubPortraitUrl, setWallpaperSubPortraitUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [captureButtonImageUrl, setCaptureButtonImageUrl] = useState<string | null>(null);
  const [nextButtonImageUrl, setNextButtonImageUrl] = useState<string | null>(null);
  const [paymentButtonImageUrl, setPaymentButtonImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    // 설정 계층: 하드코딩 기본값 ← 전역 설정(Setting) ← 디바이스별 설정(DeviceSetting)
    // 일시적 실패 시 기본값(결제 비활성 등)으로 남지 않도록 재시도한다
    async function loadSettings(id: string) {
      await withRetry(signal, async () => {
        const [globalRes, deviceRes] = await Promise.all([
          fetch("/api/setting/", { signal }).catch(() => null),
          fetch(`/api/device/${id}/settings/`, { signal }).catch(() => null),
        ]);

        if ((!globalRes || !globalRes.ok) && (!deviceRes || !deviceRes.ok)) {
          return false;
        }

        const globalData = globalRes?.ok ? await globalRes.json() : {};
        const deviceData = deviceRes?.ok ? await deviceRes.json() : {};
        const s: Record<string, string> = {
          ...(globalData.settings || {}),
          ...(deviceData.settings || {}),
        };

        setPrintSettings(s);

        const captureCount = parseIntSafe(s.CAPTURE_COUNT_UNIFORM || "", 4) || 4;
        // 관리자는 "1장당 가격"(PAYMENT_AMOUNT)만 설정, 매수 선택지는 1/2/4장 고정.
        const perSheet = parseIntSafe(s.PAYMENT_AMOUNT || "", 5000);
        const paymentTiers = PAYMENT_QUANTITIES.map((qty) => ({ qty, price: qty * perSheet }));
        const modes = parseCaptureModes(s.CAPTURE_MODES || "1x1,2x2");
        const bgRemovalMode = parseBgRemovalMode(s.CHROMAKEY_MODE || "mediapipe");
        const paymentTerminalMode = parsePaymentTerminalMode(s.PAYMENT_TERMINAL_MODE || "payapp_lite");

        setConfig({
          deviceId: id,
          deviceName: deviceData.device?.name || id,
          paymentEnabled: s.PAYMENT_ENABLED === "1",
          paymentAmount: perSheet,
          paymentTiers,
          paymentTerminalMode,
          captureSeconds: parseIntSafe(s.CAPTURE_SECONDS || "", 3),
          captureCount,
          cameraResolution: parseCameraResolution(s.CAMERA_RESOLUTION || ""),
          chromakeyRgb: s.CHROMAKEY_RGB || "0,255,0",
          chromakeySimilarity: clampPercent(parseIntSafe(s.CHROMAKEY_SIMILARITY || "", 50), 1),
          chromakeySmoothness: clampPercent(parseIntSafe(s.CHROMAKEY_SMOOTHNESS || "", 50)),
          chromakeySpill: clampPercent(parseIntSafe(s.CHROMAKEY_SPILL || "", 0)),
          chromakeyChoke: clampPercent(parseIntSafe(s.CHROMAKEY_CHOKE || "", 0)),
          chromakeyLumaIndependent: s.CHROMAKEY_LUMA === "on",
          chromakeyYuvRgb: s.CHROMAKEY_YUV_RGB || "0,255,0",
          chromakeyYuvSimilarity: clampPercent(parseIntSafe(s.CHROMAKEY_YUV_SIMILARITY || "", 30), 1),
          chromakeyYuvSmoothness: clampPercent(parseIntSafe(s.CHROMAKEY_YUV_SMOOTHNESS || "", 10)),
          chromakeyYuvSpill: clampPercent(parseIntSafe(s.CHROMAKEY_YUV_SPILL || "", 0)),
          chromakeyYuvOpacity: clampPercent(parseIntSafe(s.CHROMAKEY_YUV_OPACITY || "", 100)),
          chromakeyYuvContrast: clampSigned(parseIntSafe(s.CHROMAKEY_YUV_CONTRAST || "", 0)),
          chromakeyYuvBrightness: clampSigned(parseIntSafe(s.CHROMAKEY_YUV_BRIGHTNESS || "", 0)),
          chromakeyYuvGamma: clampSigned(parseIntSafe(s.CHROMAKEY_YUV_GAMMA || "", 0)),
          captureModes: modes,
          bgRemovalMode,
          idleTimeoutSeconds: parseIntSafe(s.IDLE_TIMEOUT_SECONDS || "", 30),
          cameraAutoTimerSeconds: parseIntSafe(s.CAMERA_AUTO_TIMER || "", 60),
          printAutoTimerSeconds: parseIntSafe(s.PRINT_AUTO_TIMER || "", 30),
          segmentThreshold: clampPercent(parseIntSafe(s.CAPTURE_THRESHOLD || "", 15)),
          segmentFeather: clampPercent(parseIntSafe(s.CAPTURE_SMOOTHNESS || "", 35), 1),
          segmentMaskBlur: clampSigned(parseIntSafe(s.CAPTURE_MASK_BLUR || "", 100), 0, 200),
          segmentEdgeShift: clampSigned(parseIntSafe(s.CAPTURE_EDGE_SHIFT || "", 0)),
          segmentTemporal: clampPercent(parseIntSafe(s.CAPTURE_TEMPORAL || "", 0)),
          // 저장된 적 없으면(undefined) 기본 켬. 끄려면 명시적으로 "off"가 들어온다.
          segmentRoi: (s.CAPTURE_ROI || "on") !== "off",
          segmentRoiMargin: clampPercent(parseIntSafe(s.CAPTURE_ROI_MARGIN || "", 22)),
          segmentProcessScale: parseSegmentProcessScale(s.CAPTURE_PROCESS_SCALE || ""),
          segmentHandRescue: clampPercent(parseIntSafe(s.CAPTURE_HAND_RESCUE || "", 50)),
          themeTextColor: s.THEME_TEXT_COLOR || "#ffffff",
          themePrimaryColor: s.THEME_PRIMARY_COLOR || "#6c6fb4",
          themeBgColor: s.THEME_BG_COLOR || "#2a2a2a",
          // 미설정(undefined) 시 기본 켜짐. 명시적으로 "0"이면 끔.
          btnGlowEnabled: s.THEME_BTN_GLOW_ENABLED !== "0",
          btnGlowColor: s.THEME_BTN_GLOW_COLOR || "#6c6fb4",
          btnGlowSize: parseIntSafe(s.THEME_BTN_GLOW_SIZE || "", 28),
          btnCaptureTextColor: s.THEME_BTN_TEXT_COLOR_CAPTURE || "#2a2a2a",
          btnNextTextColor: s.THEME_BTN_TEXT_COLOR_NEXT || "#ffffff",
          btnPaymentTextColor: s.THEME_BTN_TEXT_COLOR_PAYMENT || "#ffffff",
        });
        return true;
      });
    }

    // 서버 기동 직후 등 일시적 실패 시 폴백 그라디언트로 남지 않도록 재시도한다
    async function loadBackgrounds(id: string) {
      await withRetry(signal, async () => {
        // 뱅크 모델: 이 지점에 노출되도록 선택된 배경만(순서대로, 최대 6개) 로드
        const res = await fetch(`/api/device/${id}/backgrounds/`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.images) setBackgroundImages(data.images);
        if (data.baseUrl) setImageBaseUrl(data.baseUrl);
        return true;
      });
    }

    async function loadPrintBackgrounds(id: string) {
      await withRetry(signal, async () => {
        // 뱅크 모델: 이 지점에 노출되도록 선택된 프레임만(순서대로, 최대 6개) 로드
        const res = await fetch(`/api/device/${id}/frames/`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.images) setPrintBgImages(data.images);
        return true;
      });
    }

    // 테마 배경화면(wallpaper, imageType 5) — 첫(대기) 화면 배경 + 나머지 화면(sub) 배경.
    // 같은 타입 안에서 name으로 슬롯(첫/나머지 × 가로/세로)을 구분해 각각 노출한다
    // (화면 방향에 맞춰 서비스에서 선택. 나머지 화면은 미설정 시 배경 단색).
    async function loadWallpaper(id: string) {
      await withRetry(signal, async () => {
        const res = await fetch(`/api/image/list/${WALLPAPER_IMAGE_TYPE}/?device_id=${id}&linked=1`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = await res.json();
        const list: Array<{ name: string; filename: string }> = data.images ?? [];
        const pick = (name: string) => {
          const img = list.find((i) => i.name === name);
          return img && data.baseUrl ? `${data.baseUrl}/${img.filename}` : null;
        };
        setWallpaperUrl(pick(WALLPAPER_NAME_LANDSCAPE));
        setWallpaperPortraitUrl(pick(WALLPAPER_NAME_PORTRAIT));
        setWallpaperSubUrl(pick(WALLPAPER_NAME_SUB_LANDSCAPE));
        setWallpaperSubPortraitUrl(pick(WALLPAPER_NAME_SUB_PORTRAIT));
        return true;
      });
    }

    // 테마 로고(imageType 6) — 서비스 화면 로고. 첫 항목 한 장만 사용.
    async function loadLogo(id: string) {
      await withRetry(signal, async () => {
        const res = await fetch(`/api/image/list/${LOGO_IMAGE_TYPE}/?device_id=${id}&linked=1`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = await res.json();
        const first = data.images?.[0];
        setLogoUrl(first && data.baseUrl ? `${data.baseUrl}/${first.filename}` : null);
        return true;
      });
    }

    // 테마 버튼 이미지(imageType 7) — 촬영하기·다음·결제하기 버튼별 배경. 같은 imageType 안에서
    // name으로 구분한다(배경화면 가로/세로 슬롯과 동일한 패턴).
    async function loadButtonImages(id: string, attempt = 0) {
      const MAX_RETRIES = 5;
      const retry = () => {
        if (signal.aborted || attempt >= MAX_RETRIES) return;
        const timer = setTimeout(() => loadButtonImages(id, attempt + 1), 3000);
        signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
      };
      try {
        const res = await fetch(`/api/image/list/${BUTTON_IMAGE_TYPE}/?device_id=${id}&linked=1`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) { retry(); return; }
        const data = await res.json();
        const list: Array<{ name: string; filename: string }> = data.images ?? [];
        const pick = (name: string) => {
          const img = list.find((i) => i.name === name);
          return img && data.baseUrl ? `${data.baseUrl}/${img.filename}` : null;
        };
        setCaptureButtonImageUrl(pick(BUTTON_NAME_CAPTURE));
        setNextButtonImageUrl(pick(BUTTON_NAME_NEXT));
        setPaymentButtonImageUrl(pick(BUTTON_NAME_PAYMENT));
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
    loadButtonImages(deviceId);

    return () => controller.abort();
  }, [deviceId]);

  return { config, backgroundImages, printBgImages, imageBaseUrl, printSettings, wallpaperUrl, wallpaperPortraitUrl, wallpaperSubUrl, wallpaperSubPortraitUrl, logoUrl, captureButtonImageUrl, nextButtonImageUrl, paymentButtonImageUrl };
}
