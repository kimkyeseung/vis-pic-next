"use client";

import { useEffect, useRef } from "react";
import { useFrameSender } from "@/hooks/useSceneSync";

/**
 * 헤드리스 카메라 송출 컴포넌트.
 * UI 없이 카메라를 열고 서브 화면으로 프레임을 보낸다.
 * CameraSection이 활성화되지 않은 스텝(결제·프레임 선택·배경 선택·완료 등)에서 사용.
 */
export function CameraStreamer({ enabled }: { enabled: boolean }) {
  const frameChannelRef = useFrameSender(enabled);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let animFrame = 0;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => {
        stream = s;
        video.srcObject = s;

        const tick = () => {
          animFrame = requestAnimationFrame(tick);
          if (video.readyState < 2 || !video.videoWidth) return;

          const w = video.videoWidth;
          const h = video.videoHeight;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;

          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, w, h);
          ctx.restore();

          const now = performance.now();
          if (frameChannelRef.current && now - lastSentRef.current > 100) {
            lastSentRef.current = now;
            frameChannelRef.current.postMessage({
              type: "frame",
              dataUrl: canvas.toDataURL("image/jpeg", 0.5),
            });
          }
        };

        animFrame = requestAnimationFrame(tick);
      })
      .catch(() => {});

    return () => {
      cancelAnimationFrame(animFrame);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [enabled, frameChannelRef]);

  return null;
}
