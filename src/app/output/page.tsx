"use client";

import { useEffect, useRef, useState } from "react";
import { useFrameReceiver } from "@/hooks/useSceneSync";

export default function OutputPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);

  useFrameReceiver((bitmap) => {
    const canvas = canvasRef.current;
    if (!canvas) { bitmap.close(); return; }
    if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
    if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    if (!hasFrame) setHasFrame(true);
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
