import type React from "react";
import type { ButtonImageOptions, ButtonRole } from "@/types";
import { BUTTON_IMAGE_SIZE, wallpaperPageName, type WallpaperPageStep } from "@/constants/images";

/** 가로/세로 화면용 이미지 한 쌍(미설정은 null/undefined). */
export type OrientedUrls = { landscape?: string | null; portrait?: string | null };

export interface ServiceThemeInput {
  /** 현재 단계(서비스 Step). "start"는 첫(대기) 화면. */
  step: string;
  portrait: boolean;
  textColor?: string;
  primaryColor?: string;
  bgColor?: string;
  glow: { enabled: boolean; color: string; size: number };
  buttonTextColors: Record<ButtonRole, string | undefined>;
  buttonOptions: Record<ButtonRole, ButtonImageOptions>;
  buttonImages: Record<ButtonRole, OrientedUrls>;
  /** 첫(대기) 화면 배경화면. */
  firstWallpaper: OrientedUrls;
  /** 나머지 화면 공통 배경화면. */
  subWallpaper: OrientedUrls;
  /** 화면별 배경화면 — key는 wallpaperPageName(step, portrait). */
  pageWallpapers: Record<string, string | null | undefined>;
}

/** 화면 방향에 맞는 쪽을 고르고, 없으면 반대 방향으로 폴백(한쪽만 올려도 양쪽에 쓰인다). */
export function pickOriented(urls: OrientedUrls, portrait: boolean): string | null {
  const { landscape: ls, portrait: pt } = urls;
  return (portrait ? (pt ?? ls) : (ls ?? pt)) ?? null;
}

const ROLES: readonly ButtonRole[] = ["capture", "next", "payment"];

/**
 * 테마 관리 설정 → 서비스 루트(.service-theme)에 줄 style(CSS 변수·배경)과 data-* 속성.
 * 서비스 화면과 관리자 미리보기가 같은 함수를 써서 미리보기가 실제와 어긋나지 않게 한다.
 *
 * - 배경화면: 첫 화면은 첫 화면 이미지, 나머지 단계는 "화면별 이미지 → 공통 이미지 → 배경 단색" 순(CSS 캐스케이드처럼).
 * - 버튼 이미지가 있는 버튼은 고정 크기 + 이미지만 표시(단색 배경·그림자 없음) + (옵션) 텍스트 숨김 —
 *   루트 data-* 속성으로 globals.css 규칙을 켠다.
 * - 글자색은 --theme-text로 내려 globals.css의 .service-theme 규칙이 본문 흰 텍스트를 치환한다.
 */
export function buildServiceTheme(input: ServiceThemeInput): { style: React.CSSProperties; dataAttrs: Record<string, string> } {
  const { step, portrait } = input;
  const activeWallpaper = step === "start"
    ? pickOriented(input.firstWallpaper, portrait)
    : pickOriented({
        landscape: input.pageWallpapers[wallpaperPageName(step as WallpaperPageStep, false)],
        portrait: input.pageWallpapers[wallpaperPageName(step as WallpaperPageStep, true)],
      }, portrait) ?? pickOriented(input.subWallpaper, portrait);

  const buttonUrls = {} as Record<ButtonRole, string | null>;
  const dataAttrs: Record<string, string> = {};
  for (const role of ROLES) {
    const url = pickOriented(input.buttonImages[role], portrait);
    buttonUrls[role] = url;
    if (!url) continue;
    dataAttrs[`data-btn-img-${role}`] = "";
    if (input.buttonOptions[role].hideText) dataAttrs[`data-btn-hidetext-${role}`] = "";
  }
  const buttonSize = portrait ? BUTTON_IMAGE_SIZE.portrait : BUTTON_IMAGE_SIZE.landscape;

  const style = {
    ...(input.textColor ? { ["--theme-text"]: input.textColor } : {}),
    ...(input.primaryColor ? { ["--theme-primary"]: input.primaryColor } : {}),
    // 대형 강조 버튼(촬영하기·다음·결제하기) 배경 이미지. 미설정 시 globals.css 폴백으로 기존 단색 유지.
    ...Object.fromEntries(ROLES.filter((r) => buttonUrls[r]).map((r) => [`--theme-btn-${r}-image`, `url(${buttonUrls[r]})`])),
    ["--btn-img-w"]: `${buttonSize.width}px`,
    ["--btn-img-h"]: `${buttonSize.height}px`,
    // 버튼별 텍스트 색상. 버튼 배경(단색/이미지)에 맞춰 관리자가 지정.
    ...Object.fromEntries(ROLES.filter((r) => input.buttonTextColors[r]).map((r) => [`--theme-btn-${r}-text`, input.buttonTextColors[r]])),
    // 버튼 탭 글로우 (--btn-glow-*). 비활성 시 주입 안 함 → globals.css 폴백으로 글로우 없음.
    ...(input.glow.enabled
      ? { ["--btn-glow-color"]: input.glow.color, ["--btn-glow-size"]: `${input.glow.size}px` }
      : {}),
    backgroundColor: input.bgColor,
    ...(activeWallpaper
      ? {
          backgroundImage: `url(${activeWallpaper})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : {}),
  } as React.CSSProperties;

  return { style, dataAttrs };
}
