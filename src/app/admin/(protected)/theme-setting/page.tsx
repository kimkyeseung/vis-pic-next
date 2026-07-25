"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useAdmin } from "@/app/admin/AdminContext";

const WALLPAPER_TYPE = 5;
const LOGO_TYPE = 6;

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
  const [wallpaper, setWallpaper] = useState<Asset>(null);
  const [logo, setLogo] = useState<Asset>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [message, setMessage] = useState("");

  const flash = (msg: string) => {
    setMessage(msg);
    if (!msg.includes("실패")) setTimeout(() => setMessage(""), 3000);
  };

  // 선택 지점에 연결된(linked) 테마 이미지만 조회 — 지점별 전용
  const loadAsset = async (type: number): Promise<Asset> => {
    if (!deviceId) return null;
    const res = await fetch(`/api/image/list/${type}/?device_id=${deviceId}&linked=1`, { cache: "no-store" });
    const data = await res.json();
    const first = data.images?.[0];
    return first && data.baseUrl ? { id: first.id, filename: first.filename, url: `${data.baseUrl}/${first.filename}` } : null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceId) { setLoading(false); return; }
      setLoading(true);
      try {
        // 색상: 전역 기본값 ← 이 지점 오버라이드 병합
        const [g, d, wp, lg] = await Promise.all([
          fetch("/api/setting/").then((r) => r.json()).catch(() => ({})),
          fetch(`/api/device/${deviceId}/settings/`).then((r) => r.json()).catch(() => ({})),
          loadAsset(WALLPAPER_TYPE),
          loadAsset(LOGO_TYPE),
        ]);
        if (cancelled) return;
        const s = { ...(g.settings || {}), ...(d.settings || {}) };
        setTextColor(s.THEME_TEXT_COLOR || "#ffffff");
        setPrimaryColor(s.THEME_PRIMARY_COLOR || "#6c6fb4");
        setWallpaper(wp);
        setLogo(lg);
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
        body: JSON.stringify({ THEME_TEXT_COLOR: textColor, THEME_PRIMARY_COLOR: primaryColor }),
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
      setCurrent(await loadAsset(type));
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
          <span className="text-white font-medium">{selectedDevice.name}</span> 지점 테마입니다. (배경화면·로고·색상)
        </p>
      </div>

      <AssetUploader
        title="배경화면"
        description="키오스크 서비스 화면 전체에 깔리는 배경 이미지입니다. 미설정 시 기본 짙은 회색이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)"
        asset={wallpaper}
        onUpload={uploadAsset(WALLPAPER_TYPE, "wallpaper", wallpaper, setWallpaper, setWallpaperBusy)}
        onRemove={removeAsset(wallpaper, setWallpaper, setWallpaperBusy)}
        busy={wallpaperBusy}
        previewClass="w-64 aspect-video"
        imageFit="cover"
        emptyLabel="기본 배경 (#2a2a2a)"
      />

      <AssetUploader
        title="로고"
        description="서비스 화면에 표시되는 로고입니다. 배경 위에 얹히므로 투명 배경 PNG를 권장합니다. 미설정 시 기본 로고(AR-pic)가 사용됩니다."
        asset={logo}
        onUpload={uploadAsset(LOGO_TYPE, "logo", logo, setLogo, setLogoBusy)}
        onRemove={removeAsset(logo, setLogo, setLogoBusy)}
        busy={logoBusy}
        previewClass="w-64 h-28 p-3"
        imageFit="contain"
        emptyLabel="기본 로고 (AR-pic)"
      />

      {/* Primary 컬러 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
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
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">글자 색상</h3>
          <p className="text-gray-500 text-xs mb-4">
            서비스 화면 텍스트의 기본 색상입니다. 배경화면 위에서 글자가 잘 보이도록 조정하세요.
          </p>
          <ColorRow color={textColor} onChange={setTextColor}>
            <div
              className="px-4 py-2 rounded-lg text-sm border border-gray-600 ml-2"
              style={{ background: wallpaper ? "transparent" : "#2a2a2a", color: textColor }}
            >
              미리보기 텍스트
            </div>
          </ColorRow>
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
