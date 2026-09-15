"use client";

import type { BGImage, FallbackBackground } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";

/**
 * 촬영 화면 좌측(가로)·상단(세로)의 배경 선택 패널. 순수 표시 컴포넌트 — 상태는 모두
 * `CameraSection`이 소유하고, 이 컴포넌트는 목록을 그리고 클릭을 `onBackgroundSelect`로 흘려보낸다.
 */
export function BackgroundPickerPanel({
  bgOptions,
  selectedBackground,
  onBackgroundSelect,
  imageBaseUrl,
}: {
  bgOptions: (BGImage | FallbackBackground)[];
  selectedBackground: number | null;
  onBackgroundSelect: (bg: number) => void;
  imageBaseUrl: string;
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col min-h-0 px-2 pr-4" style={{ gridArea: "bg" }}>
      <h3 className="text-white text-2xl font-bold text-center mb-4 shrink-0">{t("camera.bgChange")}</h3>
      {/* 우측 스티커 패널의 '지우기' 버튼 행(min-h-[22px] mb-2)과 높이를 맞춰 두 패널의 시작 줄을 정렬한다. */}
      <div className="min-h-[22px] mb-2 shrink-0" aria-hidden />
      {/* p-1: 선택 ring(요소 바깥 3px)이 스크롤 컨테이너 가장자리에서 잘리지 않도록 여백 확보 */}
      {/* portrait:mb-28: 우측 '남은 촬영 횟수' 박스의 하단 여백과 맞춰 두 패널의 끝 줄을 정렬한다. */}
      <div className="grid grid-cols-2 gap-3 overflow-y-auto flex-1 min-h-0 content-start p-1 portrait:mb-28">
        {bgOptions.map((bg) => {
          const isSelected = selectedBackground === bg.id;
          const isDb = "filename" in bg;
          const isVideo = isDb && (bg.filename.endsWith(".mp4") || bg.filename.endsWith(".webm"));
          return (
            <button
              key={bg.id}
              className={`relative aspect-[4/3] shrink-0 rounded-xl overflow-hidden transition-all duration-200 ${
                isSelected
                  ? "ring-[3px] ring-[var(--theme-primary,#6c6fb4)] shadow-lg"
                  : "ring-1 ring-white/20 opacity-70 hover:opacity-100"
              }`}
              style={isDb ? undefined : { background: bg.gradient }}
              onClick={() => onBackgroundSelect(bg.id)}
            >
              {isDb && (isVideo ? (
                <video src={`${imageBaseUrl}/${bg.filename}`} className="w-full h-full object-cover" muted loop autoPlay playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${imageBaseUrl}/${bg.filename}`} alt={bg.name} className="w-full h-full object-cover" />
              ))}
              {isSelected && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white text-lg font-bold">&#10003;</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
