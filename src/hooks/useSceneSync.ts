"use client";

import { useEffect, useRef, useCallback } from "react";
import type { SceneState } from "@/types";

const CHANNEL_NAME = "scene-sync";

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
  onFrameRef.current = onFrame;

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

type SyncMessage =
  | { type: "state"; payload: SceneState }
  | { type: "request-state" };

export function useSceneSyncSender(enabled: boolean) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const latestStateRef = useRef<SceneState | null>(null);

  useEffect(() => {
    if (!enabled) {
      channelRef.current?.close();
      channelRef.current = null;
      return;
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    // 서브 창이 늦게 열린 경우 현재 상태를 요청할 수 있도록 응답
    channel.onmessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data.type === "request-state" && latestStateRef.current) {
        channel.postMessage({ type: "state", payload: latestStateRef.current } satisfies SyncMessage);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [enabled]);

  return useCallback((state: SceneState) => {
    latestStateRef.current = state;
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "state", payload: state } satisfies SyncMessage);
    }
  }, []);
}

export function useSceneSyncReceiver(onState: (state: SceneState) => void) {
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data.type === "state") {
        onStateRef.current(e.data.payload);
      }
    };

    // 마운트 시 현재 상태 요청
    channel.postMessage({ type: "request-state" } satisfies SyncMessage);

    return () => channel.close();
  }, []);
}
