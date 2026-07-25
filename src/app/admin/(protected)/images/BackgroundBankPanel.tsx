"use client";

import { useEffect, useRef, useState } from "react";
import { BACKGROUND_IMAGE_TYPE, MAX_ACTIVE_BACKGROUNDS } from "@/constants/images";

interface Bg {
  id: number;
  name: string;
  filename: string;
}

const isVideo = (f: string) => f.endsWith(".mp4") || f.endsWith(".webm");

function Media({ bg, baseUrl }: { bg: Bg; baseUrl: string }) {
  const src = `${baseUrl}/${bg.filename}`;
  return isVideo(bg.filename) ? (
    <video src={src} className="w-full h-full object-cover" muted loop playsInline />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={bg.name} className="w-full h-full object-cover" />
  );
}

/**
 * 배경 뱅크 모델 관리 UI.
 * 좌: 이 지점에 노출할 배경(순서 드래그) / 우: 전체 배경 뱅크(클릭하여 추가).
 */
export default function BackgroundBankPanel({
  deviceId,
  deviceName,
  imageBaseUrl,
}: {
  deviceId: string | null;
  deviceName: string | null;
  imageBaseUrl: string;
}) {
  const [bank, setBank] = useState<Bg[]>([]);
  const [selected, setSelected] = useState<Bg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceId) { if (!cancelled) setLoading(false); return; }
      setLoading(true);
      try {
        const [bankData, selData] = await Promise.all([
          fetch(`/api/image/list/${BACKGROUND_IMAGE_TYPE}/`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`/api/device/${deviceId}/backgrounds/`, { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setBank(bankData.images || []);
        setSelected(selData.images || []);
        setDirty(false);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  const selectedIds = new Set(selected.map((s) => s.id));
  const full = selected.length >= MAX_ACTIVE_BACKGROUNDS;

  const add = (bg: Bg) => {
    if (full || selectedIds.has(bg.id)) return;
    setSelected((prev) => [...prev, bg]);
    setDirty(true);
  };
  const remove = (id: number) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= selected.length) return;
    setSelected((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    setDirty(true);
  };
  const handleDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    move(from, to);
  };

  const save = async () => {
    if (!deviceId) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/device/${deviceId}/backgrounds/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: selected.map((s) => s.id) }),
      });
      if (res.ok) {
        setDirty(false);
        setMessage("저장되었습니다.");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("저장 실패");
      }
    } catch {
      setMessage("서버 연결 실패");
    } finally {
      setSaving(false);
    }
  };

  if (!deviceId) {
    return <div className="p-8 bg-gray-800 rounded-xl text-center text-gray-400">상단에서 지점을 선택하세요.</div>;
  }
  if (loading) return <div className="text-gray-400">로딩중...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-sm text-gray-400">
          <span className="text-white font-semibold">{deviceName ?? "이 지점"}</span> 서비스 화면에 노출할 배경을 선택하세요 (최대 {MAX_ACTIVE_BACKGROUNDS}개).
        </p>
        <div className="flex items-center gap-3 shrink-0">
          {message && <span className="text-xs text-green-400">{message}</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "저장중…" : dirty ? "변경사항 저장" : "저장됨"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 좌: 이 지점 노출 배경 (순서) */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h4 className="text-white font-semibold mb-3">
            이 지점 노출 배경 <span className="text-gray-400 text-sm">({selected.length}/{MAX_ACTIVE_BACKGROUNDS})</span>
          </h4>
          {selected.length === 0 ? (
            <p className="text-gray-500 text-sm py-10 text-center">오른쪽 뱅크에서 배경을 클릭해 추가하세요.</p>
          ) : (
            <ul className="space-y-2">
              {selected.map((bg, index) => (
                <li
                  key={bg.id}
                  draggable
                  onDragStart={() => (dragIndex.current = index)}
                  onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
                  onDragLeave={() => setOverIndex((cur) => (cur === index ? null : cur))}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => { dragIndex.current = null; setOverIndex(null); }}
                  className={`flex items-center gap-2 rounded-lg border p-2 ${overIndex === index ? "border-blue-500 bg-gray-700" : "border-gray-700 bg-gray-900"}`}
                >
                  <span className="cursor-grab select-none px-1 text-gray-500" aria-hidden>⠿</span>
                  <span className="w-4 text-center text-xs font-semibold text-gray-500">{index + 1}</span>
                  <div className="h-11 w-16 flex-shrink-0 overflow-hidden rounded bg-gray-700">
                    <Media bg={bg} baseUrl={imageBaseUrl} />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{bg.name}</span>
                  <div className="flex flex-col">
                    <button onClick={() => move(index, index - 1)} disabled={index === 0} className="px-1 text-gray-400 hover:text-white disabled:opacity-30" aria-label="위로">▲</button>
                    <button onClick={() => move(index, index + 1)} disabled={index === selected.length - 1} className="px-1 text-gray-400 hover:text-white disabled:opacity-30" aria-label="아래로">▼</button>
                  </div>
                  <button onClick={() => remove(bg.id)} className="px-2 text-red-400 hover:text-red-300" aria-label="제거">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 우: 배경 뱅크 */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h4 className="text-white font-semibold mb-3">
            배경 뱅크 <span className="text-gray-400 text-sm">({bank.length})</span>
          </h4>
          {bank.length === 0 ? (
            <p className="text-gray-500 text-sm py-10 text-center">업로드된 배경이 없습니다. 상단 &quot;이미지 업로드&quot;로 추가하세요.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {bank.map((bg) => {
                const isSel = selectedIds.has(bg.id);
                const disabled = isSel || full;
                return (
                  <button
                    key={bg.id}
                    onClick={() => add(bg)}
                    disabled={disabled}
                    title={isSel ? "이미 선택됨" : full ? `최대 ${MAX_ACTIVE_BACKGROUNDS}개` : "클릭하여 추가"}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                      isSel ? "border-blue-500" : "border-transparent hover:border-white/40"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Media bg={bg} baseUrl={imageBaseUrl} />
                    {isSel && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
