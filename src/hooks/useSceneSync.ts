"use client";

import { useEffect, useRef, useCallback } from "react";
import type { SceneState } from "@/types";

const CHANNEL_NAME = "scene-sync";

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
