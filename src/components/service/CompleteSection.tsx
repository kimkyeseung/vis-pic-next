"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { BGImage } from "@/types";
import { FRAME_INFO, FALLBACK_BACKGROUNDS } from "@/constants/frames";
import { roundRect, fillGradient, fillGradientFromCSS, loadImage, resizeForGif, stripDataUriPrefix, drawImageCover } from "@/lib/canvas";
import { resolveImageSrc } from "@/lib/imageUrl";
import {
  computePrintLayout,
  modeSettingPrefix,
  parseCm,
  getPaperDimensions,
  FRAME_CORNER_RADIUS_CM,
  FRAME_BORDER_CM,
  FRAME_BORDER_COLOR,
} from "@/lib/printLayout";
import { useLanguage } from "@/i18n/LanguageContext";
import { ServiceNav } from "./ServiceNav";

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
  selectedPrintBg,
  printBgImages,
  preparedPhotoUrl,
  preparedGifUrl,
  preparedExpiryDate,
  printQuantity = 1,
  onPrev,
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
  selectedPrintBg?: number | null;
  printBgImages?: BGImage[];
  preparedPhotoUrl?: string | null;
  preparedGifUrl?: string | null;
  preparedExpiryDate?: string | null;
  /** 결제 화면에서 선택한 인쇄 매수. 이 수만큼 출력한다. */
  printQuantity?: number;
  /** 이전 단계로 이동 (좌하단 "이전") */
  onPrev: () => void;
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

  // 가로 결과물(1컷·4컷 등 landscape)일 때, QR 카드 영역의 상·하단을 결과물 프레임과
  // 정확히 일치시키기 위해 프레임 높이를 측정해 카드 블록에 강제한다(세로 결과물은 제외).
  const isLandscapeResult = (FRAME_INFO[selectedFrame]?.orientation ?? "landscape") !== "portrait";
  const sectionRef = useRef<HTMLElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewH, setPreviewH] = useState<number | null>(null);
  // 세로 레이아웃(상하 스택)이면 QR 높이 일치를 적용하지 않는다. 실제 세로 뷰포트뿐 아니라
  // 관리자 미리보기(.force-portrait 조상)도 세로로 간주한다(미디어쿼리로는 감지 못 함).
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    // offsetHeight는 CSS transform(미리보기 스테이지의 scale)의 영향을 받지 않는 레이아웃
    // 높이를 돌려준다. getBoundingClientRect().height는 축소된 높이라 미리보기에서 카드가
    // 과도하게 낮아져 QR이 비정상 축소됐다.
    const ro = new ResizeObserver(() => setPreviewH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [compositeImage, printStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setStacked(mq.matches || !!sectionRef.current?.closest(".force-portrait"));
    update();
    mq.addEventListener("change", update);
    // 미리보기에서 방향 토글 시 스테이지 크기가 바뀌므로 리사이즈로도 재평가한다.
    const ro = new ResizeObserver(update);
    if (sectionRef.current) ro.observe(sectionRef.current);
    return () => { mq.removeEventListener("change", update); ro.disconnect(); };
  }, []);

  const matchHeight = isLandscapeResult && !stacked && previewH != null;

  // QR 다운로드 카드 1개 렌더. matchHeight면 카드가 프레임 높이에 stretch되고 QR이 남은
  // 세로 공간에 맞춰 반응형으로 축소된다(라벨은 고정, QR 박스만 flex-1로 늘고 줆).
  const renderQRCard = (url: string, emoji: string, label: string) => (
    // 세로(portrait)에선 카드를 좌우로 꽉 채우고(flex-1) QR·라벨을 키운다(시안 대응).
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 text-center flex flex-col items-center min-w-0 portrait:flex-1">
      <div className="text-3xl portrait:text-5xl mb-2 shrink-0">{emoji}</div>
      <p className="text-white text-xl portrait:text-3xl font-semibold mb-4 portrait:mb-6 shrink-0">{label}</p>
      <div
        className={`bg-white p-4 rounded-xl cursor-pointer ${matchHeight ? "flex-1 min-h-0 w-full flex items-center justify-center" : "portrait:w-full portrait:flex portrait:items-center portrait:justify-center"}`}
        onDoubleClick={() => openDebugUrl(url)}
      >
        {matchHeight ? (
          // 남은 세로 공간에 맞춰 축소(라벨은 고정). 과대·가로 오버플로 방지로 상한 200px.
          <QRCodeSVG value={url} size={180} className="h-full w-auto max-h-[200px] max-w-full" style={{ aspectRatio: "1 / 1" }} />
        ) : (
          // 가로: 고정 180px. 세로: 카드 폭에 맞춰 확대(상한 300px).
          <QRCodeSVG value={url} size={180} className="portrait:h-auto portrait:w-full portrait:max-w-[300px]" style={{ aspectRatio: "1 / 1" }} />
        )}
      </div>
      <p className="text-gray-400 text-sm portrait:text-lg mt-3 shrink-0">{t("complete.qrScan")}</p>
    </div>
  );

  const toFullUrl = (url: string) =>
    url.startsWith("http") ? url : window.location.origin + url;

  // QR 더블클릭 디버깅용. 브라우저에서만 새 창이 열린다 —
  // Tauri(WebView2)는 window.open 새 창을 차단하며, 키오스크에서
  // 브라우저가 열리면 안 되므로 의도된 동작이다.
  const openDebugUrl = (url: string) => {
    window.open(url, "_blank");
  };


  const uploadForQR = async (dataUrl: string, bgImageData?: string | null, printBgFilename?: string | null) => {
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
            const { pw, ph } = getPaperDimensions(paperWCm, paperHCm, frame.orientation);

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
                duration: 100, // 10fps — 중간 프레임이 ~180ms 간격으로 캡처됨
                background_color: "#ffffff",
                background_image: printBgFilename || printSettings.PRINT_BACKGROUND || null,
                // 합성 사진과 동일한 배경(선택 배경/그라디언트 포함)과
                // 프레임 스타일(둥근 모서리·테두리)을 GIF에도 적용
                background_image_data: bgImageData || null,
                corner_radius: Math.round(FRAME_CORNER_RADIUS_CM * gifScale),
                border_width: Math.max(1, Math.round(FRAME_BORDER_CM * gifScale)),
                border_color: FRAME_BORDER_COLOR,
                canvas_width: gifCanvasW,
                canvas_height: gifCanvasH,
                start_x: startX,
                start_y: startY,
              }),
            });
            const gifData = await gifRes.json();
            if (gifData.success && gifData.gif_url) {
              setQrGifUrl(toFullUrl(gifData.gif_url));
              if (gifData.expiry_date) {
                setQrExpiryDate((prev) => prev ?? gifData.expiry_date);
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
    // 중간 프레임 GIF는 10fps, 완성 사진 나열 GIF는 0.8초 간격
    const gifDuration = allFrames.length >= 2 ? 100 : 800;

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
          if (gifData.expiry_date) {
            setQrExpiryDate((prev) => prev ?? gifData.expiry_date);
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
    const { pw, ph } = getPaperDimensions(paperWCm, paperHCm, frame.orientation);

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

    // 프레임(인쇄 배경) 디자인은 가로(landscape) 기준으로 제작되므로, 세로 용지 모드
    // (2컷 등 orientation="portrait")에서는 90° 회전해 용지 방향에 맞춘다. 슬롯 좌표는
    // 이미 용지 방향 기준으로 계산되므로 프레임 이미지만 회전한다(FramedPreview와 동일 규칙).
    const drawFrameCover = (img: HTMLImageElement, focalX = 0.5, focalY = 0.5) => {
      if (frame.orientation === "portrait") {
        ctx.save();
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate(Math.PI / 2);
        drawImageCover(ctx, img, -canvasHeight / 2, -canvasWidth / 2, canvasHeight, canvasWidth, focalX, focalY);
        ctx.restore();
      } else {
        drawImageCover(ctx, img, 0, 0, canvasWidth, canvasHeight, focalX, focalY);
      }
    };

    // Background priority: user-selected print bg > PRINT_BACKGROUND setting > user AR bg > fallback gradient
    let bgDrawn = false;

    // 1. User-selected print background / 프레임 (imageType=2)
    const printBgInfo = selectedPrintBg != null
      ? (printBgImages || []).find((b) => b.id === selectedPrintBg)
      : null;
    if (printBgInfo) {
      try {
        const bgImg = await loadImage(`${imageBaseUrl}/${printBgInfo.filename}`);
        drawFrameCover(bgImg, printBgInfo.focalX ?? 0.5, printBgInfo.focalY ?? 0.5);
        bgDrawn = true;
      } catch {
        // fall through
      }
    }

    // 2. Legacy single PRINT_BACKGROUND setting (fallback when no print bg images)
    if (!bgDrawn && printSettings.PRINT_BACKGROUND) {
      try {
        const bgImg = await loadImage(resolveImageSrc(printSettings.PRINT_BACKGROUND, imageBaseUrl));
        drawFrameCover(bgImg);
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
          drawImageCover(ctx, bgImg, 0, 0, canvasWidth, canvasHeight);
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

    // 배경만 그려진 상태 스냅샷 — 레이아웃 GIF가 같은 배경을 쓰도록 전달
    const bgOnlyDataUrl = canvas.toDataURL("image/jpeg", 0.8);

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
        roundRect(ctx, x, y, w, h, FRAME_CORNER_RADIUS_CM * cmToPx);
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

        ctx.strokeStyle = FRAME_BORDER_COLOR;
        ctx.lineWidth = FRAME_BORDER_CM * cmToPx;
        roundRect(ctx, x, y, w, h, FRAME_CORNER_RADIUS_CM * cmToPx);
        ctx.stroke();
      } catch (err) {
        console.error(`[createComposite] 사진 ${i} 로드 실패:`, err);
      }
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setCompositeImage(dataUrl);

    await uploadForQR(dataUrl, bgOnlyDataUrl, printBgInfo?.filename ?? null);
    setPrintStatus("ready");
  };

  useEffect(() => {
    // hasPreparedImage인 경우 초기 상태가 이미 "ready"이므로 setState 불필요
    if (hasPreparedImage) return;
    if (!compositeRef.current) {
      compositeRef.current = true;
      createComposite();
    }
    // 마운트 시 1회만 합성 (compositeRef로 중복 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          body: JSON.stringify({ images: resized, duration: frames.length >= 2 ? 100 : 800 }),
        });
        const data = await res.json();
        if (data.success && data.gif_url) {
          setQrGifUrl(toFullUrl(data.gif_url));
          if (data.expiry_date) setQrExpiryDate((prev) => prev ?? data.expiry_date);
        }
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPreparedImage]);

  const handlePrint = async () => {
    if (!compositeImage) return;
    setPrintStatus("printing");

    // 결제 화면에서 고른 매수만큼 출력 (최소 1장)
    const copies = Math.max(1, Math.floor(printQuantity || 1));
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const base64 = stripDataUriPrefix(compositeImage);
        const printerName = printSettings.PRINTER_NAME || "";
        await invoke("print_image", { printerName, imageData: base64, copies });
        setPrintStatus("done");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Print failed:", msg);
        setPrintError(msg);
        setPrintStatus("error");
      }
    } else {
      const style = document.createElement("style");
      // 인쇄 용지 방향을 합성물(프레임) 방향에 맞춘다 — 4컷·1컷 등 가로 프레임은 landscape.
      const pageOrient = (selectedFrame && FRAME_INFO[selectedFrame]?.orientation === "portrait") ? "portrait" : "landscape";
      // @page margin:0 → 브라우저가 붙이는 머리글/바닥글(날짜·제목·URL·쪽번호) 제거.
      // kiosk-printing(무음 인쇄) 모드에서도 여백 없이 이미지만 출력된다.
      style.textContent = `@page { size: ${pageOrient}; margin: 0; } @media print { html, body { margin: 0 !important; padding: 0 !important; } body > * { display: none !important; } #__print_target__ { display: block !important; position: fixed; inset: 0; background: #fff; } #__print_target__ img { width: 100%; height: 100%; object-fit: contain; } }`;

      const container = document.createElement("div");
      container.id = "__print_target__";
      container.style.display = "none";
      const img = document.createElement("img");
      img.src = compositeImage;
      container.appendChild(img);

      document.head.appendChild(style);
      document.body.appendChild(container);
      // 브라우저 폴백: 무음 인쇄(kiosk-printing) 환경에서 매수만큼 반복 호출
      for (let i = 0; i < copies; i++) window.print();
      document.head.removeChild(style);
      document.body.removeChild(container);
      setPrintStatus("done");
    }
  };

  return (
    <section ref={sectionRef} className="w-full h-full flex flex-col items-center justify-center relative z-10">
      <div className="text-center animate-fadeInUp portrait:w-full portrait:px-6">
        {printStatus === "compositing" && (
          <>
            <div className="w-20 h-20 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white text-2xl">{t("complete.compositing")}</p>
          </>
        )}

        {(printStatus === "ready" || printStatus === "done") && compositeImage && (
          <>
            <h2 className="text-title portrait:text-5xl break-keep font-extrabold text-white mb-4 portrait:mb-8 animate-fadeInDown" style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}>
              {printStatus === "done" ? t("complete.done") : t("complete.ready")}
            </h2>

            {/* 좌우 반반(12컬럼 6/6): 미리보기 | QR. 세로에선 상하 스택.
                가로 결과물(matchHeight)에선 QR 카드 상·하단을 프레임에 맞추려 상단 정렬. */}
            <div className={`flex justify-center gap-10 mb-6 w-full max-w-6xl portrait:flex-col portrait:items-center portrait:gap-8 portrait:w-full ${matchHeight ? "items-start" : "items-center"}`}>
              <div className="flex-1 flex justify-center min-w-0 portrait:w-full">
                <div ref={previewBoxRef} className="rounded-2xl overflow-hidden" style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
                  <img src={compositeImage} alt="Composite" className="max-h-[54vh] portrait:max-h-[46vh] portrait:max-w-full w-auto object-contain block" />
                </div>
              </div>

              {(qrPhotoUrl || qrGifUrl) && (
                <div className="flex-1 flex flex-col items-center gap-6 min-w-0 portrait:w-full">
                  {/* matchHeight면 카드 블록 높이를 프레임 높이로 고정 → 카드가 stretch되어 상·하단 일치 */}
                  <div className="flex gap-6 portrait:gap-4 max-w-full portrait:w-full" style={matchHeight ? { height: previewH ?? undefined } : undefined}>
                    {qrPhotoUrl && renderQRCard(qrPhotoUrl, "📷", t("complete.photoDl"))}
                    {qrGifUrl && renderQRCard(qrGifUrl, "🎬", t("complete.gifDl"))}
                  </div>

                  {qrExpiryDate && (
                    <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full text-sm">
                      <span>⏰</span>
                      <span className="text-gray-300">
                        {t("complete.expiry")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {printStatus === "done" && (
              <p className="text-gray-400 text-lg">{t("complete.printDone")}</p>
            )}

            {/* 하단 모서리 버튼 (시안): 이전(좌하단) / 인화하기(우하단) */}
            {printStatus === "ready" && (
              <ServiceNav onPrev={onPrev} onNext={handlePrint} nextKey="complete.print" />
            )}
            {printStatus === "done" && (
              <div className="absolute bottom-16 right-16 z-20 portrait:bottom-10 portrait:right-10">
                <button className="service-button nav-button nav-next-lg" onClick={onRestart}>
                  {t("complete.restart")}
                </button>
              </div>
            )}
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
