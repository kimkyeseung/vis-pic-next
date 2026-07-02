"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "downloading" | "ready" | "error";

export default function MediapipeLoader({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) {
      setStatus("ready");
      return;
    }

    let unlisten: (() => void) | null = null;

    async function prepare() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const installed = await invoke<boolean>("mediapipe_is_installed");
        if (installed) {
          setStatus("ready");
          return;
        }

        setStatus("downloading");
        setProgress({ done: 0, total: 7 });

        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ done: number; total: number }>("mediapipe-progress", (e) => {
          setProgress(e.payload);
        });

        await invoke("download_mediapipe");
        setStatus("ready");
      } catch {
        setStatus("error");
      } finally {
        unlisten?.();
      }
    }

    prepare();
  }, []);

  if (status === "ready") return <>{children}</>;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white z-50">
      {status === "checking" && (
        <p className="text-lg">초기화 중...</p>
      )}
      {status === "downloading" && (
        <>
          <p className="text-xl font-semibold mb-4">AI 모델 다운로드 중</p>
          <p className="text-sm text-gray-400 mb-6">최초 실행 시 한 번만 다운로드됩니다 (약 50MB)</p>
          {progress && (
            <>
              <div className="w-64 bg-gray-700 rounded-full h-2 mb-3">
                <div
                  className="bg-white h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-400">{progress.done} / {progress.total}</p>
            </>
          )}
        </>
      )}
      {status === "error" && (
        <>
          <p className="text-xl font-semibold mb-2 text-red-400">다운로드 실패</p>
          <p className="text-sm text-gray-400 mb-6">인터넷 연결을 확인하고 앱을 다시 시작해주세요.</p>
          <button
            className="px-6 py-2 bg-white text-black rounded-lg text-sm"
            onClick={() => window.location.reload()}
          >
            다시 시도
          </button>
        </>
      )}
    </div>
  );
}
