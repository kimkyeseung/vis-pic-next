import { useState, useEffect } from "react";
import type { MonitorInfo } from "@/types";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useTauriMonitor() {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [selectedMonitorIndex, setSelectedMonitorIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<MonitorInfo[]>("get_monitors").then(setMonitors).catch(console.error);
    });
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      if (syncEnabled && selectedMonitorIndex !== null && monitors[selectedMonitorIndex]) {
        const m = monitors[selectedMonitorIndex];
        invoke("open_camera_window", { x: m.x, y: m.y, width: m.width, height: m.height }).catch(console.error);
      } else if (!syncEnabled) {
        invoke("close_camera_window").catch(console.error);
      }
    });
  }, [syncEnabled, selectedMonitorIndex, monitors]);

  return { monitors, syncEnabled, setSyncEnabled, selectedMonitorIndex, setSelectedMonitorIndex };
}
