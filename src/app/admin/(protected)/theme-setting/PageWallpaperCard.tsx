"use client";

import { useState } from "react";
import { WALLPAPER_PAGE_STEPS, wallpaperPageName, type WallpaperPageStep } from "@/constants/images";
import { AssetUploaderRow } from "./AssetUploader";
import type { useThemeSettings } from "./useThemeSettings";

/**
 * 화면별 배경화면 — 단계 탭을 고르고 그 화면의 가로/세로 배경을 올린다.
 * 적용 우선순위: 화면별 이미지 → '나머지 화면(공통)' 이미지 → 배경 단색 (CSS 캐스케이드와 같은 개념).
 */
export function PageWallpaperCard({ t }: { t: ReturnType<typeof useThemeSettings> }) {
  const [step, setStep] = useState<WallpaperPageStep>(WALLPAPER_PAGE_STEPS[0].step);
  const hasAny = (s: WallpaperPageStep) => !!(t.namedAssets[wallpaperPageName(s, false)] || t.namedAssets[wallpaperPageName(s, true)]);
  const ls = wallpaperPageName(step, false);
  const pt = wallpaperPageName(step, true);
  const fallbackLabel = t.wallpaperSubLs || t.wallpaperSubPt ? "공통 배경 사용" : "배경 단색 사용";

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 divide-y divide-gray-700">
      <div className="px-6 pt-5 pb-4">
        <h3 className="text-white font-semibold text-base">배경화면 · 화면별 (선택)</h3>
        <p className="text-gray-500 text-xs mt-1">
          특정 화면에만 다른 배경을 쓰고 싶을 때 지정합니다(예: 촬영 화면에 &apos;손바닥을 펴세요&apos; 안내가 들어간 배경).
          지정한 화면은 이 이미지가, 지정하지 않은 화면은 위 &apos;나머지 화면(공통)&apos; 배경이 쓰입니다 — 모든 화면을 통일하려면 여기는 비워두면 됩니다.
          가로/세로 중 한쪽만 올리면 그 이미지가 양쪽에 쓰입니다.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {WALLPAPER_PAGE_STEPS.map((s) => (
            <button
              key={s.step}
              onClick={() => setStep(s.step)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
                step === s.step ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {s.label}
              {hasAny(s.step) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="개별 배경 지정됨" />}
            </button>
          ))}
        </div>
      </div>

      <AssetUploaderRow
        key={ls}
        title="가로 화면용"
        description="가로(landscape) 키오스크의 이 화면 배경. 1920×1080px 권장."
        asset={t.namedAssets[ls] ?? null}
        onUpload={t.uploadNamed(ls)}
        onRemove={t.removeNamed(ls)}
        busy={!!t.namedBusy[ls]}
        previewClass="w-64 aspect-video"
        imageFit="cover"
        emptyLabel={fallbackLabel}
      />

      <AssetUploaderRow
        key={pt}
        title="세로 화면용"
        description="세로(portrait) 키오스크의 이 화면 배경. 1080×1920px 권장."
        asset={t.namedAssets[pt] ?? null}
        onUpload={t.uploadNamed(pt)}
        onRemove={t.removeNamed(pt)}
        busy={!!t.namedBusy[pt]}
        previewClass="w-40 aspect-[9/16]"
        imageFit="cover"
        emptyLabel={fallbackLabel}
      />
    </div>
  );
}
