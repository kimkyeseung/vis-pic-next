"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BGImage } from "@/types";
import { FRAME_INFO, FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { roundRect, fillGradient, fillGradientFromCSS, loadImage, resizeForGif } from "@/lib/canvas";
import { computePrintLayout, modeSettingPrefix, parseCm } from "@/lib/printLayout";
import { useLanguage } from "@/i18n/LanguageContext";

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
  const { t } = useLanguage();
  const hasPreparedImage = Boolean(compositeImage && preparedPhotoUrl);
  const [printStatus, setPrintStatus] = useState<"compositing" | "ready" | "printing" | "done" | "error">(
    hasPreparedImage ? "ready" : "compositing",
  );
  const [printError, setPrintError] = useState<string | null>(null);
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
      const modePrefix = modeSettingPrefix(selectedFrame);
      const photoWCm = parseCm(printSettings[modePrefix + "WIDTH"]);
      const photoHCm = parseCm(printSettings[modePrefix + "HEIGHT"]);

      if (photoWCm && photoHCm) {
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

            const hGapCm = parseCm(printSettings[modePrefix + "HGAP"]) ?? 0;
            const vGapCm = parseCm(printSettings[modePrefix + "VGAP"]) ?? 0;
            const photoWPx = Math.round(photoWCm * gifScale);
            const photoHPx = Math.round(photoHCm * gifScale);
            const hGapPx = Math.round(hGapCm * gifScale);
            const vGapPx = Math.round(vGapCm * gifScale);

            // 4방향 여백·중앙 정렬을 포함한 시작 좌표는 공용 레이아웃 계산과 동일하게
            const layout = computePrintLayout({
              frame,
              mode: selectedFrame,
              paperW: pw,
              paperH: ph,
              settings: printSettings,
            });
            const startX = Math.round(layout.slots[0].x * gifScale);
            const startY = Math.round(layout.slots[0].y * gifScale);

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

    // Calculate photo slot positions — 관리자 미리보기와 동일한 공용 레이아웃 계산 사용
    const layout = computePrintLayout({
      frame,
      mode: selectedFrame,
      paperW: pw,
      paperH: ph,
      settings: printSettings,
    });
    const cmToPx = canvasWidth / pw;
    const slots = layout.slots.map((s) => ({
      x: s.x * cmToPx,
      y: s.y * cmToPx,
      w: s.w * cmToPx,
      h: s.h * cmToPx,
    }));

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
        await invoke("print_image", { printerName, imageData: base64 });
        setPrintStatus("done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Print failed:", msg);
        setPrintError(msg);
        setPrintStatus("error");
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
      setPrintStatus("done");
    }
  };

  return (
    <section className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInUp">
        {printStatus === "compositing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">{t("complete.compositing")}</p>
          </>
        )}

        {(printStatus === "ready" || printStatus === "done") && compositeImage && (
          <>
            <h2 className="text-5xl font-extrabold text-white mb-6" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
              {printStatus === "done" ? t("complete.done") : t("complete.ready")}
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
                        <p className="text-white font-semibold mb-3">{t("complete.photoDl")}</p>
                        <div
                          className="bg-white p-3 rounded-xl cursor-pointer"
                          onDoubleClick={() => window.open(qrPhotoUrl, "_blank")}
                        >
                          <QRCodeSVG value={qrPhotoUrl} size={120} />
                        </div>
                        <p className="text-gray-400 text-xs mt-2">{t("complete.qrScan")}</p>
                      </div>
                    )}
                    {qrGifUrl && (
                      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center">
                        <div className="text-2xl mb-1">🎬</div>
                        <p className="text-white font-semibold mb-3">{t("complete.gifDl")}</p>
                        <div
                          className="bg-white p-3 rounded-xl cursor-pointer"
                          onDoubleClick={() => window.open(qrGifUrl, "_blank")}
                        >
                          <QRCodeSVG value={qrGifUrl} size={120} />
                        </div>
                        <p className="text-gray-400 text-xs mt-2">{t("complete.qrScan")}</p>
                      </div>
                    )}
                  </div>

                  {qrExpiryDate && (
                    <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full text-sm">
                      <span>⏰</span>
                      <span className="text-gray-300">
                        {t("complete.expiry", { date: qrExpiryDate })}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {printStatus === "ready" && (
              <div className="flex gap-6 justify-center mb-8">
                <button className="service-button nav-button" onClick={handlePrint}>
                  &#128424; {t("complete.print")}
                </button>
              </div>
            )}

            {printStatus === "done" && (
              <p className="text-gray-400 text-lg mb-8">{t("complete.printDone")}</p>
            )}

            <button
              className="service-button touch-button"
              style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }}
              onClick={onRestart}
            >
              {t("complete.restart")}
            </button>
          </>
        )}

        {printStatus === "printing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-green-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">{t("complete.printing")}</p>
          </>
        )}

        {printStatus === "error" && (
          <>
            <p className="text-red-400 text-xl mb-4">{t("complete.printError")}</p>
            {printError && (
              <p className="text-red-300 text-sm mb-8 font-mono bg-black/40 px-4 py-2 rounded max-w-lg break-all">{printError}</p>
            )}
            <button className="service-button nav-button" onClick={handlePrint}>
              {t("common.retry")}
            </button>
            <button className="service-button touch-button mt-6" style={{ width: "auto", minHeight: "auto", padding: "25px 60px", fontSize: "1.5em" }} onClick={onRestart}>
              {t("complete.restart")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
