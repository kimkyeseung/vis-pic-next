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

/**
 * 화면 방향 하나(가로 또는 세로)의 버튼 이미지 슬롯 — 실제 버튼 비율의 미리보기 + 업로드/제거.
 * 이 방향 이미지가 없으면 반대 방향 이미지(fallback)를 흐리게 보여줘 "그 이미지가 대신 쓰인다"는 걸 드러낸다.
 * 미리보기는 서비스와 같이 버튼 크기에 꽉 채운다(object-fill).
 */
function OrientationSlot({
  label,
  size,
  previewWidthClass,
  asset,
  fallback,
  fallbackLabel,
  title,
  textColor,
  onUpload,
  onRemove,
  busy,
}: {
  label: string;
  size: { width: number; height: number };
  previewWidthClass: string;
  asset: Asset;
  fallback: Asset;
  fallbackLabel: string;
  title: string;
  textColor: string;
  onUpload: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = asset ?? fallback;
  return (
    <div className="space-y-2">
      <div className="text-xs">
        <span className="text-gray-300 font-medium">{label}</span>
        <span className="text-amber-300 font-mono ml-2">{size.width}×{size.height}px</span>
      </div>
      <div
        className={`${previewWidthClass} rounded-lg border border-gray-600 overflow-hidden flex items-center justify-center relative`}
        style={{
          aspectRatio: `${size.width} / ${size.height}`,
          // 버튼 이미지는 항상 이미지만 표시(단색 배경 없음) — 투명 영역 확인용 체크무늬
          background: shown
            ? "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px"
            : "#2a2a2a",
        }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown.url} alt={`${title} ${label}`} className={`w-full h-full object-fill ${asset ? "" : "opacity-40"}`} />
        ) : (
          <span className="text-sm px-2 text-center font-bold" style={{ color: textColor }}>{title}</span>
        )}
        {!asset && fallback && (
          <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 text-gray-200 px-1.5 py-0.5 rounded">{fallbackLabel}</span>
        )}
      </div>
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
      <div className="flex gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {busy ? "처리 중..." : asset ? "변경" : "업로드"}
        </button>
        {asset && (
          <button
            onClick={onRemove}
            disabled={busy}
            className="px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            제거
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 버튼 이미지(가로/세로 화면용) 업로드 + 표시 옵션 + 텍스트 색상을 한 행에 묶은 카드 내부 섹션
 * (촬영하기/다음으로/결제하기 공용). 한쪽만 올리면 서비스는 그 이미지를 양쪽 화면에 쓴다.
 */
export function ButtonThemeRow({
  title,
  description,
  landscape,
  portrait,
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
  landscape: Asset;
  portrait: Asset;
  onUpload: (portrait: boolean) => (file: File) => void;
  onRemove: (portrait: boolean) => () => void;
  busy: { landscape: boolean; portrait: boolean };
  textColor: string;
  onTextColorChange: (c: string) => void;
  options: ButtonImageOptions;
  onOptionChange: (key: keyof ButtonImageOptions, value: boolean) => void;
}) {
  const hasAny = !!(landscape || portrait);
  return (
    <div className="px-6 py-5">
      <h4 className="text-white font-semibold text-sm mb-1">{title}</h4>
      <p className="text-gray-500 text-xs mb-4">
        {description} 가로·세로 화면의 버튼 크기가 달라 각각 올릴 수 있고, 한쪽만 올리면 그 이미지가 양쪽 화면에 버튼 크기에 맞춰 꽉 채워집니다.
      </p>
      <div className="flex flex-wrap items-start gap-6 mb-4">
        <OrientationSlot
          label="가로 화면용"
          size={LS}
          previewWidthClass="w-64"
          asset={landscape}
          fallback={portrait}
          fallbackLabel="세로용 이미지 사용"
          title={title}
          textColor={textColor}
          onUpload={onUpload(false)}
          onRemove={onRemove(false)}
          busy={busy.landscape}
        />
        <OrientationSlot
          label="세로 화면용"
          size={PT}
          previewWidthClass="w-72"
          asset={portrait}
          fallback={landscape}
          fallbackLabel="가로용 이미지 사용"
          title={title}
          textColor={textColor}
          onUpload={onUpload(true)}
          onRemove={onRemove(true)}
          busy={busy.portrait}
        />
      </div>
      {hasAny && (
        <div className="space-y-3 mb-4">
          <SwitchRow
            label="버튼 텍스트 숨기기"
            hint="이미지에 글자가 이미 들어 있을 때 켜세요."
            checked={options.hideText}
            onChange={(v) => onOptionChange("hideText", v)}
          />
        </div>
      )}
      {!(hasAny && options.hideText) && (
        <ColorRow color={textColor} onChange={onTextColorChange}>
          <span className="ml-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2a2a2a] border border-gray-600" style={{ color: textColor }}>
            텍스트 색상 미리보기
          </span>
        </ColorRow>
      )}
    </div>
  );
}
