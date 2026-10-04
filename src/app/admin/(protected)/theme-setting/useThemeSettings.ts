"use client";

import { useEffect, useState } from "react";
import {
  WALLPAPER_NAME_LANDSCAPE,
  WALLPAPER_NAME_PORTRAIT,
  WALLPAPER_NAME_SUB_LANDSCAPE,
  WALLPAPER_NAME_SUB_PORTRAIT,
  BUTTON_NAME_CAPTURE,
  BUTTON_NAME_NEXT,
  BUTTON_NAME_PAYMENT,
  WALLPAPER_PAGE_STEPS,
  wallpaperPageName,
  OVERLAY_NAME_CAMERA,
} from "@/constants/images";
import { BUTTON_ROLES, buttonImageOptionKeys, parseButtonImageOptions, parseIntSafe } from "@/lib/deviceConfig";
import type { ButtonImageOptions, ButtonRole } from "@/types";
import type { Asset } from "./AssetUploader";

const WALLPAPER_TYPE = 5;
const LOGO_TYPE = 6;
const BUTTON_TYPE = 7;
// imageType 5 안에서 name 맵으로 관리하는 슬롯 — 화면별 배경(가로/세로) + 촬영 화면 안내 오버레이.
const NAMED_WALLPAPER_SLOTS = [
  ...WALLPAPER_PAGE_STEPS.flatMap(({ step }) => [wallpaperPageName(step, false), wallpaperPageName(step, true)]),
  OVERLAY_NAME_CAMERA,
];

/**
 * 테마 관리 페이지의 데이터 계층 — 색상 설정 로드/저장, 배경화면·로고·버튼 이미지 애셋의
 * 업로드/제거를 전부 담당한다. JSX는 이 훅이 반환하는 값을 `AssetUploader`/`ButtonThemeRow`/
 * `ColorRow`에 그대로 꽂기만 하면 된다.
 */
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
  const [captureButtonImage, setCaptureButtonImage] = useState<Asset>(null);
  const [nextButtonImage, setNextButtonImage] = useState<Asset>(null);
  const [paymentButtonImage, setPaymentButtonImage] = useState<Asset>(null);
  const [captureTextColor, setCaptureTextColor] = useState("#2a2a2a");
  const [nextTextColor, setNextTextColor] = useState("#ffffff");
  const [paymentTextColor, setPaymentTextColor] = useState("#ffffff");
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
  const [captureButtonImageBusy, setCaptureButtonImageBusy] = useState(false);
  const [nextButtonImageBusy, setNextButtonImageBusy] = useState(false);
  const [paymentButtonImageBusy, setPaymentButtonImageBusy] = useState(false);
  const [message, setMessage] = useState("");

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
        const [g, d, wpLs, wpPt, wpSubLs, wpSubPt, lg, btnCapture, btnNext, btnPayment, named] = await Promise.all([
          fetch("/api/setting/").then((r) => r.json()).catch(() => ({})),
          fetch(`/api/device/${deviceId}/settings/`).then((r) => r.json()).catch(() => ({})),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_LANDSCAPE),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_PORTRAIT),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_SUB_LANDSCAPE),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_SUB_PORTRAIT),
          loadAsset(LOGO_TYPE),
          loadAsset(BUTTON_TYPE, BUTTON_NAME_CAPTURE),
          loadAsset(BUTTON_TYPE, BUTTON_NAME_NEXT),
          loadAsset(BUTTON_TYPE, BUTTON_NAME_PAYMENT),
          loadAssetsByName(WALLPAPER_TYPE, NAMED_WALLPAPER_SLOTS),
        ]);
        if (cancelled) return;
        const s = { ...(g.settings || {}), ...(d.settings || {}) };
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
        setButtonImageOptions(parseButtonImageOptions(s));
        setNamedAssets(named);
        setWallpaperLs(wpLs);
        setWallpaperPt(wpPt);
        setWallpaperSubLs(wpSubLs);
        setWallpaperSubPt(wpSubPt);
        setLogo(lg);
        setCaptureButtonImage(btnCapture);
        setNextButtonImage(btnNext);
        setPaymentButtonImage(btnPayment);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const handleSaveColors = async () => {
    if (!deviceId) { flash("먼저 상단에서 지점을 선택하세요."); return; }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/device/${deviceId}/settings/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          THEME_TEXT_COLOR: textColor,
          THEME_PRIMARY_COLOR: primaryColor,
          THEME_BG_COLOR: bgColor,
          THEME_BTN_GLOW_ENABLED: glowEnabled ? "1" : "0",
          THEME_BTN_GLOW_COLOR: glowColor,
          THEME_BTN_GLOW_SIZE: String(glowSize),
          THEME_BTN_TEXT_COLOR_CAPTURE: captureTextColor,
          THEME_BTN_TEXT_COLOR_NEXT: nextTextColor,
          THEME_BTN_TEXT_COLOR_PAYMENT: paymentTextColor,
          ...Object.fromEntries(BUTTON_ROLES.flatMap((role) => {
            const k = buttonImageOptionKeys(role);
            const o = buttonImageOptions[role];
            return [[k.imageOnly, o.imageOnly ? "1" : "0"], [k.hideText, o.hideText ? "1" : "0"]];
          })),
        }),
      });
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
    captureButtonImage, captureButtonImageBusy,
    nextButtonImage, nextButtonImageBusy,
    paymentButtonImage, paymentButtonImageBusy,
    captureTextColor, setCaptureTextColor,
    nextTextColor, setNextTextColor,
    paymentTextColor, setPaymentTextColor,
    loading, saving, message,
    handleSaveColors,
    uploadAsset, removeAsset,
    setWallpaperLsBusy, setWallpaperPtBusy, setLogoBusy,
    setWallpaperSubLsBusy, setWallpaperSubPtBusy,
    setCaptureButtonImageBusy, setNextButtonImageBusy, setPaymentButtonImageBusy,
    setWallpaperLs, setWallpaperPt, setLogo,
    setWallpaperSubLs, setWallpaperSubPt,
    setCaptureButtonImage, setNextButtonImage, setPaymentButtonImage,
    WALLPAPER_TYPE, LOGO_TYPE, BUTTON_TYPE,
    buttonImageOptions, setButtonImageOption,
    namedAssets, namedBusy, uploadNamed, removeNamed,
  };
}
