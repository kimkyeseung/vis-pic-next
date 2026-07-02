"use client";

import { useEffect } from "react";

export default function FullscreenToggle() {
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key !== "F11") return;
      e.preventDefault();
      e.stopImmediatePropagation();

      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const isFullscreen = await win.isFullscreen();
        await win.setFullscreen(!isFullscreen);
      } catch {
        // 브라우저 환경(Tauri 외) 에서는 무시
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  return null;
}
