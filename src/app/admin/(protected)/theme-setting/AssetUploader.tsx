"use client";

import { useRef } from "react";

export type Asset = { id: number; url: string; filename: string } | null;

/** 단일 이미지 애셋(배경화면/로고) 업로드·미리보기·제거 카드. */
export function AssetUploader({
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
