import { useState } from "react";
import type { MonitorInfo } from "@/types";

export function StartSection({
  onNext,
  monitors,
  syncEnabled,
  selectedMonitorIndex,
  onSyncEnabledChange,
  onMonitorIndexChange,
}: {
  onNext: () => void;
  monitors: MonitorInfo[];
  syncEnabled: boolean;
  selectedMonitorIndex: number | null;
  onSyncEnabledChange: (v: boolean) => void;
  onMonitorIndexChange: (i: number) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <section className="w-full h-full flex flex-col items-center justify-center cursor-pointer relative z-10" onClick={onNext}>
      <div className="main-container flex flex-col items-center">
        <div className="logo-section text-center mb-24 animate-fadeInDown">
          <h1 className="text-7xl font-extrabold mb-5 tracking-widest text-white" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
            AR-pic
          </h1>
        </div>
        <button
          className="service-button touch-button animate-pulse-button"
          style={{ animationDelay: "0.5s" }}
          onClick={(e) => { e.stopPropagation(); onNext(); }}
        >
          <span className="animate-touchBounce inline-block mr-5 text-3xl">&#128070;</span>
          화면을 터치해주세요
        </button>
        <img src="/static/images/viswave_logo.png" className="mt-24 opacity-80" style={{ width: "200px" }} alt="Viswave" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>

      <div className="absolute bottom-16 text-center text-gray-500 animate-fadeInUp" style={{ animationDelay: "1s" }}>
        <p className="mb-2">화면 아무 곳이나 터치하여 시작하세요</p>
        <p className="animate-blink">● 대기중 ●</p>
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
