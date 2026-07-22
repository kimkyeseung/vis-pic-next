"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

const WALLPAPER_TYPE = 5;

type Wallpaper = { id: number; url: string; filename: string };

export default function ThemeSettingPage() {
  const [textColor, setTextColor] = useState("#ffffff");
  const [wallpaper, setWallpaper] = useState<Wallpaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setMessage(msg);
    if (!msg.includes("실패")) setTimeout(() => setMessage(""), 3000);
  };

  const loadWallpaper = async () => {
    const res = await fetch(`/api/image/list/${WALLPAPER_TYPE}/`, { cache: "no-store" });
    const data = await res.json();
    const first = data.images?.[0];
    setWallpaper(first && data.baseUrl ? { id: first.id, filename: first.filename, url: `${data.baseUrl}/${first.filename}` } : null);
  };

  useEffect(() => {
    (async () => {
      try {
        const [settingRes] = await Promise.all([
          fetch("/api/setting/").then((r) => r.json()).catch(() => ({})),
          loadWallpaper(),
        ]);
        if (settingRes?.settings?.THEME_TEXT_COLOR) setTextColor(settingRes.settings.THEME_TEXT_COLOR);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveColor = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/setting/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ THEME_TEXT_COLOR: textColor }),
      });
      flash(res.ok ? "글자 색상이 저장되었습니다." : "저장 실패");
    } catch {
      flash("서버 연결 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setMessage("");
    try {
      // 배경화면은 한 장만 유지 — 새로 올리기 전 기존 항목 제거
      if (wallpaper) {
        await fetch(`/api/admin/images/${wallpaper.id}/`, { method: "DELETE" }).catch(() => {});
      }
      const form = new FormData();
      form.append("file", file);
      form.append("name", "wallpaper");
      form.append("imageType", String(WALLPAPER_TYPE));
      form.append("deviceIds", "[]"); // 모든 디바이스에 적용
      const res = await fetch("/api/admin/images/upload/", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        flash(`업로드 실패: ${err.error || res.status}`);
        return;
      }
      await loadWallpaper();
      flash("배경화면이 업로드되었습니다.");
    } catch {
      flash("업로드 실패: 서버 연결 오류");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!wallpaper) return;
    setUploading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/images/${wallpaper.id}/`, { method: "DELETE" });
      if (res.ok) {
        setWallpaper(null);
        flash("배경화면이 제거되었습니다.");
      } else {
        flash("제거 실패");
      }
    } catch {
      flash("제거 실패: 서버 연결 오류");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="text-gray-400">로딩중...</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">테마 관리</h2>
      </div>

      {/* 배경화면 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">배경화면</h3>
          <p className="text-gray-500 text-xs mb-4">
            키오스크 서비스 화면 전체에 깔리는 배경 이미지입니다. 미설정 시 기본 짙은 회색이 사용됩니다. (jpg/png/webp/gif, 최대 50MB)
          </p>

          <div className="flex items-start gap-5">
            <div className="w-64 aspect-video rounded-lg border border-gray-600 overflow-hidden bg-[#2a2a2a] flex items-center justify-center shrink-0">
              {wallpaper ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wallpaper.url} alt="배경화면" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-500 text-sm">기본 배경 (#2a2a2a)</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading ? "처리 중..." : wallpaper ? "이미지 변경" : "이미지 업로드"}
              </button>
              {wallpaper && (
                <button
                  onClick={handleRemove}
                  disabled={uploading}
                  className="px-5 py-2.5 bg-gray-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  기본 배경으로 되돌리기
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 글자 색상 */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-6 pt-5 pb-6">
          <h3 className="text-white font-semibold text-base mb-1">글자 색상</h3>
          <p className="text-gray-500 text-xs mb-4">
            서비스 화면 텍스트의 기본 색상입니다. 배경화면 위에서 글자가 잘 보이도록 조정하세요.
          </p>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setColorPickerOpen((v) => !v)}
                className="w-11 h-11 rounded-lg border border-gray-600"
                style={{ background: textColor }}
                aria-label="색상 선택"
              />
              {colorPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColorPickerOpen(false)} />
                  <div className="absolute top-full left-0 mt-2 z-20 p-3 bg-gray-800 border border-gray-600 rounded-xl shadow-xl">
                    <HexColorPicker color={textColor} onChange={setTextColor} />
                  </div>
                </>
              )}
            </div>
            <input
              type="text"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="px-3 py-2 w-32 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
              placeholder="#ffffff"
            />
            <div
              className="px-4 py-2 rounded-lg text-sm border border-gray-600"
              style={{ background: wallpaper ? "transparent" : "#2a2a2a", color: textColor }}
            >
              미리보기 텍스트
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.includes("실패") ? "bg-red-900/50 border border-red-500 text-red-300" : "bg-green-900/50 border border-green-500 text-green-300"}`}>
          {message}
        </div>
      )}

      <div className="sticky bottom-0 py-4 bg-[#2a2a2a]">
        <button
          onClick={handleSaveColor}
          disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "저장 중..." : "글자 색상 저장"}
        </button>
        <span className="ml-3 text-gray-500 text-xs">배경화면은 업로드 즉시 반영됩니다.</span>
      </div>
    </div>
  );
}
