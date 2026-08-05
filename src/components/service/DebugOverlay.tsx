"use client";

import { useState } from "react";
import { useDebug } from "./DebugContext";

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * 디버그 모드 ON일 때만 뜨는 진단 패널(좌하단). data에 넘긴 키/값을 그대로 표시한다.
 * 축소 토글로 헤더만 남길 수 있다. 민감정보(토큰·비밀 등)는 넘기지 말 것 —
 * 제스처만 알면 누구나 켤 수 있다.
 */
export function DebugOverlay({ data }: { data: Record<string, unknown> }) {
  const { debug, set } = useDebug();
  const [minimized, setMinimized] = useState(false);
  if (!debug) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-[9999] rounded-xl bg-black/85 p-3 text-[11px] font-mono text-green-300 shadow-2xl pointer-events-auto ${
        minimized ? "w-auto" : "max-h-[70vh] w-[340px] overflow-auto"
      }`}
      style={{ backdropFilter: "blur(2px)" }}
    >
      <div className={`flex items-center justify-between gap-4 ${minimized ? "" : "mb-2"}`}>
        <span className="font-bold tracking-widest text-green-400">DEBUG</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized((m) => !m)}
            title={minimized ? "펼치기" : "축소"}
            className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
          >
            {minimized ? "펼치기" : "축소"}
          </button>
          <button
            onClick={() => set(false)}
            className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
          >
            끄기
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <table className="w-full border-collapse">
            <tbody>
              {Object.entries(data).map(([k, v]) => (
                <tr key={k} className="border-b border-white/5 align-top">
                  <td className="whitespace-nowrap py-0.5 pr-3 text-white/50">{k}</td>
                  <td className="break-all py-0.5 text-green-300">{formatVal(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-white/30">토글: 로고 5회 탭 · Ctrl+Shift+D</p>
        </>
      )}
    </div>
  );
}
