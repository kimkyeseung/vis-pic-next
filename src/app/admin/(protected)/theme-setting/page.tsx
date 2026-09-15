"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useAdmin } from "@/app/admin/AdminContext";
import { WALLPAPER_NAME_LANDSCAPE, WALLPAPER_NAME_PORTRAIT, BUTTON_NAME_CAPTURE, BUTTON_NAME_NEXT, BUTTON_NAME_PAYMENT } from "@/constants/images";

const WALLPAPER_TYPE = 5;
const LOGO_TYPE = 6;
const BUTTON_TYPE = 7;

type Asset = { id: number; url: string; filename: string } | null;

// 단일 이미지 애셋(배경화면/로고) 업로드·미리보기·제거 카드
function AssetUploader({
  title,
  description,
  asset,
  onUpload,
  onRemove,
  busy,
  previewClass,
  imageFit,
  emptyLabel,
}: {
  title: string;
  description: string;
  asset: Asset;
  onUpload: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
  previewClass: string;
  imageFit: "cover" | "contain";
  emptyLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-6 pt-5 pb-6">
        <h3 className="text-white font-semibold text-base mb-1">{title}</h3>
        <p className="text-gray-500 text-xs mb-4">{description}</p>
        <div className="flex items-start gap-5">
          <div className={`rounded-lg border border-gray-600 overflow-hidden bg-[#2a2a2a] flex items-center justify-center shrink-0 ${previewClass}`}>
            {asset ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.url} alt={title} className={`w-full h-full object-${imageFit}`} />
            ) : (
              <span className="text-gray-500 text-sm px-2 text-center">{emptyLabel}</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {busy ? "처리 중..." : asset ? "이미지 변경" : "이미지 업로드"}
            </button>
            {asset && (
              <button
                onClick={onRemove}
                disabled={busy}
                className="px-5 py-2.5 bg-gray-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                제거 (기본값 사용)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 버튼 이미지 업로드 + 텍스트 색상을 한 행에 묶은 카드 내부 섹션 (촬영하기/다음으로/결제하기 공용)
function ButtonThemeRow({
  title,
  description,
  asset,
  onUpload,
  onRemove,
  busy,
  textColor,
  onTextColorChange,
}: {
  title: string;
  description: string;
  asset: Asset;
  onUpload: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
  textColor: string;
  onTextColorChange: (c: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="px-6 py-5">
      <h4 className="text-white font-semibold text-sm mb-1">{title}</h4>
      <p className="text-gray-500 text-xs mb-4">{description}</p>
      <div className="flex items-start gap-5 mb-4">
        <div className="w-64 h-24 rounded-lg border border-gray-600 overflow-hidden bg-[#2a2a2a] flex items-center justify-center shrink-0">
          {asset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.url} alt={title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm px-2 text-center font-bold" style={{ color: textColor }}>{title}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {busy ? "처리 중..." : asset ? "이미지 변경" : "이미지 업로드"}
          </button>
          {asset && (
            <button
              onClick={onRemove}
              disabled={busy}
              className="px-5 py-2.5 bg-gray-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              제거 (기본값 사용)
            </button>
          )}
        </div>
      </div>
      <ColorRow color={textColor} onChange={onTextColorChange}>
        <span className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2a2a2a] border border-gray-600" style={{ color: textColor }}>
          텍스트 색상 미리보기
        </span>
      </ColorRow>
    </div>
  );
}

// 색상 선택 행 (스와치 + 팝오버 피커 + hex 입력)
function ColorRow({
  color,
  onChange,
  children,
}: {
  color: string;
  onChange: (c: string) => void;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-11 h-11 rounded-lg border border-gray-600"
          style={{ background: color }}
          aria-label="색상 선택"
        />
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute top-full left-0 mt-2 z-20 p-3 bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
              <HexColorPicker color={color} onChange={onChange} />
            </div>
          </>
        )}
      </div>
      <input
        type="text"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 w-32 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
        placeholder="#000000"
      />
      {children}
    </div>
  );
}

export default function ThemeSettingPage() {
  const { selectedDevice } = useAdmin();
  const deviceId = selectedDevice?.deviceId ?? null;
  const [textColor, setTextColor] = useState("#ffffff");
  const [primaryColor, setPrimaryColor] = useState("#6c6fb4");
  const [bgColor, setBgColor] = useState("#2a2a2a");
  const [glowEnabled, setGlowEnabled] = useState(true);
  const [glowColor, setGlowColor] = useState("#6c6fb4");
  const [glowSize, setGlowSize] = useState(28);
  const [wallpaperLs, setWallpaperLs] = useState<Asset>(null);
  const [wallpaperPt, setWallpaperPt] = useState<Asset>(null);
  const [logo, setLogo] = useState<Asset>(null);
  const [captureButtonImage, setCaptureButtonImage] = useState<Asset>(null);
  const [nextButtonImage, setNextButtonImage] = useState<Asset>(null);
  const [paymentButtonImage, setPaymentButtonImage] = useState<Asset>(null);
  const [captureTextColor, setCaptureTextColor] = useState("#2a2a2a");
  const [nextTextColor, setNextTextColor] = useState("#ffffff");
  const [paymentTextColor, setPaymentTextColor] = useState("#ffffff");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wallpaperLsBusy, setWallpaperLsBusy] = useState(false);
  const [wallpaperPtBusy, setWallpaperPtBusy] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceId) { setLoading(false); return; }
      setLoading(true);
      try {
        // 색상: 전역 기본값 ← 이 지점 오버라이드 병합
        const [g, d, wpLs, wpPt, lg, btnCapture, btnNext, btnPayment] = await Promise.all([
          fetch("/api/setting/").then((r) => r.json()).catch(() => ({})),
          fetch(`/api/device/${deviceId}/settings/`).then((r) => r.json()).catch(() => ({})),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_LANDSCAPE),
          loadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_PORTRAIT),
          loadAsset(LOGO_TYPE),
          loadAsset(BUTTON_TYPE, BUTTON_NAME_CAPTURE),
          loadAsset(BUTTON_TYPE, BUTTON_NAME_NEXT),
          loadAsset(BUTTON_TYPE, BUTTON_NAME_PAYMENT),
        ]);
        if (cancelled) return;
        const s = { ...(g.settings || {}), ...(d.settings || {}) };
        setTextColor(s.THEME_TEXT_COLOR || "#ffffff");
        setPrimaryColor(s.THEME_PRIMARY_COLOR || "#6c6fb4");
        setBgColor(s.THEME_BG_COLOR || "#2a2a2a");
        setGlowEnabled(s.THEME_BTN_GLOW_ENABLED !== "0");
        setGlowColor(s.THEME_BTN_GLOW_COLOR || "#6c6fb4");
        setGlowSize(parseInt(s.THEME_BTN_GLOW_SIZE || "", 10) || 28);
        setCaptureTextColor(s.THEME_BTN_TEXT_COLOR_CAPTURE || "#2a2a2a");
        setNextTextColor(s.THEME_BTN_TEXT_COLOR_NEXT || "#ffffff");
        setPaymentTextColor(s.THEME_BTN_TEXT_COLOR_PAYMENT || "#ffffff");
        setWallpaperLs(wpLs);
        setWallpaperPt(wpPt);
        setLogo(lg);
        setCaptureButtonImage(btnCapture);
        setNextButtonImage(btnNext);
        setPaymentButtonImage(btnPayment);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
        }),
      });
      flash(res.ok ? "색상이 저장되었습니다." : "저장 실패");
    } catch {
      flash("서버 연결 실패");
    } finally {
      setSaving(false);
    }
  };

  // 단일 이미지 애셋 업로드(한 장만 유지) / 제거 — 배경화면·로고 공통
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
      if (current) {
        await fetch(`/api/admin/images/${current.id}/`, { method: "DELETE" }).catch(() => {});
      }
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

  if (loading) return <div className="text-gray-400">로딩중...</div>;
  if (!selectedDevice) return <div className="p-8 bg-gray-800 rounded-xl text-center text-gray-400">상단에서 지점을 선택하세요.</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">테마 관리</h2>
        <p className="mt-1 text-sm text-gray-500">
          <span className="text-white font-medium">{selectedDevice.name}</span> 지점 테마입니다. (배경화면·로고·버튼 이미지·색상)
        </p>
      </div>

      <AssetUploader
        title="배경화면 · 가로 화면용 (첫 화면 전용)"
        description="가로(landscape) 키오스크의 대기(첫) 화면에만 깔리는 배경입니다. 이후 단계 화면은 아래 '배경 단색'이 사용됩니다. 미설정 시 세로용 이미지가 있으면 그걸, 없으면 배경 단색이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)"
        asset={wallpaperLs}
        onUpload={uploadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_LANDSCAPE, wallpaperLs, setWallpaperLs, setWallpaperLsBusy)}
        onRemove={removeAsset(wallpaperLs, setWallpaperLs, setWallpaperLsBusy)}
        busy={wallpaperLsBusy}
        previewClass="w-64 aspect-video"
        imageFit="cover"
        emptyLabel="기본 배경 (#2a2a2a)"
      />

      <AssetUploader
        title="배경화면 · 세로 화면용 (첫 화면 전용)"
        description="세로(portrait) 키오스크의 대기(첫) 화면에만 깔리는 배경입니다. 화면 방향에 맞춰 가로/세로 이미지가 자동으로 선택됩니다. 미설정 시 가로용 이미지가 있으면 그걸, 없으면 배경 단색이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)"
        asset={wallpaperPt}
        onUpload={uploadAsset(WALLPAPER_TYPE, WALLPAPER_NAME_PORTRAIT, wallpaperPt, setWallpaperPt, setWallpaperPtBusy)}
        onRemove={removeAsset(wallpaperPt, setWallpaperPt, setWallpaperPtBusy)}
        busy={wallpaperPtBusy}
        previewClass="w-40 aspect-[9/16]"
        imageFit="cover"
        emptyLabel="기본 배경 (#2a2a2a)"
      />

      <AssetUploader
        title="로고"
        description="첫(대기) 화면을 제외한 서비스 화면 좌측 상단에 표시되는 로고입니다. 배경 위에 얹히므로 투명 배경 PNG를 권장합니다. 미설정 시 기본 로고(AR-pic)가 사용됩니다."
        asset={logo}
        onUpload={uploadAsset(LOGO_TYPE, "logo", logo, setLogo, setLogoBusy)}
        onRemove={removeAsset(logo, setLogo, setLogoBusy)}
        busy={logoBusy}
        previewClass="w-64 h-28 p-3"
        imageFit="contain"
        emptyLabel="기본 로고 (AR-pic)"
      />

      {/* 버튼 이미지 · 텍스트 색상 (촬영하기/다음으로/결제하기 통합) */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
        <div className="px-6 pt-5 pb-1">
          <h3 className="text-white font-semibold text-base">버튼 이미지 · 텍스트 색상</h3>
          <p className="text-gray-500 text-xs mt-1">
            촬영·다음·결제 버튼의 배경 이미지와 글자 색상입니다. 이미지는 버튼 비율(가로로 넓은 사각형)에 맞춰 꽉 채워지므로(cover) 좌우로 넉넉한 이미지를 권장합니다. 미설정 시 기본 단색 버튼이 사용됩니다.
          </p>
        </div>

        <ButtonThemeRow
          title="촬영하기"
          description="촬영 화면의 '촬영하기' 버튼."
          asset={captureButtonImage}
          onUpload={uploadAsset(BUTTON_TYPE, BUTTON_NAME_CAPTURE, captureButtonImage, setCaptureButtonImage, setCaptureButtonImageBusy)}
          onRemove={removeAsset(captureButtonImage, setCaptureButtonImage, setCaptureButtonImageBusy)}
          busy={captureButtonImageBusy}
          textColor={captureTextColor}
          onTextColorChange={setCaptureTextColor}
        />

        <ButtonThemeRow
          title="다음으로"
          description="각 단계 화면의 '다음으로' 버튼."
          asset={nextButtonImage}
          onUpload={uploadAsset(BUTTON_TYPE, BUTTON_NAME_NEXT, nextButtonImage, setNextButtonImage, setNextButtonImageBusy)}
          onRemove={removeAsset(nextButtonImage, setNextButtonImage, setNextButtonImageBusy)}
          busy={nextButtonImageBusy}
          textColor={nextTextColor}
          onTextColorChange={setNextTextColor}
        />

        <ButtonThemeRow
          title="결제하기"
          description="결제 화면의 '결제하기' 버튼."
          asset={paymentButtonImage}
          onUpload={uploadAsset(BUTTON_TYPE, BUTTON_NAME_PAYMENT, paymentButtonImage, setPaymentButtonImage, setPaymentButtonImageBusy)}
          onRemove={removeAsset(paymentButtonImage, setPaymentButtonImage, setPaymentButtonImageBusy)}
          busy={paymentButtonImageBusy}
          textColor={paymentTextColor}
          onTextColorChange={setPaymentTextColor}
        />
      </div>

      {/* 배경 단색 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">배경 단색</h3>
          <p className="text-gray-500 text-xs mb-4">
            첫(대기) 화면을 제외한 나머지 서비스 화면 전체 배경으로 쓰이는 단색입니다. 배경화면 이미지를 설정하지 않으면 첫 화면에도 이 색이 사용됩니다.
          </p>
          <ColorRow color={bgColor} onChange={setBgColor}>
            <span
              className="w-24 h-10 rounded-lg border border-gray-600 ml-2"
              style={{ background: bgColor }}
            />
          </ColorRow>
        </div>
      </div>

      {/* Primary 컬러 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">강조(Primary) 색상</h3>
          <p className="text-gray-500 text-xs mb-4">
            선택 강조(카드 테두리·체크 표시)와 주요 버튼에 쓰이는 포인트 색상입니다.
          </p>
          <ColorRow color={primaryColor} onChange={setPrimaryColor}>
            <div className="flex items-center gap-3 ml-2">
              <span
                className="w-24 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: primaryColor }}
              >
                버튼
              </span>
              <span
                className="w-16 h-10 rounded-lg bg-[#2a2a2a] border-[3px]"
                style={{ borderColor: primaryColor }}
              />
            </div>
          </ColorRow>
        </div>
      </div>

      {/* 글자 색상 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">글자 색상</h3>
          <p className="text-gray-500 text-xs mb-4">
            서비스 화면 텍스트의 기본 색상입니다. 배경화면 위에서 글자가 잘 보이도록 조정하세요.
          </p>
          <ColorRow color={textColor} onChange={setTextColor}>
            <div
              className="px-4 py-2 rounded-lg text-sm border border-gray-600 ml-2"
              style={{ background: bgColor, color: textColor }}
            >
              미리보기 텍스트
            </div>
          </ColorRow>
        </div>
      </div>

      {/* 버튼 글로우 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700">
        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-white font-semibold text-base">버튼 글로우</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-gray-400 text-sm">{glowEnabled ? "켜짐" : "꺼짐"}</span>
              <div
                className={`relative w-11 h-6 rounded-full transition-colors ${glowEnabled ? "bg-blue-500" : "bg-gray-600"}`}
                onClick={() => setGlowEnabled((v) => !v)}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${glowEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </div>
            </label>
          </div>
          <p className="text-gray-500 text-xs mb-4">
            서비스 화면 버튼을 누를 때(터치) 외곽에 나타나는 글로우 효과입니다.
          </p>
          {glowEnabled && (
            <div className="space-y-4">
              <ColorRow color={glowColor} onChange={setGlowColor}>
                <span className="text-gray-400 text-xs ml-2">글로우 색상</span>
              </ColorRow>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">세기 (번짐)</span>
                  <span className="text-gray-300 text-sm font-mono">{glowSize}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={glowSize}
                  onChange={(e) => setGlowSize(parseInt(e.target.value, 10) || 0)}
                  className="w-full accent-blue-500"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <span className="text-gray-400 text-xs">미리보기</span>
                <span
                  className="px-6 py-3 rounded-xl text-white font-bold"
                  style={{ background: primaryColor, boxShadow: `0 0 ${glowSize}px 6px ${glowColor}` }}
                >
                  버튼
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-[#2a2a2a]">
        <button
          onClick={handleSaveColors}
          disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "색상 저장"}
        </button>
        <span className="ml-3 text-gray-500 text-xs">배경화면·로고는 업로드 즉시 반영됩니다.</span>
      </div>
    </div>
  );
}
