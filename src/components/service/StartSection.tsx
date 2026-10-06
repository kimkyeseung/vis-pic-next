import { useState } from "react";
import type { MonitorInfo } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { LOCALES } from "@/i18n/translations";
import { HOME_SHORTCUT_LABEL } from "@/components/HomeShortcut";

export function StartSection({
  onNext,
  showLanguage = true,
  monitors,
  syncEnabled,
  selectedMonitorIndex,
  onSyncEnabledChange,
  onMonitorIndexChange,
}: {
  onNext: () => void;
  // 결제 화면으로 언어 선택을 옮겼으므로, 결제 비활성(결제 화면 없음)일 때만 시작 화면에 표시한다.
  showLanguage?: boolean;
  monitors: MonitorInfo[];
  syncEnabled: boolean;
  selectedMonitorIndex: number | null;
  onSyncEnabledChange: (v: boolean) => void;
  onMonitorIndexChange: (i: number) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const { lang, setLang, t } = useLanguage();

  return (
    <section className="w-full h-full flex flex-col items-center justify-center cursor-pointer relative z-10" onClick={onNext}>
      <div className="absolute top-8 right-10 text-gray-500 text-xs select-none">
        빌드 {process.env.NEXT_PUBLIC_BUILD_DATE}
      </div>
      {/* max-w는 vw가 아니라 스테이지 디자인 캔버스(가로 1920/세로 1080) 기준 고정 px로 잡는다 —
          이 스테이지는 transform: scale()로 축소되는데 vw는 그 transform 영향을 안 받고 실제
          브라우저 뷰포트 기준으로 계산돼, 실기기 해상도가 디자인 캔버스와 정확히 안 맞으면
          (거의 항상 그렇다) 의도한 비율보다 좁아져 안내 문구가 줄바꿈되는 문제가 있었다. */}
      {/* 언어 버튼이 있으면 **버튼 줄이 화면 정가운데**에 오도록 버튼 줄만 흐름에 두고(section이 가운데 정렬),
          로고는 그 아래(top-full)에 절대 위치로 붙인다. 언어 버튼이 없으면(결제 사용 지점) 로고만 가운데에 둔다.
          "화면을 터치해주세요" 안내는 화면 하단(bottom-16)에 따로 둔다 — 아래 블록 참고. */}
      <div className="main-container relative flex flex-col items-center max-w-[1766px] portrait:max-w-[994px]">
        {/* 언어 선택 — 결제 화면으로 이동. 결제 비활성 시에만 여기 표시.
            이 화면은 배경화면(밝은 이미지일 수 있음) 위에 얹히므로 결제 화면의 반투명 스타일
            (bg-white/10 · text-white/60)을 쓰지 않는다. 비선택 버튼도 불투명 단색 배경 + 인라인
            흰 글자로 칠해 배경 밝기와 무관하게 읽히게 하고, 버튼 크기도 키워 시인성을 올린다.
            (인라인 색이라 .service-theme의 text-white 치환 대상에서도 빠진다 — globals.css §테마 글자색) */}
        {showLanguage && (
          <div className="flex gap-5 portrait:gap-4 flex-wrap justify-center" onClick={(e) => e.stopPropagation()}>
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                className={`px-16 py-8 portrait:px-10 portrait:py-7 rounded-2xl text-5xl portrait:text-4xl font-semibold transition-colors shadow-lg border-4 ${
                  lang === code
                    ? "bg-white text-gray-900"
                    : "bg-[#3f3f46] border-[#8a8a95] hover:bg-[#52525b]"
                }`}
                // 선택된 버튼은 테두리를 강조(primary) 색상으로 — 지점 테마 설정이 있으면 그 값,
                // 없으면 디자인 토큰 기본값(--color-brand). 비선택은 인라인 흰 글자(테마 치환 제외).
                style={lang === code ? { borderColor: "var(--theme-primary, var(--color-brand))" } : { color: "#ffffff" }}
                onClick={() => setLang(code)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <img
          src="/static/viswave_logo.png"
          className={`opacity-80 max-w-[50vw] ${showLanguage ? "absolute top-full left-1/2 -translate-x-1/2 mt-24 portrait:mt-12" : ""}`}
          style={{ width: "200px" }}
          alt="Viswave"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      {/* 깜빡이는 터치 안내 — 화면 하단 가운데. 예전 "화면 아무 곳이나 터치하여 시작하세요" 자리(bottom-16)에서
          화면 높이의 7%만큼 올린 위치(bottom: 4rem + 7%, %는 화면 높이 기준이라 가로·세로 모두 같은 비율). 화면 아무 곳이나
          터치하면 시작(section onClick). 폭은 vw가 아닌 스테이지 기준 고정 px로 제한한다(스테이지가 transform: scale로
          축소돼 vw는 실제 뷰포트 기준이라 의도보다 좁아져 줄바꿈될 수 있다). */}
      <div className="absolute bottom-[calc(4rem+7%)] left-1/2 -translate-x-1/2 w-[1728px] portrait:w-[972px] flex justify-center pointer-events-none">
        <div
          className={`text-white font-extrabold animate-soft-blink select-none text-center ${
            // 일본어는 한 줄로 길어 다른 언어보다 살짝 작게(60→52px, 세로 72→64px). Yu Gothic은 글자 아래 여백이 커서 0.18em 내려 맞춘다. 클래스는 리터럴로 둬야 Tailwind가 인식한다.
            lang === "ja" ? "text-[3.25rem] portrait:text-[4rem] translate-y-[0.18em]" : "text-6xl portrait:text-7xl"
          }`}
          style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}
        >
          {/* whitespace-pre-line: 번역문에 \n이 있으면 그 지점에서 줄바꿈, 없으면 한 줄
              (현재는 모든 언어가 한 줄). leading-none으로 2줄일 때도 줄간격이 벌어지지 않게 한다. */}
          <span className="whitespace-pre-line leading-none">{t("start.touch")}</span>
        </div>
      </div>

      {/* 운영자 설정 버튼 */}
      <button
        className="absolute bottom-6 right-6 text-white/30 hover:text-white/70 transition-colors text-sm px-3 py-2 rounded-lg"
        onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); }}
      >
        출력 설정
      </button>

      {/* 서브 모니터 출력 설정 패널 */}
      {showSettings && (
        <div
          className="absolute bottom-16 right-6 bg-black/80 border border-white/20 rounded-2xl p-5 w-72 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-white font-semibold mb-4 text-sm">서브 모니터 출력</h3>

          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <div
              className={`relative w-11 h-6 rounded-full transition-colors ${syncEnabled ? "bg-blue-500" : "bg-white/20"}`}
              onClick={() => onSyncEnabledChange(!syncEnabled)}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${syncEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </div>
            <span className="text-white/80 text-sm">{syncEnabled ? "출력 켜짐" : "출력 꺼짐"}</span>
          </label>

          {syncEnabled && monitors.length > 0 && (
            <div className="space-y-2">
              <p className="text-white/50 text-xs mb-2">출력할 모니터 선택</p>
              {monitors.map((m) => (
                <button
                  key={m.index}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedMonitorIndex === m.index
                      ? "bg-blue-500/70 text-white"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                  onClick={() => onMonitorIndexChange(m.index)}
                >
                  모니터 {m.index + 1} ({m.width}×{m.height})
                </button>
              ))}
            </div>
          )}

          {syncEnabled && monitors.length === 0 && (
            <p className="text-white/40 text-xs">연결된 외부 모니터가 없습니다</p>
          )}

          {/* 초기(모드 선택) 화면으로 — 키보드가 없는 키오스크를 위한 터치 경로.
              단축키(HomeShortcut)와 동작이 같고, 대기 화면에서만 열리는 운영자 패널 안에 둔다. */}
          <div className="mt-5 pt-4 border-t border-white/15">
            <button
              className="w-full px-3 py-2 rounded-lg text-sm bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
              onClick={() => window.location.assign("/")}
            >
              초기화면(모드 선택)으로
            </button>
            <p className="text-white/40 text-xs mt-2 text-center">단축키 {HOME_SHORTCUT_LABEL}</p>
          </div>
        </div>
      )}
    </section>
  );
}
