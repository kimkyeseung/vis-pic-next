import { useState } from "react";
import type { MonitorInfo } from "@/types";
import { useLanguage } from "@/i18n/LanguageContext";
import { LOCALES } from "@/i18n/translations";

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
      <div className="main-container flex flex-col items-center max-w-[92vw]">
        {/* 버튼 대신 깜빡이는 안내 문구 — 화면 아무 곳이나 터치하면 시작(section onClick) */}
        <div
          className="flex items-center gap-4 text-white text-6xl portrait:text-7xl font-extrabold animate-soft-blink select-none max-w-[90vw] text-center"
          style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}
        >
          <span className="inline-block text-5xl portrait:text-6xl">&#128070;</span>
          {t("start.touch")}
        </div>

        {/* 언어 선택 — 결제 화면으로 이동. 결제 비활성 시에만 여기 표시. */}
        {showLanguage && (
          <div className="flex gap-3 mt-12 portrait:mt-8 flex-wrap justify-center" onClick={(e) => e.stopPropagation()}>
            {LOCALES.map(({ code, label }) => (
              <button
                key={code}
                className={`px-10 py-5 rounded-2xl text-3xl font-semibold transition-all ${
                  lang === code
                    ? "bg-white text-gray-900 shadow-lg"
                    : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                }`}
                onClick={() => setLang(code)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <img src="/static/viswave_logo.png" className="mt-24 portrait:mt-12 opacity-80 max-w-[50vw]" style={{ width: "200px" }} alt="Viswave" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>

      <div className="absolute bottom-16 text-center text-gray-500 text-xl animate-fadeInUp" style={{ animationDelay: "1s" }}>
        <p className="mb-2">{t("start.hint")}</p>
        <p className="animate-blink">{t("start.waiting")}</p>
      </div>

      {/* 운영자 설정 버튼 */}
      <button
        className="absolute bottom-6 right-6 text-white/30 hover:text-white/70 transition-colors text-sm px-3 py-2 rounded-lg"
        onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); }}
      >
        &#9881; 출력 설정
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
        </div>
      )}
    </section>
  );
}
