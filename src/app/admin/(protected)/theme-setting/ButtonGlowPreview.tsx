"use client";

import { useEffect, useRef, useState } from "react";
import { BUTTON_IMAGE_SIZE } from "@/constants/images";
import { BUTTON_ROLES } from "@/lib/deviceConfig";
import { buildServiceTheme } from "@/lib/serviceTheme";
import { spawnButtonGlow } from "@/lib/buttonGlow";
import { SERVICE_BIG_BUTTON_CLASS } from "@/components/service/sectionLayout";
import type { ButtonRole } from "@/types";
import type { useThemeSettings } from "./useThemeSettings";

const STAGE_W = 800;
const GAP = 48;
const PAD = 56;

// 서비스의 실제 버튼과 같은 클래스 — 이미지 유무·색·글로우가 서비스 화면과 똑같이 적용된다.
const ROLE_META: Record<ButtonRole, { label: string; className: string }> = {
  capture: { label: "촬영하기", className: "btn-role-capture" },
  next: { label: "다음으로", className: "nav-next-lg btn-role-next" },
  payment: { label: "결제하기", className: "nav-next-lg btn-role-payment" },
};

/**
 * 버튼 글로우 미리보기 — 촬영·다음·결제 버튼을 서비스와 같은 테마로 그려 두고, 눌러 보면(마우스/터치)
 * 실제 서비스와 같은 글로우(누르는 동안 + 탭 후 퍼짐)가 재생된다.
 * 업로드한 버튼 이미지, 버튼 글자색, 강조(버튼) 색, 글로우 색·세기, 텍스트 숨김 옵션, 배경이 저장 전 현재 값으로 즉시 반영된다.
 */
export function ButtonGlowPreview({ t }: { t: ReturnType<typeof useThemeSettings> }) {
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const portrait = orientation === "portrait";
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);

  // 컨테이너 폭에 맞춰 고정 크기 스테이지를 축소(1:1보다 커지지 않게).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / STAGE_W) || 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const buttonImages = Object.fromEntries(
    BUTTON_ROLES.map((role) => {
      const slot = t.buttonSlot(role);
      return [role, { landscape: slot.landscape?.url ?? null, portrait: slot.portrait?.url ?? null }];
    }),
  ) as Record<ButtonRole, { landscape: string | null; portrait: string | null }>;

  const { style, dataAttrs } = buildServiceTheme({
    step: "select", // 나머지 화면 공통 배경(없으면 배경 단색) — 버튼이 실제로 올라가는 배경
    portrait,
    textColor: t.textColor,
    primaryColor: t.primaryColor,
    bgColor: t.bgColor,
    glow: { enabled: t.glowEnabled, color: t.glowColor, size: t.glowSize },
    buttonTextColors: { capture: t.captureTextColor, next: t.nextTextColor, payment: t.paymentTextColor },
    buttonOptions: t.buttonImageOptions,
    buttonImages,
    firstWallpaper: { landscape: t.wallpaperLs?.url, portrait: t.wallpaperPt?.url },
    subWallpaper: { landscape: t.wallpaperSubLs?.url, portrait: t.wallpaperSubPt?.url },
    pageWallpapers: {},
  });

  const size = portrait ? BUTTON_IMAGE_SIZE.portrait : BUTTON_IMAGE_SIZE.landscape;
  const stageH = PAD * 2 + size.height * BUTTON_ROLES.length + GAP * (BUTTON_ROLES.length - 1);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-gray-400 text-xs">
          {t.glowEnabled ? "버튼을 눌러 보세요 — 저장 전 설정이 바로 반영됩니다." : "글로우가 꺼져 있습니다. 켜면 버튼을 눌렀을 때 효과가 나타납니다."}
        </span>
        <div className="flex gap-1 shrink-0">
          {(["landscape", "portrait"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrientation(o)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                orientation === o ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {o === "landscape" ? "가로" : "세로"}
            </button>
          ))}
        </div>
      </div>
      <div ref={wrapRef} className="w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
        <div style={{ width: STAGE_W * scale, height: stageH * scale }}>
          <div
            className={`service-theme isolate relative overflow-hidden ${portrait ? "force-portrait" : ""}`}
            {...dataAttrs}
            style={{ ...style, width: STAGE_W, height: stageH, transform: `scale(${scale})`, transformOrigin: "top left" }}
            onPointerDown={(e) => {
              const btn = (e.target as HTMLElement).closest(".service-button") as HTMLElement | null;
              if (btn) spawnButtonGlow(btn);
            }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: GAP }}>
              {BUTTON_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`service-button ${ROLE_META[role].className} ${SERVICE_BIG_BUTTON_CLASS}`}
                  // 이미지 버튼의 고정 크기(BUTTON_IMAGE_SIZE)는 단색 버튼 실측 크기와 같다 — 미리보기는 화면 방향을
                  // 강제로 바꾸므로(@media portrait와 무관) 단색 버튼도 같은 크기로 직접 지정한다.
                  style={{ width: size.width, height: size.height, minWidth: 0, padding: 0 }}
                >
                  {ROLE_META[role].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
