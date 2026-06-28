"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BGImage } from "@/types";
import { FRAME_INFO, FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { roundRect, fillGradient, fillGradientFromCSS, loadImage, resizeForGif } from "@/lib/canvas";

export function CompleteSection({
  photos,
  selectedPhotos,
  selectedFrame,
  selectedBackground,
  backgroundImages,
  imageBaseUrl,
  compositeImage,
  setCompositeImage,
  intermediateFrames,
  printSettings,
  preparedPhotoUrl,
  preparedGifUrl,
  preparedExpiryDate,
  onRestart,
}: {
  photos: string[];
  selectedPhotos: number[];
  selectedFrame: string;
  selectedBackground: number | null;
  backgroundImages: BGImage[];
  imageBaseUrl: string;
  compositeImage: string | null;
  setCompositeImage: (img: string | null) => void;
  intermediateFrames: string[][];
  printSettings: Record<string, string>;
  preparedPhotoUrl?: string | null;
  preparedGifUrl?: string | null;
  preparedExpiryDate?: string | null;
  onRestart: () => void;
}) {
  const hasPreparedImage = Boolean(compositeImage && preparedPhotoUrl);
  const [printStatus, setPrintStatus] = useState<"compositing" | "ready" | "printing" | "done" | "error">(
    hasPreparedImage ? "ready" : "compositing",
  );
  const [qrPhotoUrl, setQrPhotoUrl] = useState<string | null>(preparedPhotoUrl ?? null);
  const [qrGifUrl, setQrGifUrl] = useState<string | null>(preparedGifUrl ?? null);
  const [qrExpiryDate, setQrExpiryDate] = useState<string | null>(preparedExpiryDate ?? null);
  const compositeRef = useRef(false);

  const toFullUrl = (url: string) =>
    url.startsWith("http") ? url : window.location.origin + url;

  const resolveImageUrl = (value: string, baseUrl: string) => {
    if (!value) return "";
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    if (value.startsWith("/")) return value;
    // strip any accidental path prefix (e.g. "static/images/file.jpg")
    const filename = value.split("/").pop()!;
    return `${baseUrl}/${filename}`;
  };

  const uploadForQR = async (dataUrl: string) => {
    let photoUrl: string | null = null;

    try {
      const res = await fetch("/api/print/upload-image/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: dataUrl, image_type: "photo" }),
      });
      const data = await res.json();
      if (data.success && data.image_url) {
        photoUrl = toFullUrl(data.image_url);
        setQrPhotoUrl(photoUrl);
        setQrExpiryDate(data.expiry_date);
      }
    } catch {
      // photo upload failed silently
    }

    const frame = FRAME_INFO[selectedFrame];
    const selectedIndices = selectedPhotos;

    // Try layout GIF for multi-slot frames with admin settings
    if (frame && frame.count > 1) {
      const modePrefix = `MODE_${selectedFrame.replace("x", "_")}_`;
      const photoWCm = parseFloat(printSettings[modePrefix + "WIDTH"] || "0");
      const photoHCm = parseFloat(printSettings[modePrefix + "HEIGHT"] || "0");

      if (photoWCm > 0 && photoHCm > 0) {
        const intermediatePictures: Record<string, string[]> = {};
        selectedIndices.forEach((photoIdx, slotIdx) => {
          const frames = intermediateFrames[photoIdx];
          if (frames && frames.length > 0) {
            intermediatePictures[`position_${slotIdx}`] = frames;
          }
        });

        if (Object.keys(intermediatePictures).length >= 2) {
          try {
            const paperWCm = parseFloat(printSettings.PICTURE_WIDTH || "10");
            const paperHCm = parseFloat(printSettings.PICTURE_HEIGHT || "15");
            const longer = Math.max(paperWCm, paperHCm);
            const shorter = Math.min(paperWCm, paperHCm);
            const pw = frame.orientation === "landscape" ? longer : shorter;
            const ph = frame.orientation === "landscape" ? shorter : longer;

            const maxGifDim = 800;
            const gifScale = Math.min(maxGifDim / pw, maxGifDim / ph);
            const gifCanvasW = Math.round(pw * gifScale);
            const gifCanvasH = Math.round(ph * gifScale);

            const hGapCm = parseFloat(printSettings[modePrefix + "HGAP"] || "0");
            const vGapCm = parseFloat(printSettings[modePrefix + "VGAP"] || "0");
            const photoWPx = Math.round(photoWCm * gifScale);
            const photoHPx = Math.round(photoHCm * gifScale);
            const hGapPx = Math.round(hGapCm * gifScale);
            const vGapPx = Math.round(vGapCm * gifScale);

            const totalW = frame.cols * photoWPx + (frame.cols - 1) * hGapPx;
            const totalH = frame.rows * photoHPx + (frame.rows - 1) * vGapPx;
            const marginTopStr = printSettings[modePrefix + "MARGIN_TOP"];
            const marginLeftStr = printSettings[modePrefix + "MARGIN_LEFT"];
            const startX = marginLeftStr
              ? Math.round(parseFloat(marginLeftStr) * gifScale)
              : Math.round((gifCanvasW - totalW) / 2);
            const startY = marginTopStr
              ? Math.round(parseFloat(marginTopStr) * gifScale)
              : Math.round((gifCanvasH - totalH) / 2);

            const gifRes = await fetch("/api/gif/create-layout/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                intermediate_pictures: intermediatePictures,
                layout_cols: frame.cols,
                layout_rows: frame.rows,
                photo_width: photoWPx,
                photo_height: photoHPx,
                h_gap: hGapPx,
                v_gap: vGapPx,
                duration: 500,
                background_color: "#ffffff",
                background_image: printSettings.PRINT_BACKGROUND || null,
                canvas_width: gifCanvasW,
                canvas_height: gifCanvasH,
                start_x: startX,
                start_y: startY,
              }),
            });
            const gifData = await gifRes.json();
            if (gifData.success && gifData.gif_url) {
              setQrGifUrl(toFullUrl(gifData.gif_url));
              if (!qrExpiryDate && gifData.expiry_date) {
                setQrExpiryDate(gifData.expiry_date);
              }
              return;
            }
          } catch {
            // fall through to simple GIF
          }
        }
      }
    }

    // Simple GIF fallback
    const allFrames = selectedIndices
      .flatMap((i) => intermediateFrames[i] || [])
      .filter(Boolean);
    const gifSources =
      allFrames.length >= 2
        ? allFrames
        : selectedIndices.map((i) => photos[i]).filter(Boolean);
    const gifDuration = allFrames.length >= 2 ? 500 : 800;

    if (gifSources.length >= 2) {
      try {
        const resizedImages = await Promise.all(
          gifSources.map((src) => resizeForGif(src, 800))
        );
        const gifRes = await fetch("/api/gif/create/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: resizedImages, duration: gifDuration }),
        });
        const gifData = await gifRes.json();
        if (gifData.success && gifData.gif_url) {
          setQrGifUrl(toFullUrl(gifData.gif_url));
          if (!qrExpiryDate && gifData.expiry_date) {
            setQrExpiryDate(gifData.expiry_date);
          }
        } else if (photoUrl) {
          setQrGifUrl(photoUrl);
        }
      } catch {
        if (photoUrl) setQrGifUrl(photoUrl);
      }
    } else if (photoUrl) {
      setQrGifUrl(photoUrl);
    }
  };

  const createComposite = async () => {
    const frame = FRAME_INFO[selectedFrame];
    if (!frame) return;

    const basePx = 1800;

    const paperWCm = parseFloat(printSettings.PICTURE_WIDTH || "10");
    const paperHCm = parseFloat(printSettings.PICTURE_HEIGHT || "15");
    const longer = Math.max(paperWCm, paperHCm);
    const shorter = Math.min(paperWCm, paperHCm);
    const pw = frame.orientation === "landscape" ? longer : shorter;
    const ph = frame.orientation === "landscape" ? shorter : longer;

    let canvasWidth: number, canvasHeight: number;
    if (pw >= ph) {
      canvasWidth = basePx;
      canvasHeight = Math.round(basePx * (ph / pw));
    } else {
      canvasHeight = basePx;
      canvasWidth = Math.round(basePx * (pw / ph));
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d")!;

    // Background: PRINT_BACKGROUND > user-selected > fallback gradient
    let bgDrawn = false;
    if (printSettings.PRINT_BACKGROUND) {
      try {
        const bgImg = await loadImage(resolveImageUrl(printSettings.PRINT_BACKGROUND, imageBaseUrl));
        ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
        bgDrawn = true;
      } catch {
        // fall through
      }
    }

    if (!bgDrawn) {
      const bgInfo = selectedBackground !== null && selectedBackground > 0
        ? backgroundImages.find((b) => b.id === selectedBackground)
        : null;

      if (bgInfo) {
        try {
          const bgImg = await loadImage(`${imageBaseUrl}/${bgInfo.filename}`);
          ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight);
        } catch {
          fillGradient(ctx, canvasWidth, canvasHeight);
        }
      } else {
        const fb = FALLBACK_BACKGROUNDS.find((b) => b.id === selectedBackground);
        if (fb) {
          fillGradientFromCSS(ctx, canvasWidth, canvasHeight, fb.gradient);
        } else {
          fillGradient(ctx, canvasWidth, canvasHeight);
        }
      }
    }

    // Calculate photo slot positions
    const slots: { x: number; y: number; w: number; h: number }[] = [];
    const modePrefix = `MODE_${selectedFrame.replace("x", "_")}_`;
    const photoWCm = parseFloat(printSettings[modePrefix + "WIDTH"] || "0");
    const photoHCm = parseFloat(printSettings[modePrefix + "HEIGHT"] || "0");

    if (photoWCm > 0 && photoHCm > 0) {
      const cmToPx = canvasWidth / pw;
      const cellW = photoWCm * cmToPx;
      const cellH = photoHCm * cmToPx;
      const hGapPx = parseFloat(printSettings[modePrefix + "HGAP"] || "0") * cmToPx;
      const vGapPx = parseFloat(printSettings[modePrefix + "VGAP"] || "0") * cmToPx;

      const totalW = frame.cols * cellW + (frame.cols - 1) * hGapPx;
      const totalH = frame.rows * cellH + (frame.rows - 1) * vGapPx;

      const marginTopStr = printSettings[modePrefix + "MARGIN_TOP"];
      const marginLeftStr = printSettings[modePrefix + "MARGIN_LEFT"];
      const startX = marginLeftStr !== undefined
        ? parseFloat(marginLeftStr) * cmToPx
        : (canvasWidth - totalW) / 2;
      const startY = marginTopStr !== undefined
        ? parseFloat(marginTopStr) * cmToPx
        : (canvasHeight - totalH) / 2;

      for (let i = 0; i < frame.count; i++) {
        const col = i % frame.cols;
        const row = Math.floor(i / frame.cols);
        slots.push({
          x: startX + col * (cellW + hGapPx),
          y: startY + row * (cellH + vGapPx),
          w: cellW,
          h: cellH,
        });
      }
    } else {
      // Fallback: padding-based layout
      const padding = 20;
      const allocW = (canvasWidth - padding * (frame.cols + 1)) / frame.cols;
      const allocH = (canvasHeight - padding * (frame.rows + 1)) / frame.rows;
      const photoRatio = 4 / 3;
      let cellW: number, cellH: number;
      if (allocW / allocH > photoRatio) {
        cellH = allocH;
        cellW = cellH * photoRatio;
      } else {
        cellW = allocW;
        cellH = cellW / photoRatio;
      }

      for (let i = 0; i < frame.count; i++) {
        const col = i % frame.cols;
        const row = Math.floor(i / frame.cols);
        const ax = padding + col * (allocW + padding);
        const ay = padding + row * (allocH + padding);
        slots.push({
          x: ax + (allocW - cellW) / 2,
          y: ay + (allocH - cellH) / 2,
          w: cellW,
          h: cellH,
        });
      }
    }

    // Draw photos in slots
    for (let i = 0; i < selectedPhotos.length && i < slots.length; i++) {
      const photo = photos[selectedPhotos[i]];
      if (!photo) {
        continue;
      }
      const { x, y, w, h } = slots[i];

      try {
        // data: URL은 fetch+createImageBitmap 방식이 crossOrigin 문제 없이 더 안정적
        let img: HTMLImageElement | ImageBitmap;
        if (photo.startsWith("data:")) {
          try {
            const res = await fetch(photo);
            const blob = await res.blob();
            img = await createImageBitmap(blob);
          } catch {
            img = await loadImage(photo);
          }
        } else {
          img = await loadImage(photo);
        }

        ctx.save();
        roundRect(ctx, x, y, w, h, 12);
        ctx.clip();

        const imgAspect = img.width / img.height;
        const cellAspect = w / h;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (imgAspect > cellAspect) {
          sw = img.height * cellAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / cellAspect;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        ctx.restore();

        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 3;
        roundRect(ctx, x, y, w, h, 12);
        ctx.stroke();
      } catch (err) {
        console.error(`[createComposite] 사진 ${i} 로드 실패:`, err);
      }
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setCompositeImage(dataUrl);

    await uploadForQR(dataUrl);
    setPrintStatus("ready");
  };

  useEffect(() => {
    if (hasPreparedImage) {
      setPrintStatus("ready");
      return;
    }
    if (!compositeRef.current) {
      compositeRef.current = true;
      createComposite();
    }
  }, []);

  // hasPreparedImage 경로에서 GIF 생성이 실패한 경우 fallback 시도
  useEffect(() => {
    if (!hasPreparedImage || qrGifUrl) return;

    const frames = selectedPhotos.flatMap((i) => intermediateFrames[i] || []).filter(Boolean);
    const sources = frames.length >= 2
      ? frames
      : selectedPhotos.map((i) => photos[i]).filter(Boolean);

    if (sources.length < 2) return;

    (async () => {
      try {
        const resized = await Promise.all(sources.map((src) => resizeForGif(src, 800)));
        const res = await fetch("/api/gif/create/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: resized, duration: 500 }),
        });
        const data = await res.json();
        if (data.success && data.gif_url) {
          setQrGifUrl(toFullUrl(data.gif_url));
          if (!qrExpiryDate && data.expiry_date) setQrExpiryDate(data.expiry_date);
        }
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPreparedImage]);

  const handlePrint = async () => {
    if (!compositeImage) return;
    setPrintStatus("printing");

    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const base64 = compositeImage.replace(/^data:image\/\w+;base64,/, "");
        const printerName = printSettings.PRINTER_NAME || "";
        await invoke("print_image", { printer_name: printerName, image_data: base64 });
      } catch (err) {
        console.error("Print failed:", err);
      }
    } else {
      const style = document.createElement("style");
      style.textContent = `@media print { body > * { display: none !important; } #__print_target__ { display: block !important; position: fixed; inset: 0; background: #fff; } #__print_target__ img { width: 100%; height: 100%; object-fit: contain; } }`;

      const container = document.createElement("div");
      container.id = "__print_target__";
      container.style.display = "none";
      const img = document.createElement("img");
      img.src = compositeImage;
      container.appendChild(img);

      document.head.appendChild(style);
      document.body.appendChild(container);
      window.print();
      document.head.removeChild(style);
      document.body.removeChild(container);
    }

    setPrintStatus("done");
  };

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInUp">
        {printStatus === "compositing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">사진 합성 중...</p>
          </>
        )}

        {(printStatus === "ready" || printStatus === "done") && compositeImage && (
          <>
            <h2 className="text-5xl font-extrabold text-white mb-6" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
              {printStatus === "done" ? "완료!" : "사진이 완성되었습니다!"}
            </h2>

            <div className="flex items-start justify-center gap-12 mb-10">
              <div className="rounded-2xl overflow-hidden" style={{ maxWidth: "500px", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
                <img src={compositeImage} alt="Composite" className="w-full" />
              </div>

              {(qrPhotoUrl || qrGifUrl) && (
                <div className="flex flex-col items-center gap-6">
                  <div className="flex gap-6">
                    {qrPhotoUrl && (
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center">
                        <div className="text-2xl mb-1">📷</div>
                        <p className="text-white font-semibold mb-3">사진 다운로드</p>
                        <div
                          className="bg-white p-3 rounded-xl cursor-pointer"
                          onDoubleClick={() => window.open(qrPhotoUrl, "_blank")}
                        >
                          <QRCodeSVG value={qrPhotoUrl} size={120} />
                        </div>
                        <p className="text-gray-400 text-xs mt-2">QR 스캔</p>
                      </div>
                    )}
                    {qrGifUrl && (
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center">
                        <div className="text-2xl mb-1">🎬</div>
                        <p className="text-white font-semibold mb-3">GIF 다운로드</p>
                        <div
                          className="bg-white p-3 rounded-xl cursor-pointer"
                          onDoubleClick={() => window.open(qrGifUrl, "_blank")}
                        >
                          <QRCodeSVG value={qrGifUrl} size={120} />
                        </div>
                        <p className="text-gray-400 text-xs mt-2">QR 스캔</p>
                      </div>
                    )}
                  </div>

                  {qrExpiryDate && (
                    <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full text-sm">
                      <span>⏰</span>
                      <span className="text-gray-300">
                        <strong className="text-white">{qrExpiryDate}</strong> 까지 다운로드 가능
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {printStatus === "ready" && (
              <div className="flex gap-6 justify-center mb-8">
                <button className="service-button nav-button" onClick={handlePrint}>
                  &#128424; 인쇄하기
                </button>
              </div>
            )}

            {printStatus === "done" && (
              <p className="text-gray-400 text-lg mb-8">인쇄가 완료되었습니다</p>
            )}

            <button
              className="service-button touch-button"
              style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }}
              onClick={onRestart}
            >
              처음으로 돌아가기
            </button>
          </>
        )}

        {printStatus === "printing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">인쇄 중...</p>
          </>
        )}

        {printStatus === "error" && (
          <>
            <p className="text-red-400 text-xl mb-8">인쇄 중 오류가 발생했습니다</p>
            <button className="service-button nav-button" onClick={handlePrint}>
              다시 시도
            </button>
            <button className="service-button touch-button mt-6" style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }} onClick={onRestart}>
              처음으로 돌아가기
            </button>
          </>
        )}
      </div>
    </section>
  );
}
