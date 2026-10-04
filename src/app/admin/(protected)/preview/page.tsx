"use client";

import { useState } from "react";
import { FRAME_INFO } from "@/constants/frames";
import { LOCALES, type Locale } from "@/i18n/translations";
import { ServicePreviewStage, PREVIEW_STEPS, type PreviewStep } from "@/components/admin/ServicePreviewStage";

/**
 * 화면 미리보기 — 실제 서비스 Section을 목업 데이터로 단계별 확인(레이아웃·문구·언어).
 * 테마는 이 화면의 임시 글자색·강조색·그라데이션 배경만 쓴다. 지점에 올린 배경화면·버튼 이미지로 보려면
 * 테마 관리의 "미리보기"를 쓴다(같은 ServicePreviewStage에 실제 테마를 넣어 렌더).
 */
export default function PreviewPage() {
  const [step, setStep] = useState<PreviewStep>("start");
  const [lang, setLang] = useState<Locale>("ko");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [themeText, setThemeText] = useState("#ffffff");
  const [themePrimary, setThemePrimary] = useState("#6c6fb4");
  const [wallpaper, setWallpaper] = useState(false);
  const [gesturePreviewOn, setGesturePreviewOn] = useState(false);
  const [selectedFrame, selectFrame] = useState<string>("2x2");

  const themeStyle: React.CSSProperties = {
    ["--theme-text" as string]: themeText,
    ["--theme-primary" as string]: themePrimary,
    // 버튼 탭 글로우 미리보기 (강조색 사용)
    ["--btn-glow-color" as string]: themePrimary,
    ["--btn-glow-size" as string]: "28px",
    // 배경화면은 첫(대기) 화면에만 적용된다.
    ...(wallpaper && step === "start"
      ? { backgroundImage: "linear-gradient(135deg, #2b2440 0%, #46375f 50%, #6c6fb4 100%)" }
      : {}),
  };

  return (
    <div className="flex flex-col h-full -m-6">
      {/* 컨트롤 바 */}
      <div className="shrink-0 border-b border-gray-700 bg-gray-800 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase w-14">단계</span>
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
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase w-14">언어</span>
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`px-2.5 py-1 rounded text-sm transition-colors ${
                  lang === code ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">방향</span>
            <button
              onClick={() => setOrientation((o) => (o === "landscape" ? "portrait" : "landscape"))}
              className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
            >
              {orientation === "landscape" ? "가로 1920×1080" : "세로 1080×1920"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">결과물</span>
            {/* 결과물(프레임) 방향 토글: 세로 2컷(2x1) ↔ 가로 4컷(2x2). 프레임/선택/완료 미리보기에 반영 */}
            <button
              onClick={() => selectFrame(FRAME_INFO[selectedFrame]?.orientation === "portrait" ? "2x2" : "2x1")}
              className="px-3 py-1 rounded bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
            >
              {FRAME_INFO[selectedFrame]?.orientation === "portrait" ? "세로 2컷" : "가로 4컷"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            글자색
            <input type="color" value={themeText} onChange={(e) => setThemeText(e.target.value)} className="h-7 w-9 rounded bg-transparent" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            강조색
            <input type="color" value={themePrimary} onChange={(e) => setThemePrimary(e.target.value)} className="h-7 w-9 rounded bg-transparent" />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={wallpaper} onChange={(e) => setWallpaper(e.target.checked)} className="h-4 w-4 accent-blue-500" />
            배경화면
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={gesturePreviewOn} onChange={(e) => setGesturePreviewOn(e.target.checked)} className="h-4 w-4 accent-blue-500" />
            제스처 트리거
          </label>
          <button
            onClick={() => { setThemeText("#ffffff"); setThemePrimary("#6c6fb4"); setWallpaper(false); }}
            className="px-3 py-1 rounded bg-gray-700 text-gray-300 text-sm hover:bg-gray-600"
          >
            초기화
          </button>
        </div>
        <p className="text-xs text-gray-500">
          * 촬영 화면은 실제 <code>CameraSection</code>을 그대로 렌더하되, 실제 카메라는 켜지 않고
          곧바로 MOCK CAMERA 화면으로 대체합니다(&quot;촬영하기&quot;로 찍는 사진도 mock). 3단 레이아웃은
          실제와 동일합니다. 세로 방향은 스테이지에 <code>.force-portrait</code>를 부여해
          <code>portrait:</code> 전용 스타일을 실제 세로 화면과 동일하게 적용합니다.
        </p>
      </div>

      {/* 스테이지 */}
      <div className="flex-1 overflow-hidden">
        <ServicePreviewStage
          step={step}
          orientation={orientation}
          lang={lang}
          themeStyle={themeStyle}
          gesturePreviewOn={gesturePreviewOn}
          selectedFrame={selectedFrame}
          onSelectFrame={selectFrame}
        />
      </div>
    </div>
  );
}
