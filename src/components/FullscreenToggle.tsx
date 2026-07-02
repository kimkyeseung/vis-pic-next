"use client";

import { useEffect } from "react";

export default function FullscreenToggle() {
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const isFullscreen = await win.isFullscreen();
        await win.setFullscreen(!isFullscreen);
      } catch {
        // 브라우저 환경(Tauri 외) 에서는 무시
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
