"use client";

import { useEffect, useRef, useState } from "react";
import {
  WALLPAPER_NAME_LANDSCAPE,
  WALLPAPER_NAME_PORTRAIT,
  WALLPAPER_NAME_SUB_LANDSCAPE,
  WALLPAPER_NAME_SUB_PORTRAIT,
  buttonImageName,
  WALLPAPER_PAGE_STEPS,
  wallpaperPageName,
  OVERLAY_NAME_CAMERA,
} from "@/constants/images";
import { BUTTON_ROLES, buttonImageOptionKeys, parseButtonImageOptions, parseIntSafe } from "@/lib/deviceConfig";
import type { ButtonImageOptions, ButtonRole } from "@/types";
import type { Asset } from "./AssetUploader";

/** 색상 칸 형식 — 피커가 내는 #rrggbb와 줄임형 #rgb만 허용(그 외 문자열은 서비스 CSS에서 무시돼 색이 안 바뀐다). */
export const isValidHexColor = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

const WALLPAPER_TYPE = 5;
const LOGO_TYPE = 6;
const BUTTON_TYPE = 7;
// imageType 5 안에서 name 맵으로 관리하는 슬롯 — 화면별 배경(가로/세로) + 촬영 화면 안내 오버레이.
const NAMED_WALLPAPER_SLOTS = [
  ...WALLPAPER_PAGE_STEPS.flatMap(({ step }) => [wallpaperPageName(step, false), wallpaperPageName(step, true)]),
  OVERLAY_NAME_CAMERA,
];
// imageType 7 안의 버튼 이미지 슬롯 — 버튼별 가로/세로 화면용.
const BUTTON_SLOTS = BUTTON_ROLES.flatMap((role) => [buttonImageName(role, false), buttonImageName(role, true)]);

/**
 * 테마 관리 페이지의 데이터 계층 — 색상 설정 로드/저장, 배경화면·로고·버튼 이미지 애셋의
 * 업로드/제거를 전부 담당한다. JSX는 이 훅이 반환하는 값을 `AssetUploader`/`ButtonThemeRow`/
 * `ColorRow`에 그대로 꽂기만 하면 된다.
 */
// 화면 초기값(=서비스 기본값, useDeviceSetup DEFAULT_CONFIG와 동일). 저장된 적 없는 키의 변경 판단 기준.
const THEME_DEFAULTS: Record<string, string> = {
  THEME_TEXT_COLOR: "#ffffff",
  THEME_PRIMARY_COLOR: "#6c6fb4",
  THEME_BG_COLOR: "#2a2a2a",
  THEME_BTN_GLOW_ENABLED: "1",
  THEME_BTN_GLOW_COLOR: "#6c6fb4",
  THEME_BTN_GLOW_SIZE: "28",
  THEME_BTN_TEXT_COLOR_CAPTURE: "#2a2a2a",
  THEME_BTN_TEXT_COLOR_NEXT: "#ffffff",
  THEME_BTN_TEXT_COLOR_PAYMENT: "#ffffff",
  THEME_BTN_TEXT_COLOR_PRINT: "#ffffff",
  THEME_BTN_TEXT_COLOR_RESTART: "#ffffff",
};

export function useThemeSettings(deviceId: string | null) {
  const [textColor, setTextColor] = useState("#ffffff");
  const [primaryColor, setPrimaryColor] = useState("#6c6fb4");
  const [bgColor, setBgColor] = useState("#2a2a2a");
  const [glowEnabled, setGlowEnabled] = useState(true);
  const [glowColor, setGlowColor] = useState("#6c6fb4");
  const [glowSize, setGlowSize] = useState(28);
  const [wallpaperLs, setWallpaperLs] = useState<Asset>(null);
  const [wallpaperPt, setWallpaperPt] = useState<Asset>(null);
  const [wallpaperSubLs, setWallpaperSubLs] = useState<Asset>(null);
  const [wallpaperSubPt, setWallpaperSubPt] = useState<Asset>(null);
  const [logo, setLogo] = useState<Asset>(null);
  // 버튼 이미지 — 슬롯 이름(buttonImageName(role, portrait))을 키로 한 맵.
  const [buttonAssets, setButtonAssets] = useState<Record<string, Asset>>({});
  const [buttonBusy, setButtonBusy] = useState<Record<string, boolean>>({});
  const [captureTextColor, setCaptureTextColor] = useState("#2a2a2a");
  const [nextTextColor, setNextTextColor] = useState("#ffffff");
  const [paymentTextColor, setPaymentTextColor] = useState("#ffffff");
  const [printTextColor, setPrintTextColor] = useState("#ffffff");
  const [restartTextColor, setRestartTextColor] = useState("#ffffff");
  const [buttonImageOptions, setButtonImageOptions] = useState<Record<ButtonRole, ButtonImageOptions>>(parseButtonImageOptions({}));
  // 화면별 배경화면·안내 오버레이 — 슬롯이 많아 name(wallpaperPageName / OVERLAY_NAME_CAMERA)을 키로 한 맵으로 관리.
  const [namedAssets, setNamedAssets] = useState<Record<string, Asset>>({});
  const [namedBusy, setNamedBusy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wallpaperLsBusy, setWallpaperLsBusy] = useState(false);
  const [wallpaperPtBusy, setWallpaperPtBusy] = useState(false);
  const [wallpaperSubLsBusy, setWallpaperSubLsBusy] = useState(false);
  const [wallpaperSubPtBusy, setWallpaperSubPtBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [message, setMessage] = useState("");
  // 로드 시점의 실효값(전역←지점). 저장 시 바뀐 키만 지점에 저장하는 기준 — 다른 설정 화면과 같은 규칙.
  const baselineRef = useRef<Record<string, string>>({});

  const flash = (msg: string) => {
    setMessage(msg);
    if (!msg.includes("실패")) setTimeout(() => setMessage(""), 3000);
  };

  // 선택 지점에 연결된(linked) 테마 이미지만 조회 — 지점별 전용.
  // name 지정 시 같은 타입 안에서 해당 이름의 이미지만 고른다(배경화면 가로/세로 슬롯 구분).
  const loadAsset = async (type: number, name?: string): Promise<Asset> => {
    if (!deviceId) return null;
    const res = await fetch(`/api/image/list/${type}/?device_id=${deviceId}&linked=1`, { cache: "no-store" });
    const data = await res.json();
    const list: Array<{ id: number; name: string; filename: string }> = data.images ?? [];
    const first = name ? list.find((i) => i.name === name) : list[0];
    return first && data.baseUrl ? { id: first.id, filename: first.filename, url: `${data.baseUrl}/${first.filename}` } : null;
  };

  // 한 번의 목록 조회로 여러 name 슬롯을 채운다(화면별 배경 14칸을 슬롯마다 따로 조회하지 않도록).
  const loadAssetsByName = async (type: number, names: string[]): Promise<Record<string, Asset>> => {
    if (!deviceId) return {};
    const res = await fetch(`/api/image/list/${type}/?device_id=${deviceId}&linked=1`, { cache: "no-store" });
    const data = await res.json();
    const list: Array<{ id: number; name: string; filename: string }> = data.images ?? [];
    const out: Record<string, Asset> = {};
    for (const name of names) {
      const img = list.find((i) => i.name === name);
      out[name] = img && data.baseUrl ? { id: img.id, filename: img.filename, url: `${data.baseUrl}/${img.filename}` } : null;
    }
    return out;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceId) { setLoading(false); return; }
      setLoading(true);
      try {
        // 색상: 전역 기본값 ← 이 지점 오버라이드 병합
        const [g, d, wpLs, wpPt, wpSubLs, wpSubPt, lg, buttons, named] = await Promise.all([
          fetch("/api/setting/").then((r) => r.json()).catch(() => ({})),
          fetch(`/api/device/${deviceId}/settings/`).then((r) => r.json()).catch(() => ({})),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_LANDSCAPE),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_PORTRAIT),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_SUB_LANDSCAPE),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_SUB_PORTRAIT),
          loadAsset(LOGO_TYPE),
          loadAssetsByName(BUTTON_TYPE, BUTTON_SLOTS),
          loadAssetsByName(WALLPAPER_TYPE, NAMED_WALLPAPER_SLOTS),
        ]);
        if (cancelled) return;
        const s = { ...(g.settings || {}), ...(d.settings || {}) };
        baselineRef.current = s;
        setTextColor(s.THEME_TEXT_COLOR || "#ffffff");
        setPrimaryColor(s.THEME_PRIMARY_COLOR || "#6c6fb4");
        setBgColor(s.THEME_BG_COLOR || "#2a2a2a");
        setGlowEnabled(s.THEME_BTN_GLOW_ENABLED !== "0");
        setGlowColor(s.THEME_BTN_GLOW_COLOR || "#6c6fb4");
        // 0(글로우 번짐 없음)도 유효한 값 — `|| 28`로 쓰면 0이 28로 바뀌어 다음 저장 때 덮어써진다.
        setGlowSize(parseIntSafe(s.THEME_BTN_GLOW_SIZE || "", 28));
        setCaptureTextColor(s.THEME_BTN_TEXT_COLOR_CAPTURE || "#2a2a2a");
        setNextTextColor(s.THEME_BTN_TEXT_COLOR_NEXT || "#ffffff");
        setPaymentTextColor(s.THEME_BTN_TEXT_COLOR_PAYMENT || "#ffffff");
        setPrintTextColor(s.THEME_BTN_TEXT_COLOR_PRINT || "#ffffff");
        setRestartTextColor(s.THEME_BTN_TEXT_COLOR_RESTART || "#ffffff");
        setButtonImageOptions(parseButtonImageOptions(s));
        setNamedAssets(named);
        setWallpaperLs(wpLs);
        setWallpaperPt(wpPt);
        setWallpaperSubLs(wpSubLs);
        setWallpaperSubPt(wpSubPt);
        setLogo(lg);
        setButtonAssets(buttons);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const handleSaveColors = async () => {
    if (!deviceId) { flash("먼저 상단에서 지점을 선택하세요."); return; }
    const colors: Array<[string, string]> = [
      ["글자 색상", textColor], ["강조 색상", primaryColor], ["배경 단색", bgColor], ["글로우 색상", glowColor],
      ["촬영하기 글자색", captureTextColor], ["다음으로 글자색", nextTextColor], ["결제하기 글자색", paymentTextColor],
      ["인쇄하기 글자색", printTextColor], ["처음으로 글자색", restartTextColor],
    ];
    const badColors = colors.filter(([, v]) => !isValidHexColor(v)).map(([label]) => label);
    if (badColors.length > 0) {
      flash(`저장 실패: 색상 코드는 #RRGGBB 형식이어야 합니다 (${badColors.join(", ")})`);
      return;
    }
    const intended: Record<string, string> = {
      THEME_TEXT_COLOR: textColor,
      THEME_PRIMARY_COLOR: primaryColor,
      THEME_BG_COLOR: bgColor,
      THEME_BTN_GLOW_ENABLED: glowEnabled ? "1" : "0",
      THEME_BTN_GLOW_COLOR: glowColor,
      THEME_BTN_GLOW_SIZE: String(glowSize),
      THEME_BTN_TEXT_COLOR_CAPTURE: captureTextColor,
      THEME_BTN_TEXT_COLOR_NEXT: nextTextColor,
      THEME_BTN_TEXT_COLOR_PAYMENT: paymentTextColor,
      THEME_BTN_TEXT_COLOR_PRINT: printTextColor,
      THEME_BTN_TEXT_COLOR_RESTART: restartTextColor,
      ...Object.fromEntries(BUTTON_ROLES.flatMap((role) => {
        const k = buttonImageOptionKeys(role);
        const o = buttonImageOptions[role];
        return [[k.hideText, o.hideText ? "1" : "0"]];
      })),
    };
    // 바뀐 키만 지점에 저장한다 — 매번 전부 저장하면 건드리지 않은 값까지 지점 설정으로 굳어 전역 기본값 변경이 안 따라온다.
    // 기준값이 없는(저장된 적 없는) 키는 화면에 보인 기본값과 같아도 서비스 기본값과 같으므로 건너뛴다.
    const DEFAULTS = parseButtonImageOptions({});
    const defaultFor = (k: string): string | undefined => {
      const role = BUTTON_ROLES.find((r) => buttonImageOptionKeys(r).hideText === k);
      if (role) return DEFAULTS[role].hideText ? "1" : "0";
      return THEME_DEFAULTS[k];
    };
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(intended)) {
      const base = baselineRef.current[k] ?? defaultFor(k);
      if (v !== base) payload[k] = v;
    }
    if (Object.keys(payload).length === 0) { flash("변경사항이 없습니다."); return; }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/device/${deviceId}/settings/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) Object.assign(baselineRef.current, payload);
      flash(res.ok ? "설정이 저장되었습니다." : "저장 실패");
    } catch {
      flash("서버 연결 실패");
    } finally {
      setSaving(false);
    }
  };

  // 단일 이미지 애셋 업로드(한 장만 유지) / 제거 — 배경화면·로고 공통.
  // 새 이미지 업로드가 성공한 뒤에 기존 이미지를 지운다 — 먼저 지우면 업로드 실패 시 기존 이미지까지 잃는다.
  const uploadAsset = (
    type: number,
    name: string,
    current: Asset,
    setCurrent: (a: Asset) => void,
    setBusy: (b: boolean) => void,
  ) => async (file: File) => {
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", name);
      form.append("imageType", String(type));
      form.append("deviceIds", JSON.stringify(deviceId ? [deviceId] : [])); // 이 지점 전용
      const res = await fetch("/api/admin/images/upload/", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        flash(`업로드 실패: ${err.error || res.status}`);
        return;
      }
      // 같은 name 슬롯에 잠시 두 장이 공존하지만 목록이 최신순이라 loadAsset은 새 이미지를 고른다.
      if (current) {
        await fetch(`/api/admin/images/${current.id}/`, { method: "DELETE" }).catch(() => {});
      }
      setCurrent(await loadAsset(type, name));
      flash("업로드되었습니다.");
    } catch {
      flash("업로드 실패: 서버 연결 오류");
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = (
    current: Asset,
    setCurrent: (a: Asset) => void,
    setBusy: (b: boolean) => void,
  ) => async () => {
    if (!current) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/images/${current.id}/`, { method: "DELETE" });
      if (res.ok) {
        setCurrent(null);
        flash("제거되었습니다.");
      } else {
        flash("제거 실패");
      }
    } catch {
      flash("제거 실패: 서버 연결 오류");
    } finally {
      setBusy(false);
    }
  };

  const setButtonImageOption = (role: ButtonRole, key: keyof ButtonImageOptions, value: boolean) =>
    setButtonImageOptions((prev) => ({ ...prev, [role]: { ...prev[role], [key]: value } }));

  // name 키 맵 슬롯용 업로드/제거 — 기존 uploadAsset/removeAsset을 맵 setter로 감싼다.
  const setNamedAsset = (name: string) => (a: Asset) => setNamedAssets((prev) => ({ ...prev, [name]: a }));
  const setNamedBusyFor = (name: string) => (b: boolean) => setNamedBusy((prev) => ({ ...prev, [name]: b }));
  const uploadNamed = (name: string) =>
    uploadAsset(WALLPAPER_TYPE, name, namedAssets[name] ?? null, setNamedAsset(name), setNamedBusyFor(name));
  const removeNamed = (name: string) =>
    removeAsset(namedAssets[name] ?? null, setNamedAsset(name), setNamedBusyFor(name));

  // 버튼 이미지 슬롯(role × 가로/세로)용 업로드/제거.
  const setButtonAsset = (name: string) => (a: Asset) => setButtonAssets((prev) => ({ ...prev, [name]: a }));
  const setButtonBusyFor = (name: string) => (b: boolean) => setButtonBusy((prev) => ({ ...prev, [name]: b }));
  const uploadButton = (role: ButtonRole) => (portrait: boolean) => {
    const name = buttonImageName(role, portrait);
    return uploadAsset(BUTTON_TYPE, name, buttonAssets[name] ?? null, setButtonAsset(name), setButtonBusyFor(name));
  };
  const removeButton = (role: ButtonRole) => (portrait: boolean) => {
    const name = buttonImageName(role, portrait);
    return removeAsset(buttonAssets[name] ?? null, setButtonAsset(name), setButtonBusyFor(name));
  };
  const buttonSlot = (role: ButtonRole) => ({
    landscape: buttonAssets[buttonImageName(role, false)] ?? null,
    portrait: buttonAssets[buttonImageName(role, true)] ?? null,
    busy: {
      landscape: !!buttonBusy[buttonImageName(role, false)],
      portrait: !!buttonBusy[buttonImageName(role, true)],
    },
  });

  return {
    textColor, setTextColor,
    primaryColor, setPrimaryColor,
    bgColor, setBgColor,
    glowEnabled, setGlowEnabled,
    glowColor, setGlowColor,
    glowSize, setGlowSize,
    wallpaperLs, wallpaperLsBusy,
    wallpaperPt, wallpaperPtBusy,
    wallpaperSubLs, wallpaperSubLsBusy,
    wallpaperSubPt, wallpaperSubPtBusy,
    logo, logoBusy,
    captureTextColor, setCaptureTextColor,
    nextTextColor, setNextTextColor,
    paymentTextColor, setPaymentTextColor,
    printTextColor, setPrintTextColor,
    restartTextColor, setRestartTextColor,
    loading, saving, message,
    handleSaveColors,
    uploadAsset, removeAsset,
    setWallpaperLsBusy, setWallpaperPtBusy, setLogoBusy,
    setWallpaperSubLsBusy, setWallpaperSubPtBusy,
    setWallpaperLs, setWallpaperPt, setLogo,
    setWallpaperSubLs, setWallpaperSubPt,
    WALLPAPER_TYPE, LOGO_TYPE, BUTTON_TYPE,
    buttonImageOptions, setButtonImageOption,
    namedAssets, namedBusy, uploadNamed, removeNamed,
    buttonSlot, uploadButton, removeButton,
  };
}
