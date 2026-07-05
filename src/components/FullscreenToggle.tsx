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
        if (isFullscreen) {
          // 창 모드: borderless 전체 크기 그대로면 변화가 안 보이므로
          // 테두리 복원 + 축소 + 중앙 배치 (lib.rs toggle_fullscreen과 동일)
          const { LogicalSize } = await import("@tauri-apps/api/dpi");
          await win.setFullscreen(false);
          await win.setDecorations(true);
          await win.setSize(new LogicalSize(1280, 800));
          await win.center();
        } else {
          await win.setDecorations(false);
          await win.setFullscreen(true);
        }
      } catch {
        // 브라우저 환경(Tauri 외) 에서는 무시
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  return null;
}
