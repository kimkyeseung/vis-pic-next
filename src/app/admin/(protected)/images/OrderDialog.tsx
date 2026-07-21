"use client";

import { useEffect, useRef, useState } from "react";

interface Image {
  id: number;
  name: string;
  filename: string;
  priority: number;
}

interface OrderDialogProps {
  images: Image[];
  imageBaseUrl: string;
  typeLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

const isVideo = (filename: string) =>
  filename.endsWith(".mp4") || filename.endsWith(".webm");

export default function OrderDialog({
  images,
  imageBaseUrl,
  typeLabel,
  onClose,
  onSaved,
}: OrderDialogProps) {
  const [items, setItems] = useState<Image[]>(images);
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    move(from, to);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/images/reorder/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: items.map((i) => i.id) }),
      });
      if (!res.ok) throw new Error("reorder failed");
      onSaved();
    } catch (error) {
      console.error("Failed to save order:", error);
      alert("순서 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-gray-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-700 p-5">
          <div>
            <h3 className="text-lg font-bold text-white">{typeLabel} 순서 관리</h3>
            <p className="mt-1 text-xs text-gray-400">
              드래그하거나 화살표로 순서를 바꾼 뒤 저장하세요. 위에 있을수록 먼저 노출됩니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-400">이미지가 없습니다.</div>
          ) : (
            <ul className="space-y-2">
              {items.map((image, index) => (
                <li
                  key={image.id}
                  draggable
                  onDragStart={() => (dragIndex.current = index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverIndex(index);
                  }}
                  onDragLeave={() =>
                    setOverIndex((cur) => (cur === index ? null : cur))
                  }
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => {
                    dragIndex.current = null;
                    setOverIndex(null);
                  }}
                  className={`flex items-center gap-3 rounded-lg border p-2 transition-colors ${
                    overIndex === index
                      ? "border-blue-500 bg-gray-700"
                      : "border-gray-700 bg-gray-900"
                  }`}
                >
                  <span
                    className="cursor-grab select-none px-1 text-gray-500 active:cursor-grabbing"
                    aria-hidden
                  >
                    ⠿
                  </span>
                  <span className="w-6 text-center text-xs font-semibold text-gray-500">
                    {index + 1}
                  </span>
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-gray-700">
                    {isVideo(image.filename) ? (
                      <video
                        src={`${imageBaseUrl}/${image.filename}`}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={`${imageBaseUrl}/${image.filename}`}
                        alt={image.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {image.name}
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      {image.filename}
                    </p>
                  </div>
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      className="px-1.5 text-gray-400 hover:text-white disabled:opacity-30"
                      aria-label="위로"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(index, index + 1)}
                      disabled={index === items.length - 1}
                      className="px-1.5 text-gray-400 hover:text-white disabled:opacity-30"
                      aria-label="아래로"
                    >
                      ▼
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-700 p-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || items.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "저장중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
