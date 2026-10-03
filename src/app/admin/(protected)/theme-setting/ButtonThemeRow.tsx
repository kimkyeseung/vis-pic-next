"use client";

import { useRef } from "react";
import { BUTTON_IMAGE_SIZE } from "@/constants/images";
import type { ButtonImageOptions } from "@/types";
import { ColorRow } from "./ColorRow";
import type { Asset } from "./AssetUploader";

const { landscape: LS, portrait: PT } = BUTTON_IMAGE_SIZE;

/** 작은 on/off 스위치 + 라벨. */
function SwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div
        className={`relative mt-0.5 w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? "bg-blue-500" : "bg-gray-600"}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </div>
      <div>
        <div className="text-gray-200 text-sm">{label}</div>
        <div className="text-gray-500 text-xs">{hint}</div>
      </div>
    </label>
  );
}

/** 버튼 이미지 업로드 + 표시 옵션 + 텍스트 색상을 한 행에 묶은 카드 내부 섹션 (촬영하기/다음으로/결제하기 공용). */
export function ButtonThemeRow({
  title,
  description,
  asset,
  onUpload,
  onRemove,
  busy,
  textColor,
  onTextColorChange,
  options,
  onOptionChange,
}: {
  title: string;
  description: string;
  asset: Asset;
  onUpload: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
  textColor: string;
  onTextColorChange: (c: string) => void;
  options: ButtonImageOptions;
  onOptionChange: (key: keyof ButtonImageOptions, value: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="px-6 py-5">
      <h4 className="text-white font-semibold text-sm mb-1">{title}</h4>
      <p className="text-gray-500 text-xs mb-1">{description}</p>
      <p className="text-xs mb-4">
        <span className="text-gray-400">권장 이미지 크기(버튼 실제 크기): </span>
        <span className="text-amber-300 font-mono">가로 화면 {LS.width}×{LS.height}px</span>
        <span className="text-gray-500"> · </span>
        <span className="text-amber-300 font-mono">세로 화면 {PT.width}×{PT.height}px</span>
      </p>
      <div className="flex items-start gap-5 mb-4">
        {/* 미리보기 — 실제 버튼(가로 화면) 비율 그대로. 체크무늬로 투명 영역을 확인할 수 있다. */}
        <div
          className="w-64 rounded-lg border border-gray-600 overflow-hidden flex items-center justify-center shrink-0"
          style={{
            aspectRatio: `${LS.width} / ${LS.height}`,
            background: asset && options.imageOnly
              ? "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px"
              : "#2a2a2a",
          }}
        >
          {asset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.url} alt={title} className={`w-full h-full ${options.imageOnly ? "object-contain" : "object-cover"}`} />
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
      {asset && (
        <div className="space-y-3 mb-4">
          <SwitchRow
            label="이미지만 표시"
            hint="버튼 단색 배경·그림자·둥근 모서리를 없애 이미지(투명 PNG 포함)만 보이게 합니다."
            checked={options.imageOnly}
            onChange={(v) => onOptionChange("imageOnly", v)}
          />
          <SwitchRow
            label="버튼 텍스트 숨기기"
            hint="이미지에 글자가 이미 들어 있을 때 켜세요."
            checked={options.hideText}
            onChange={(v) => onOptionChange("hideText", v)}
          />
        </div>
      )}
      {!(asset && options.hideText) && (
        <ColorRow color={textColor} onChange={onTextColorChange}>
          <span className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2a2a2a] border border-gray-600" style={{ color: textColor }}>
            텍스트 색상 미리보기
          </span>
        </ColorRow>
      )}
    </div>
  );
}
