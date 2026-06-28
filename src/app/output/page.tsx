"use client";

import { useEffect, useRef, useState } from "react";
import { useFrameReceiver } from "@/hooks/useSceneSync";

export default function OutputPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);

  useFrameReceiver((dataUrl) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!imgRef.current) imgRef.current = new Image();
    const img = imgRef.current;
    img.onload = () => {
      if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
      if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      if (!hasFrame) setHasFrame(true);
    };
    img.src = dataUrl;
  });

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden", position: "relative" }}>
      <canvas
        ref={canvasRef}
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
