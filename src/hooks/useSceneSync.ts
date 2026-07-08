"use client";

import { useEffect, useRef } from "react";

// ── 프레임 채널 (CameraSection → output 페이지) ─────────────────
// Next.js SSE API(/api/camera-frame)를 중계 서버로 사용한다.
// Tauri/브라우저 모두 동일하게 작동하며 BroadcastChannel/Tauri IPC 의존성이 없다.
export function useFrameSender(enabled: boolean) {
  const channelRef = useRef<{ postMessage: (msg: { type: string; dataUrl: string }) => void } | null>(null);

  useEffect(() => {
    if (!enabled) {
      channelRef.current = null;
      return;
    }
    channelRef.current = {
      postMessage: ({ dataUrl }) => {
        fetch("/api/camera-frame/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        }).catch(() => {});
      },
    };
    return () => { channelRef.current = null; };
  }, [enabled]);

  return channelRef;
}

export function useFrameReceiver(onFrame: (dataUrl: string) => void) {
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; });

  useEffect(() => {
    const es = new EventSource("/api/camera-frame/");
    es.onmessage = (e: MessageEvent) => {
      try {
        const { dataUrl } = JSON.parse(e.data as string) as { dataUrl: string };
        if (dataUrl) onFrameRef.current(dataUrl);
      } catch { /* 무시 */ }
    };
    return () => es.close();
  }, []);
}
