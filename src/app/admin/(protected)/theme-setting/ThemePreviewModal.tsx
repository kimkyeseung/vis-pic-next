"use client";

import { useEffect, useState } from "react";
import { ServicePreviewStage, PREVIEW_STEPS, type PreviewStep } from "@/components/admin/ServicePreviewStage";
import { buildServiceTheme } from "@/lib/serviceTheme";
import { BUTTON_ROLES } from "@/lib/deviceConfig";
import type { ButtonRole } from "@/types";
import type { useThemeSettings } from "./useThemeSettings";

// 단계별로 보이는 대형 버튼 — 어느 단계에서 어떤 버튼 이미지를 확인할 수 있는지 안내용.
const STEP_BUTTON_HINT: Partial<Record<PreviewStep, string>> = {
  payment: "결제하기 버튼",
  frame: "다음으로 버튼",
  background: "다음으로 버튼",
  camera: "촬영하기 버튼",
  select: "다음으로 버튼",
  printbg: "다음으로 버튼",
};

/**
 * 테마 미리보기 — 실제 서비스 화면(목업 데이터)에 이 지점의 테마를 입혀 단계별·가로/세로로 보여준다.
 * 색상·버튼 옵션은 **저장하지 않은 현재 값**, 배경화면·로고·버튼 이미지는 업로드된 이미지를 쓴다.
 * 테마 계산은 서비스와 같은 buildServiceTheme이라 실제 화면과 같게 보인다.
 */
export function ThemePreviewModal({ t, onClose }: { t: ReturnType<typeof useThemeSettings>; onClose: () => void }) {
  const [step, setStep] = useState<PreviewStep>("start");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [selectedFrame, setSelectedFrame] = useState("2x2");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pageWallpapers = Object.fromEntries(
    Object.entries(t.namedAssets).map(([name, asset]) => [name, asset?.url ?? null]),
  );
  const buttonImages = Object.fromEntries(
    BUTTON_ROLES.map((role) => {
      const slot = t.buttonSlot(role);
      return [role, { landscape: slot.landscape?.url ?? null, portrait: slot.portrait?.url ?? null }];
    }),
  ) as Record<ButtonRole, { landscape: string | null; portrait: string | null }>;

  const { style, dataAttrs } = buildServiceTheme({
    step,
    portrait: orientation === "portrait",
    textColor: t.textColor,
    primaryColor: t.primaryColor,
    bgColor: t.bgColor,
    glow: { enabled: t.glowEnabled, color: t.glowColor, size: t.glowSize },
    buttonTextColors: { capture: t.captureTextColor, next: t.nextTextColor, payment: t.paymentTextColor },
    buttonOptions: t.buttonImageOptions,
    buttonImages,
    firstWallpaper: { landscape: t.wallpaperLs?.url, portrait: t.wallpaperPt?.url },
    subWallpaper: { landscape: t.wallpaperSubLs?.url, portrait: t.wallpaperSubPt?.url },
    pageWallpapers,
  });

  const hint = STEP_BUTTON_HINT[step];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80" role="dialog" aria-modal="true" aria-label="테마 미리보기">
      <div className="shrink-0 border-b border-gray-700 bg-gray-800 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white mr-2">테마 미리보기</span>
          {PREVIEW_STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                step === s.id ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {s.label}
            </button>
          ))}
          <span className="mx-2 h-5 w-px bg-gray-600" />
          {(["landscape", "portrait"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOrientation(o)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                orientation === o ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {o === "landscape" ? "가로 1920×1080" : "세로 1080×1920"}
            </button>
          ))}
          <button
            onClick={onClose}
            className="ml-auto px-3 py-1.5 rounded-lg bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
            aria-label="미리보기 닫기"
          >
            닫기 (Esc)
          </button>
        </div>
        <p className="text-xs text-gray-400">
          색상·버튼 옵션은 <span className="text-gray-200">저장 전 현재 값</span>, 배경화면·로고·버튼 이미지는 업로드된 이미지로 보여줍니다.
          사진·프레임 등은 예시 데이터입니다.{hint && <> 이 단계에서는 <span className="text-amber-300">{hint}</span>을 확인할 수 있습니다.</>}
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <ServicePreviewStage
          step={step}
          orientation={orientation}
          themeStyle={style}
          themeAttrs={dataAttrs}
          logoUrl={t.logo?.url ?? null}
          selectedFrame={selectedFrame}
          onSelectFrame={setSelectedFrame}
        />
      </div>
    </div>
  );
}
