"use client";

import { useEffect, useRef, useState } from "react";
import { useFrameReceiver } from "@/hooks/useSceneSync";

export default function OutputPage() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const hasFrameRef = useRef(false);
  const [hasFrame, setHasFrame] = useState(false);

  useFrameReceiver((dataUrl) => {
    if (imgRef.current) {
      imgRef.current.src = dataUrl;
    }
    if (!hasFrameRef.current) {
      hasFrameRef.current = true;
      setHasFrame(true);
    }
  });

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden", position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
      {!hasFrame && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.3)", fontSize: "1.2rem",
        }}>
          대기 중...
        </div>
      )}
    </div>
  );
}
