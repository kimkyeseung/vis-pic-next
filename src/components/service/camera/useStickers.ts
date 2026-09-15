"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sticker } from "@/types";

// 스티커 기본 크기(px, scale=1·pxScale=1 기준). 캔버스 실제 그리기(drawStickers)와 드래그
// 히트박스(CameraSection.tsx의 오버레이 JSX)가 같은 비율을 쓰도록 상수로 공유한다.
// 히트박스 쪽 상수(STICKER_IMG_HITBOX)는 JSX 전용이라 CameraSection.tsx에 남아있다.
const STICKER_IMG_BOX = 160; // 이미지 스티커: 이 정사각 박스 안에 원본 비율 그대로 contain

const TAP_THRESHOLD = 10;

type TouchGesture =
  | { mode: "drag"; stickerId: string; touchId: number; ox: number; oy: number; startX: number; startY: number; didMove: boolean }
  | { mode: "pinch"; stickerId: string; touch1Id: number; touch2Id: number; initialDist: number; initialScale: number };

/**
 * 촬영 화면 스티커 서브시스템 — DB 스티커 뱅크 로드, CRUD, 마우스/터치 드래그·핀치, 캔버스 렌더링을
 * 전부 담당한다. 캡처 파이프라인(`useCameraCapture`)은 이 훅이 반환하는 `drawStickers`만 재사용해
 * 촬영본/GIF 프레임에 스티커를 합성한다 — 그 외 스티커 상태는 이 훅 밖에서 건드리지 않는다.
 */
export function useStickers({
  deviceId,
  stickers,
  onStickersChange,
  displayCanvasRef,
}: {
  deviceId: string;
  stickers: Sticker[];
  onStickersChange: (stickers: Sticker[]) => void;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}): {
  dbStickerImages: Array<{ id: number; filename: string; name: string }>;
  addSticker: (src: string) => void;
  removeSticker: (id: string) => void;
  draggingId: string | null;
  selectedStickerId: string | null;
  setSelectedStickerId: (id: string | null) => void;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  stickerCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  drawStickers: (ctx: CanvasRenderingContext2D, w: number, h: number, pxScale?: number) => void;
  handleStickerMouseDown: (e: React.MouseEvent, id: string) => void;
  handleOverlayMouseMove: (e: React.MouseEvent) => void;
  handleOverlayMouseUp: () => void;
  handleStickerTouchStart: (e: React.TouchEvent, id: string) => void;
  handleOverlayTouchMove: (e: React.TouchEvent) => void;
  handleOverlayTouchEnd: (e: React.TouchEvent) => void;
} {
  const [dbStickerImages, setDbStickerImages] = useState<Array<{ id: number; filename: string; name: string }>>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ ox: number; oy: number }>({ ox: 0, oy: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const stickerImgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  // 스티커는 별도 캔버스 레이어에 60fps로 그린다 — 메인 합성 루프(배경제거)에
  // 묶이면 드래그가 세그멘테이션 처리 속도로 끊기고, stickers가 루프 effect
  // deps에 들어가면 mousemove마다 루프가 재생성되어 버벅인다.
  const stickerCanvasRef = useRef<HTMLCanvasElement>(null);
  const stickersRef = useRef(stickers);
  useEffect(() => { stickersRef.current = stickers; }, [stickers]);
  const touchGestureRef = useRef<TouchGesture | null>(null);

  // DB 스티커 이미지 목록 로드 — 지점별 뱅크(선택된 스티커, 순서대로)
  useEffect(() => {
    fetch(`/api/device/${deviceId}/stickers/`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setDbStickerImages(data.images || []))
      .catch(() => {});
  }, [deviceId]);

  // 이미지 스티커 프리로드
  useEffect(() => {
    stickers.forEach((s) => {
      if (!stickerImgCacheRef.current.has(s.src)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => stickerImgCacheRef.current.set(s.src, img);
        img.src = s.src;
      }
    });
  }, [stickers]);

  // pxScale: 표시 캔버스(display) 대비 축소 배율 — 다운스케일 스냅샷에서 스티커
  // 상대 크기가 유지되도록 픽셀 단위 크기에 곱한다.
  const drawStickers = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number, pxScale = 1) => {
    stickersRef.current.forEach((s) => {
      const img = stickerImgCacheRef.current.get(s.src);
      if (!img) return;
      // 정사각 박스에 억지로 늘리지 않고, 박스 안에 원본 가로세로 비율 그대로 맞춘다(object-fit: contain과 동일).
      const box = Math.round(s.scale * STICKER_IMG_BOX * pxScale);
      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;
      const fit = Math.min(box / iw, box / ih);
      const dw = iw * fit;
      const dh = ih * fit;
      ctx.drawImage(img, s.x * w - dw / 2, s.y * h - dh / 2, dw, dh);
    });
  }, []);

  // 스티커 전용 오버레이 캔버스 루프 — 메인 합성 루프와 독립적으로 60fps 렌더
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const display = displayCanvasRef.current;
      const layer = stickerCanvasRef.current;
      if (!display || !layer || !display.width || !display.height) return;
      if (layer.width !== display.width) layer.width = display.width;
      if (layer.height !== display.height) layer.height = display.height;
      const ctx = layer.getContext("2d")!;
      ctx.clearRect(0, 0, layer.width, layer.height);
      drawStickers(ctx, layer.width, layer.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drawStickers, displayCanvasRef]);

  const addSticker = useCallback((src: string) => {
    const newSticker: Sticker = {
      id: `${Date.now()}-${Math.random()}`,
      src,
      x: 0.5,
      y: 0.5,
      scale: 1,
    };
    onStickersChange([...stickers, newSticker]);
  }, [stickers, onStickersChange]);

  const removeSticker = useCallback((id: string) => {
    onStickersChange(stickers.filter((s) => s.id !== id));
  }, [stickers, onStickersChange]);

  const handleStickerMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const sticker = stickers.find((s) => s.id === id);
    if (!sticker) return;
    dragOffsetRef.current = {
      ox: e.clientX / rect.width - sticker.x,
      oy: e.clientY / rect.height - sticker.y,
    };
    setDraggingId(id);
  }, [stickers]);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingId) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, e.clientX / rect.width - dragOffsetRef.current.ox));
    const y = Math.max(0, Math.min(1, e.clientY / rect.height - dragOffsetRef.current.oy));
    onStickersChange(stickers.map((s) => s.id === draggingId ? { ...s, x, y } : s));
  }, [draggingId, stickers, onStickersChange]);

  const handleOverlayMouseUp = useCallback(() => {
    setDraggingId(null);
  }, []);

  // ── 터치 핸들러 ──────────────────────────────────────────
  const handleStickerTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const sticker = stickers.find((s) => s.id === id);
    if (!sticker) return;
    const t = e.touches[0];
    touchGestureRef.current = {
      mode: "drag",
      stickerId: id,
      touchId: t.identifier,
      ox: t.clientX / rect.width - sticker.x,
      oy: t.clientY / rect.height - sticker.y,
      startX: t.clientX,
      startY: t.clientY,
      didMove: false,
    };
    setDraggingId(id);
  }, [stickers]);

  const handleOverlayTouchMove = useCallback((e: React.TouchEvent) => {
    const gesture = touchGestureRef.current;
    if (!gesture) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();

    if (gesture.mode === "drag") {
      if (e.touches.length === 2) {
        // 드래그 → 핀치 전환
        const sticker = stickers.find((s) => s.id === gesture.stickerId);
        if (!sticker) return;
        const t1 = e.touches[0], t2 = e.touches[1];
        touchGestureRef.current = {
          mode: "pinch",
          stickerId: gesture.stickerId,
          touch1Id: t1.identifier,
          touch2Id: t2.identifier,
          initialDist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
          initialScale: sticker.scale,
        };
        return;
      }
      const t = Array.from(e.touches).find((t) => t.identifier === gesture.touchId);
      if (!t) return;
      const moved = Math.hypot(t.clientX - gesture.startX, t.clientY - gesture.startY);
      if (moved > TAP_THRESHOLD) gesture.didMove = true;
      const x = Math.max(0, Math.min(1, t.clientX / rect.width - gesture.ox));
      const y = Math.max(0, Math.min(1, t.clientY / rect.height - gesture.oy));
      onStickersChange(stickers.map((s) => s.id === gesture.stickerId ? { ...s, x, y } : s));

    } else if (gesture.mode === "pinch" && e.touches.length >= 2) {
      const t1 = Array.from(e.touches).find((t) => t.identifier === gesture.touch1Id);
      const t2 = Array.from(e.touches).find((t) => t.identifier === gesture.touch2Id);
      if (!t1 || !t2) return;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const newScale = Math.max(0.3, Math.min(5, (dist / gesture.initialDist) * gesture.initialScale));
      onStickersChange(stickers.map((s) => s.id === gesture.stickerId ? { ...s, scale: newScale } : s));
    }
  }, [stickers, onStickersChange]);

  const handleOverlayTouchEnd = useCallback((e: React.TouchEvent) => {
    const gesture = touchGestureRef.current;
    if (!gesture) return;

    if (e.touches.length === 0) {
      // 탭 감지: 움직임이 없었으면 선택 토글 (삭제 버튼 표시)
      if (gesture.mode === "drag" && !gesture.didMove) {
        setSelectedStickerId((prev) => prev === gesture.stickerId ? null : gesture.stickerId);
      }
      touchGestureRef.current = null;
      setDraggingId(null);
    } else if (gesture.mode === "pinch" && e.touches.length === 1) {
      // 핀치 → 드래그로 복귀
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const sticker = stickers.find((s) => s.id === gesture.stickerId);
      if (!sticker) return;
      const t = e.touches[0];
      touchGestureRef.current = {
        mode: "drag",
        stickerId: gesture.stickerId,
        touchId: t.identifier,
        ox: t.clientX / rect.width - sticker.x,
        oy: t.clientY / rect.height - sticker.y,
        startX: t.clientX,
        startY: t.clientY,
        didMove: false,
      };
    }
  }, [stickers]);

  return {
    dbStickerImages,
    addSticker,
    removeSticker,
    draggingId,
    selectedStickerId,
    setSelectedStickerId,
    overlayRef,
    stickerCanvasRef,
    drawStickers,
    handleStickerMouseDown,
    handleOverlayMouseMove,
    handleOverlayMouseUp,
    handleStickerTouchStart,
    handleOverlayTouchMove,
    handleOverlayTouchEnd,
  };
}
