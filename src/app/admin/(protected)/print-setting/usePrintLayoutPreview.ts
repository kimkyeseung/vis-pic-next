"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FrameInfoEntry } from "@/types";
import { roundRect, drawImageCover } from "@/lib/canvas";
import {
  computePrintLayout,
  getPaperDimensions as paperDimensionsFor,
  type PrintLayout,
} from "@/lib/printLayout";

interface PrintBgImage {
  id: number;
  name: string;
  filename: string;
  focalX: number;
  focalY: number;
}

/**
 * 인쇄 배경 이미지는 가로(landscape) 기준으로 제작되므로, 세로 용지 모드(2컷 등
 * orientation="portrait")의 미리보기에서는 90° 회전해 용지 방향에 맞춘다
 * (CompleteSection.tsx의 drawFrameCover와 동일 규칙).
 */
function drawBgCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  ox: number, oy: number, drawW: number, drawH: number,
  isPortrait: boolean,
  focalX = 0.5, focalY = 0.5,
) {
  if (isPortrait) {
    ctx.save();
    ctx.translate(ox + drawW / 2, oy + drawH / 2);
    ctx.rotate(Math.PI / 2);
    drawImageCover(ctx, img, -drawH / 2, -drawW / 2, drawH, drawW, focalX, focalY);
    ctx.restore();
  } else {
    drawImageCover(ctx, img, ox, oy, drawW, drawH, focalX, focalY);
  }
}

/**
 * 인화 미리보기 캔버스(작은 카드 + 크게보기 모달) 렌더링과, 그 계산에 필요한 인화지 치수·레이아웃·
 * 용지 초과(overflow) 판정을 담당한다. 실제 설정값(용지 크기/모드/여백 등)은 `usePrintSettingsForm`이
 * 소유하며, 이 훅은 그 값들을 입력으로 받아 그리기만 한다 — 저장/로드 로직은 여기 없다.
 */
export function usePrintLayoutPreview({
  paperWidth,
  paperHeight,
  modes,
  previewMode,
  effectiveModeInfo,
  settings,
  printBgImages,
  resolveUrl,
}: {
  paperWidth: string;
  paperHeight: string;
  modes: string[];
  previewMode: string | null;
  effectiveModeInfo: Record<string, FrameInfoEntry>;
  settings: Record<string, string>;
  printBgImages: PrintBgImage[];
  resolveUrl: (filename: string) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showBigPreview, setShowBigPreview] = useState(false);

  const getPaperDimensions = useCallback((mode: string | null) => {
    const w = parseFloat(paperWidth) || 10;
    const h = parseFloat(paperHeight) || 15;
    const orient = mode && effectiveModeInfo[mode] ? effectiveModeInfo[mode].orientation : "portrait";
    return paperDimensionsFor(w, h, orient);
  }, [paperWidth, paperHeight, effectiveModeInfo]);

  const getPreviewLayout = useCallback((): PrintLayout | null => {
    if (!previewMode || !effectiveModeInfo[previewMode]) return null;
    const { pw, ph } = getPaperDimensions(previewMode);
    return computePrintLayout({
      frame: effectiveModeInfo[previewMode],
      mode: previewMode,
      paperW: pw,
      paperH: ph,
      settings,
    });
  }, [previewMode, settings, getPaperDimensions, effectiveModeInfo]);

  const overflowModes = useMemo(() => {
    const set = new Set<string>();
    for (const mode of modes) {
      if (!effectiveModeInfo[mode]) continue;
      const { pw, ph } = getPaperDimensions(mode);
      const layout = computePrintLayout({
        frame: effectiveModeInfo[mode],
        mode,
        paperW: pw,
        paperH: ph,
        settings,
      });
      if (layout.overflow) set.add(mode);
    }
    return set;
  }, [modes, effectiveModeInfo, settings, getPaperDimensions]);

  const drawSlots = useCallback((
    ctx: CanvasRenderingContext2D,
    ox: number, oy: number,
    drawW: number,
  ) => {
    if (!previewMode || !effectiveModeInfo[previewMode]) return;
    const layout = getPreviewLayout();
    if (!layout) return;

    const { pw } = getPaperDimensions(previewMode);
    const scale = drawW / pw;

    layout.slots.forEach((slot, i) => {
      const x = ox + slot.x * scale;
      const y = oy + slot.y * scale;
      const cellW = slot.w * scale;
      const cellH = slot.h * scale;

      ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
      roundRect(ctx, x, y, cellW, cellH, 4);
      ctx.fill();

      ctx.strokeStyle = layout.overflow ? "rgba(239, 68, 68, 0.9)" : "rgba(150, 150, 150, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      roundRect(ctx, x, y, cellW, cellH, 4);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = layout.overflow ? "rgba(239, 68, 68, 0.9)" : "rgba(120, 120, 120, 0.8)";
      ctx.font = `${Math.min(cellW, cellH) * 0.18}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${i + 1}`, x + cellW / 2, y + cellH / 2);
    });

    if (layout.overflow) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("⚠ 인화지를 벗어납니다", ox + drawW / 2, oy + 6);
    }
  }, [previewMode, getPreviewLayout, getPaperDimensions, effectiveModeInfo]);

  const drawLabels = useCallback((
    ctx: CanvasRenderingContext2D,
    ox: number, oy: number,
    drawW: number, drawH: number,
    pw: number, ph: number,
  ) => {
    const fontSize = 11;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${pw}cm`, ox + drawW / 2, oy + drawH + 8);

    ctx.save();
    ctx.translate(ox - 8, oy + drawH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${ph}cm`, 0, 0);
    ctx.restore();
  }, []);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { pw, ph } = getPaperDimensions(previewMode);

    const maxW = canvas.width;
    const maxH = canvas.height;
    const scale = Math.min(maxW / pw, maxH / ph) * 0.85;
    const drawW = pw * scale;
    const drawH = ph * scale;
    const ox = (maxW - drawW) / 2;
    const oy = (maxH - drawH) / 2;

    ctx.clearRect(0, 0, maxW, maxH);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, maxW, maxH);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.fill();
    ctx.restore();

    const finishDraw = () => {
      drawSlots(ctx, ox, oy, drawW);
      drawLabels(ctx, ox, oy, drawW, drawH, pw, ph);
    };

    ctx.save();
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.clip();

    // Show first print bg image in preview if available
    const firstBg = printBgImages[0];
    if (firstBg) {
      const isPortrait = previewMode ? effectiveModeInfo[previewMode]?.orientation === "portrait" : false;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { drawBgCover(ctx, img, ox, oy, drawW, drawH, isPortrait, firstBg.focalX, firstBg.focalY); ctx.restore(); finishDraw(); };
      img.onerror = () => { ctx.restore(); finishDraw(); };
      img.src = resolveUrl(firstBg.filename);
      return;
    }

    ctx.restore();
    finishDraw();
  }, [previewMode, printBgImages, effectiveModeInfo, getPaperDimensions, resolveUrl, drawSlots, drawLabels]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const drawBigPreview = useCallback(() => {
    const canvas = bigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { pw, ph } = getPaperDimensions(previewMode);

    const maxW = canvas.width;
    const maxH = canvas.height;
    const scale = Math.min(maxW / pw, maxH / ph) * 0.88;
    const drawW = pw * scale;
    const drawH = ph * scale;
    const ox = (maxW - drawW) / 2;
    const oy = (maxH - drawH) / 2;

    ctx.clearRect(0, 0, maxW, maxH);
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, maxW, maxH);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.fill();
    ctx.restore();

    const finishDraw = () => {
      drawSlots(ctx, ox, oy, drawW);
      drawLabels(ctx, ox, oy, drawW, drawH, pw, ph);
    };

    ctx.save();
    roundRect(ctx, ox, oy, drawW, drawH, 6);
    ctx.clip();

    const firstBg = printBgImages[0];
    if (firstBg) {
      const isPortrait = previewMode ? effectiveModeInfo[previewMode]?.orientation === "portrait" : false;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { drawBgCover(ctx, img, ox, oy, drawW, drawH, isPortrait, firstBg.focalX, firstBg.focalY); ctx.restore(); finishDraw(); };
      img.onerror = () => { ctx.restore(); finishDraw(); };
      img.src = resolveUrl(firstBg.filename);
      return;
    }

    ctx.restore();
    finishDraw();
  }, [previewMode, printBgImages, effectiveModeInfo, getPaperDimensions, resolveUrl, drawSlots, drawLabels]);

  useEffect(() => {
    if (showBigPreview) drawBigPreview();
  }, [showBigPreview, drawBigPreview]);

  return {
    canvasRef, bigCanvasRef,
    showBigPreview, setShowBigPreview,
    getPaperDimensions, getPreviewLayout, overflowModes,
  };
}
