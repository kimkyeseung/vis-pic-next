"use client";

import { useRef } from "react";
import { ColorRow } from "./ColorRow";
import type { Asset } from "./AssetUploader";

/** 버튼 이미지 업로드 + 텍스트 색상을 한 행에 묶은 카드 내부 섹션 (촬영하기/다음으로/결제하기 공용). */
export function ButtonThemeRow({
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
