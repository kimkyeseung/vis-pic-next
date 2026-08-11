/** Tauri print_image invoke 전, data: URI 접두사를 제거해 순수 base64로 만든다. */
export function stripDataUriPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/\w+;base64,/, "");
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function fillGradient(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#667eea");
  grad.addColorStop(1, "#764ba2");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function fillGradientFromCSS(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  cssGradient: string,
) {
  const colorMatch = cssGradient.match(/#[0-9a-fA-F]{6}/g);
  if (colorMatch && colorMatch.length >= 2) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, colorMatch[0]);
    grad.addColorStop(1, colorMatch[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    fillGradient(ctx, w, h);
  }
}

/**
 * 이미지를 object-fit: cover 방식으로 캔버스에 그립니다.
 * focalX/focalY (0.0~1.0): 이미지의 초점 위치. 기본값 0.5 (중앙).
 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
  focalX = 0.5, focalY = 0.5,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const destRatio = dw / dh;
  const imgRatio = iw / ih;

  let sx: number, sy: number, sw: number, sh: number;
  if (imgRatio > destRatio) {
    // 이미지가 더 넓음 → 좌우를 잘라냄
    sh = ih;
    sw = ih * destRatio;
    sx = (iw - sw) * focalX;
    sy = 0;
  } else {
    // 이미지가 더 높음 → 상하를 잘라냄
    sw = iw;
    sh = iw / destRatio;
    sx = 0;
    sy = (ih - sh) * focalY;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * 촬영 캡처 목표 해상도 계산 — 원본보다 크게 확대하지 않고(min) maxW로 상한을 둔다.
 * 프리뷰 상한과 별개로 인쇄 품질(예: 10×15cm 300DPI ≈ 긴 변 1800px)에 맞춘 크기를 낸다.
 * 원본 비율(예: 4:3)은 그대로 유지한다. 유효하지 않은 입력이면 {w:0,h:0}.
 */
export function computeCaptureSize(
  nativeW: number,
  nativeH: number,
  maxW: number,
): { w: number; h: number } {
  if (!(nativeW > 0) || !(nativeH > 0) || !(maxW > 0)) return { w: 0, h: 0 };
  const scale = Math.min(1, maxW / nativeW);
  return { w: Math.round(nativeW * scale), h: Math.round(nativeH * scale) };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // data: URL에는 crossOrigin을 설정하지 않음.
    // Chromium에서 WebRTC 캔버스로 캡처한 data: URL에 crossOrigin을 설정하면
    // 보안 컨텍스트 검사가 실패해 onerror가 발생한다.
    if (!src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function resizeForGif(src: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
