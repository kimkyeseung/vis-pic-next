"use client";

import { useEffect, useRef } from "react";

export type FrameChannel = {
  /**
   * 캔버스 현재 내용을 JPEG로 인코딩해 output 페이지로 보낸다. 직전 프레임이 아직 전송 중이면
   * 이번 프레임은 버린다(false 반환) — 서버·네트워크가 느려져도 요청이 쌓이지 않게 한다.
   * 캔버스 비트맵은 호출 시점에 복사되므로, 호출 직후 같은 캔버스를 다시 써도 된다.
   */
  sendCanvas: (canvas: HTMLCanvasElement, quality: number) => boolean;
};

// ── 프레임 채널 (CameraSection → output 페이지) ─────────────────
// Next.js SSE API(/api/camera-frame)를 중계 서버로 사용한다.
// Tauri/브라우저 모두 동일하게 작동하며 BroadcastChannel/Tauri IPC 의존성이 없다.
//
// 인코딩은 toBlob(비동기)으로 해 메인 스레드(카메라 표시 루프)를 막지 않고, base64/JSON 없이
// JPEG 바이너리를 그대로 POST한다. 예전엔 toDataURL(동기 인코딩) + JSON 문자열로 보내
// 송출 프레임마다 표시 루프가 수십 ms씩 멈췄다.
export function useFrameSender(enabled: boolean) {
  const channelRef = useRef<FrameChannel | null>(null);

  useEffect(() => {
    if (!enabled) {
      channelRef.current = null;
      return;
    }
    let inFlight = false;
    let disposed = false;
    channelRef.current = {
      sendCanvas: (canvas, quality) => {
        if (inFlight) return false;
        inFlight = true;
        canvas.toBlob(
          (blob) => {
            if (!blob || disposed) { inFlight = false; return; }
            fetch("/api/camera-frame/", {
              method: "POST",
              headers: { "Content-Type": "image/jpeg" },
              body: blob,
            })
              .catch(() => {})
              .finally(() => { inFlight = false; });
          },
          "image/jpeg",
          quality,
        );
        return true;
      },
    };
    return () => {
      disposed = true;
      channelRef.current = null;
    };
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
