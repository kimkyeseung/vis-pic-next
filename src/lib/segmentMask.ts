/**
 * AI(MediaPipe) 배경제거 마스크 후처리 — 경계 계단(에일리어싱) 대책.
 *
 * selfie 계열 모델은 입력을 **항상 256×256으로 줄여** 추론하므로(docs/CAMERA_QUALITY.md 1-1),
 * 마스크 경계의 기하학적 형태 자체가 256칸 격자에 양자화된다. 그 마스크를 인화 해상도
 * (`CAPTURE_MAX_W` 1800px)로 확대하면 격자 한 칸이 ~7px이 되어 윤곽이 계단처럼 보인다.
 *
 * 관리자 슬라이더의 "경계 부드러움(FEATHER)"은 confidence라는 **값 축**만 완만하게 만들 뿐
 * **공간 축**은 건드리지 않아 계단을 못 없앤다(넓히면 고스팅만 는다). 그래서 두 방향으로 접근한다.
 *
 *  · `createMaskBaker().bake` — 구워진 마스크에 **공간 블러**를 걸어 격자 계단을 지운다(비용 ~0).
 *    이어서 **경계 두께**(기하학적 팽창/침식)와 **시간축 평활**을 한 번의 픽셀 패스로 적용한다.
 *  · `nextRoi` — 다음 추론을 **인물 주변만 잘라** 돌려 256 격자가 덮는 실제 면적을 줄인다.
 *    인물이 프레임 폭의 절반이면 경계 해상도가 2배 → 계단 폭이 실제로 절반이 된다(근본 대책).
 *
 * 세기는 전부 관리자 촬영 설정(`MaskTuning`)에서 온다 — 기본값은 `DEFAULT_MASK_TUNING`.
 *
 * 워커(`src/workers/segmenter.worker.ts`)와 메인 스레드가 함께 쓰므로, DOM 접근은 반드시
 * 함수 본문 안에만 둔다(모듈 최상위에서 document를 건드리면 워커에서 터진다).
 */

/** 모델 고정 입력 격자(selfie 계열 256×256). 마스크 경계의 실질 해상도 상한. */
export const MODEL_GRID = 256;

/**
 * ROI 추론에 쓰는 정사각 입력 크기. 모델이 어차피 256으로 줄이므로 그보다 약간만 크게 잡는다.
 * 정사각으로 고정하는 이유는 두 가지 — (1) 모델 입력이 정사각이라 레터박스/찌그러짐으로 버리는
 * 픽셀이 없다. (2) 입력 크기가 매 프레임 고정이라 MediaPipe가 텐서를 다시 잡지 않는다.
 * 부수 효과로 `getAsFloat32Array()` readback이 320² = 102k로 줄어든다(기존 전체 프레임 대비 1/5).
 */
export const ROI_INPUT_SIZE = 320;

/** 256 격자 텍셀 대비 블러 반경 비율(설정 100% 기준). 계단은 지우면서 실루엣은 안 뭉개지는 선. */
const BLUR_TEXEL_RATIO = 0.6;
/** 블러 반경 상한(px). ROI를 못 잡아 전체 프레임을 볼 때 과하게 번지는 걸 막는다. */
const BLUR_MAX_PX = 6;
/** 이 반경 아래면 블러가 의미 없어 건너뛴다(스크래치 캔버스 왕복 절약). */
const BLUR_MIN_PX = 0.3;

/** bbox에 넣을 "확실한 전경" 알파 하한. 페더의 옅은 꼬리까지 세면 ROI가 계속 부푼다. */
const BBOX_ALPHA = 128;

/** ROI 떨림(breathing)을 줄이는 EMA 계수. 1에 가까울수록 즉각적이고 덜 안정적. */
const ROI_EMA = 0.35;
/** ROI 최소 한 변(px). 너무 좁히면 얼굴만 남아 인물을 놓칠 여지가 커진다. */
const ROI_MIN_PX = 160;
/**
 * 한 축이라도 이 비율 아래로 줄어야 크롭할 값어치가 있다고 본다.
 * 모델이 어차피 정사각으로 리샘플하므로 이득은 축별 (프레임 변 / 크롭 변)으로 계산된다.
 */
const ROI_WORTH_RATIO = 0.85;
/** 인물이 크롭 경계에 "닿았다"고 볼 여유(256 격자 텍셀 단위). */
const ROI_ESCAPE_TEXELS = 2;

/**
 * 경계 두께 보정은 **블러가 만든 전환대 안에서** 알파를 위아래로 밀어 경계선을 옮기는 방식이라,
 * 블러가 0이면 아무 일도 안 일어난다. 두께를 쓰겠다고 했으면 최소한의 전환대는 만들어 준다
 * (256 격자 텍셀 대비 비율).
 */
const SHIFT_MIN_BLUR_RATIO = 0.35;
/** 시간축 평활의 최대 가중치. 1에 가까우면 마스크가 갱신을 거의 안 해 잔상이 된다. */
const TEMPORAL_MAX = 0.85;
/**
 * 경계 두께를 감마 곡선 `a^g`로 구현할 때 설정 ±100에 대응하는 지수(2^GAMMA).
 * 감마를 쓰는 이유: 알파를 그냥 더하고 빼면(평행이동) 실루엣 **내부**(알파 1.0)까지 같이 내려가
 * 인물 전체가 반투명해진다. `a^g`는 0과 1을 고정점으로 두고 전환대만 움직인다.
 */
const EDGE_SHIFT_GAMMA = 2;

/** 관리자 촬영 설정에서 오는 마스크 후처리 세기. */
export type MaskTuning = {
  /** 공간 블러 세기(%). 100 = 기본, 0 = 끔. 계단을 지우는 정도. */
  blur: number;
  /** 경계 두께(-100~100). +면 바깥으로 살리고(팽창), -면 안쪽으로 깎는다(침식). */
  edgeShift: number;
  /** 시간축 평활(0~100). 이전 마스크를 섞어 경계 떨림을 줄인다. 높을수록 잔상이 는다. */
  temporal: number;
  /** 인물 추적 크롭 사용 여부. */
  roi: boolean;
  /** 추적 여유(%) — bbox 한 변 대비. 낮을수록 해상도 이득이 크고 놓칠 위험도 크다. */
  roiMargin: number;
};

export const DEFAULT_MASK_TUNING: MaskTuning = {
  blur: 100,
  edgeShift: 0,
  temporal: 0,
  roi: true,
  roiMargin: 22,
};

/** 전체 프레임 픽셀 좌표계의 크롭 영역. */
export type Roi = { x: number; y: number; w: number; h: number };

/** 마스크 픽셀 좌표계의 전경 경계 상자. */
export type MaskBbox = { x: number; y: number; w: number; h: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 이번 추론이 커버한 폭(마스크 캔버스 픽셀 기준)에 맞는 블러 반경.
 * ROI로 좁게 볼수록 격자 텍셀이 작아지므로 블러도 자동으로 약해진다 — 해상도/ROI가 바뀌어도
 * "계단 한 칸을 지우는" 정도가 일정하게 유지된다.
 */
export function maskBlurPx(sampledWidthInMaskPx: number, tuning: MaskTuning = DEFAULT_MASK_TUNING): number {
  const texel = sampledWidthInMaskPx / MODEL_GRID;
  let px = texel * BLUR_TEXEL_RATIO * (tuning.blur / 100);
  // 두께 보정은 전환대가 있어야 동작한다 — 블러를 0으로 둔 채 두께만 올린 경우의 최소치.
  if (tuning.edgeShift !== 0) px = Math.max(px, texel * SHIFT_MIN_BLUR_RATIO);
  return clamp(px, 0, BLUR_MAX_PX);
}

/**
 * confidence 배열을 soft-alpha 마스크 픽셀(RGB=흰색, A=알파)로 굽고, 동시에 전경 bbox를 구한다.
 * 워커 경로와 메인 스레드 폴백 경로가 같은 곡선을 쓰도록 이 한 곳으로 모았다.
 *
 * `out`은 호출부가 만든 `ImageData.data`(w*h*4). node 테스트 환경엔 `ImageData`가 없어
 * 여기서 만들지 않고 받는다.
 */
export function bakeAlphaMask(
  arr: Float32Array,
  out: Uint8ClampedArray,
  w: number,
  h: number,
  opts: { fgIsMask0: boolean; thresh: number; feather: number },
): MaskBbox | null {
  const { fgIsMask0, thresh } = opts;
  const feather = Math.max(1e-6, opts.feather);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      // 전경 극성: 경량 selfie는 masks[0]=전경, 멀티클래스는 masks[0]=배경(전경=1-v).
      const fg = fgIsMask0 ? arr[i] : 1 - arr[i];
      const a = fg <= thresh ? 0 : Math.min(1, (fg - thresh) / feather);
      const j = i * 4;
      out[j] = 255;
      out[j + 1] = 255;
      out[j + 2] = 255;
      out[j + 3] = a * 255; // Uint8ClampedArray가 반올림·클램프를 대신한다
      if (out[j + 3] >= BBOX_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * 마스크 픽셀 좌표의 bbox를 전체 프레임 픽셀 좌표로 옮긴다.
 * `roi`가 있으면 그 크롭이 마스크 전체를 차지하므로 크롭 사각형 기준으로, 없으면 프레임 전체 기준.
 */
export function bboxToFrame(
  bbox: { x: number; y: number; w: number; h: number },
  maskW: number,
  maskH: number,
  roi: Roi | null,
  frameW: number,
  frameH: number,
): { x: number; y: number; w: number; h: number } {
  const sx = (roi ? roi.w : frameW) / maskW;
  const sy = (roi ? roi.h : frameH) / maskH;
  const ox = roi ? roi.x : 0;
  const oy = roi ? roi.y : 0;
  return { x: ox + bbox.x * sx, y: oy + bbox.y * sy, w: bbox.w * sx, h: bbox.h * sy };
}

/**
 * 전경 bbox(전체 프레임 좌표)로부터 다음 추론에 쓸 ROI를 만든다.
 * `null`을 돌려주면 "잘라도 얻을 해상도가 없다" → 호출부는 프레임 전체로 추론한다.
 *
 * **정사각이나 프레임 비율로 맞추지 않는다.** 부스에서 인물은 보통 세로를 거의 채우므로
 * 비율을 맞추려 들면 어떤 크롭도 프레임만 해져 이득이 사라진다. 대신 변마다 여유를 붙이고
 * 프레임으로 자른다 — 인물이 이미 화면에 잘리는 위/아래는 여유 없이 끝까지 가고, 좌우만
 * 좁혀진다. 실루엣의 주요 경계(팔·손가락·몸통 옆선)가 세로 방향이라 가로 해상도가 곧 계단 폭이다.
 * 잘린 크롭은 모델이 어차피 정사각으로 리샘플하므로 비율이 달라도 버리는 픽셀이 없다.
 */
export function nextRoi(
  bbox: { x: number; y: number; w: number; h: number },
  frameW: number,
  frameH: number,
  prev: Roi | null,
  tuning: MaskTuning = DEFAULT_MASK_TUNING,
): Roi | null {
  if (!tuning.roi) return null;
  const baseMargin = clamp(tuning.roiMargin, 0, 100) / 100;
  // 인물이 직전 크롭의 **안쪽** 경계에 닿았으면 크롭 밖으로 나가는 중이다 — 여유를 두 배로 잡고
  // EMA 없이 즉시 반영한다(한 박자 늦으면 인물이 크롭 밖에서 잘려 나간다).
  // 프레임 끝에 맞닿은 변은 원래 화면이 인물을 자르는 자리라 판단에서 뺀다.
  const tol = prev ? (Math.max(prev.w, prev.h) / MODEL_GRID) * ROI_ESCAPE_TEXELS : 0;
  const escaping =
    !!prev &&
    ((prev.x > 0 && bbox.x <= prev.x + tol) ||
      (prev.y > 0 && bbox.y <= prev.y + tol) ||
      (prev.x + prev.w < frameW && bbox.x + bbox.w >= prev.x + prev.w - tol) ||
      (prev.y + prev.h < frameH && bbox.y + bbox.h >= prev.y + prev.h - tol));
  const m = escaping ? baseMargin * 2 : baseMargin;

  const x0 = clamp(bbox.x - bbox.w * m, 0, frameW);
  const x1 = clamp(bbox.x + bbox.w * (1 + m), 0, frameW);
  const y0 = clamp(bbox.y - bbox.h * m, 0, frameH);
  const y1 = clamp(bbox.y + bbox.h * (1 + m), 0, frameH);

  let w = x1 - x0;
  let h = y1 - y0;
  let x = x0;
  let y = y0;

  // 어느 축도 의미 있게 줄지 않으면 크롭할 값어치가 없다 → 프레임 전체.
  if (w > frameW * ROI_WORTH_RATIO && h > frameH * ROI_WORTH_RATIO) return null;

  if (prev && !escaping) {
    // 평상시엔 EMA로 ROI가 프레임마다 들썩이는 것(breathing)을 줄인다.
    x = prev.x + (x - prev.x) * ROI_EMA;
    y = prev.y + (y - prev.y) * ROI_EMA;
    w = prev.w + (w - prev.w) * ROI_EMA;
    h = prev.h + (h - prev.h) * ROI_EMA;
  }

  // createImageBitmap의 크롭 사각형은 정수라, 보내는 쪽과 되붙이는 쪽이 같은 값을 보도록
  // 여기서 정수로 확정한다. (변 길이를 먼저 정수화해야 x + w <= frameW가 깨지지 않는다.)
  w = Math.round(clamp(w, Math.min(ROI_MIN_PX, frameW), frameW));
  h = Math.round(clamp(h, Math.min(ROI_MIN_PX, frameH), frameH));
  return {
    x: Math.round(clamp(x, 0, frameW - w)),
    y: Math.round(clamp(y, 0, frameH - h)),
    w,
    h,
  };
}

// ── 아래부터는 메인 스레드(DOM) 전용 ──────────────────────────────────────────────

/**
 * 마스크 한 장을 굽는다(블러 → 두께 → 시간축 평활). 스크래치 캔버스와 직전 마스크를 들고 있어야
 * 하므로 팩토리로 만든다 — 합성 루프마다 하나씩 만들어 쓰면 경로끼리 상태가 섞이지 않는다.
 */
export type MaskBaker = {
  /**
   * `source`를 `target`(mw×mh, 프레임 전체 대응)에 굽는다. `dest`를 주면 그 사각형에만 놓고
   * 나머지는 투명으로 둔다(= ROI 추론 결과를 전체 프레임 마스크에 되붙일 때).
   */
  bake(
    target: HTMLCanvasElement,
    source: ImageData | CanvasImageSource,
    mw: number,
    mh: number,
    dest: Roi | null,
    tuning?: MaskTuning,
  ): void;
  /** 시간축 평활 상태를 버린다(해상도·모드가 바뀌어 이전 마스크가 무의미해졌을 때). */
  reset(): void;
};

/**
 * 경계 두께용 알파 룩업 테이블. `a^g` 곡선을 256칸에 미리 구워 둔다 — 알파가 0~255 정수라
 * 손실이 없고, 픽셀마다 Math.pow를 부르는 것보다 훨씬 싸다. 설정이 바뀔 때만 다시 만든다.
 */
let edgeShiftLutCache: Uint8ClampedArray | null = null;
let edgeShiftLutFor = NaN;
function edgeShiftLut(shift: number): Uint8ClampedArray {
  if (edgeShiftLutCache && edgeShiftLutFor === shift) return edgeShiftLutCache;
  // shift<0(침식) → g>1 → 전환대가 안쪽으로, shift>0(팽창) → g<1 → 바깥쪽으로.
  const g = Math.pow(2, (-shift / 100) * EDGE_SHIFT_GAMMA);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.pow(i / 255, g) * 255;
  edgeShiftLutCache = lut;
  edgeShiftLutFor = shift;
  return lut;
}

export function createMaskBaker(): MaskBaker {
  let srcCanvas: HTMLCanvasElement | null = null;
  let padCanvas: HTMLCanvasElement | null = null;
  let blurCanvas: HTMLCanvasElement | null = null;
  // 시간축 평활용 직전 알파. 두께 보정 **전** 값을 담는다 — 보정 후 값을 되먹이면 매 프레임
  // 두께가 누적돼 실루엣이 계속 부풀거나 사라진다.
  let prevAlpha: Uint8ClampedArray | null = null;

  const sized = (c: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement => {
    const canvas = c ?? document.createElement("canvas");
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return canvas;
  };

  /** ImageData는 drawImage 소스가 못 되므로 스크래치 캔버스를 거친다. */
  const asDrawable = (source: ImageData | CanvasImageSource): CanvasImageSource => {
    if (source instanceof ImageData) {
      srcCanvas = sized(srcCanvas, source.width, source.height);
      srcCanvas.getContext("2d")!.putImageData(source, 0, 0);
      return srcCanvas;
    }
    return source;
  };

  return {
    reset() {
      prevAlpha = null;
    },

    bake(target, source, mw, mh, dest, tuning = DEFAULT_MASK_TUNING) {
      if (target.width !== mw) target.width = mw;
      if (target.height !== mh) target.height = mh;
      const tctx = target.getContext("2d", { willReadFrequently: true })!;
      const img = asDrawable(source);

      tctx.filter = "none";
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.clearRect(0, 0, mw, mh);
      if (dest) tctx.drawImage(img, dest.x, dest.y, dest.w, dest.h);
      else tctx.drawImage(img, 0, 0, mw, mh);

      // ── 공간 블러 ── 256 격자 계단을 지운다.
      const blurPx = maskBlurPx(dest ? dest.w : mw, tuning);
      if (blurPx >= BLUR_MIN_PX) {
        // 블러는 캔버스 바깥을 투명으로 보기 때문에, 어깨처럼 **화면 끝에 닿은 부위**가 그대로
        // 블러되면 프레임 가장자리를 따라 반투명 띠가 생긴다. 패딩된 캔버스에 가장자리 1px을
        // 바깥으로 복제(edge clamp)한 뒤 블러하고 되잘라 이를 막는다.
        const pad = Math.ceil(blurPx * 3);
        const pw = mw + pad * 2;
        const ph = mh + pad * 2;

        padCanvas = sized(padCanvas, pw, ph);
        const pctx = padCanvas.getContext("2d")!;
        pctx.filter = "none";
        pctx.imageSmoothingEnabled = false; // 1px 테두리를 늘려 붙이기만 한다 — 보간할 것이 없다
        pctx.clearRect(0, 0, pw, ph);
        pctx.drawImage(target, pad, pad);
        // 상·하·좌·우 1px 복제
        pctx.drawImage(target, 0, 0, mw, 1, pad, 0, mw, pad);
        pctx.drawImage(target, 0, mh - 1, mw, 1, pad, pad + mh, mw, pad);
        pctx.drawImage(target, 0, 0, 1, mh, 0, pad, pad, mh);
        pctx.drawImage(target, mw - 1, 0, 1, mh, pad + mw, pad, pad, mh);
        // 네 모서리
        pctx.drawImage(target, 0, 0, 1, 1, 0, 0, pad, pad);
        pctx.drawImage(target, mw - 1, 0, 1, 1, pad + mw, 0, pad, pad);
        pctx.drawImage(target, 0, mh - 1, 1, 1, 0, pad + mh, pad, pad);
        pctx.drawImage(target, mw - 1, mh - 1, 1, 1, pad + mw, pad + mh, pad, pad);

        blurCanvas = sized(blurCanvas, pw, ph);
        const bctx = blurCanvas.getContext("2d")!;
        bctx.clearRect(0, 0, pw, ph);
        bctx.filter = `blur(${blurPx}px)`;
        bctx.drawImage(padCanvas, 0, 0);
        bctx.filter = "none";

        tctx.clearRect(0, 0, mw, mh);
        tctx.drawImage(blurCanvas, pad, pad, mw, mh, 0, 0, mw, mh);
      }

      // ── 경계 두께 + 시간축 평활 ── 둘 다 알파만 만지므로 픽셀 패스 한 번에 처리한다.
      // 추론마다 한 번이라(매 프레임이 아니라) readback 비용을 감당할 수 있다.
      const shift = clamp(tuning.edgeShift, -100, 100);
      const weight = (clamp(tuning.temporal, 0, 100) / 100) * TEMPORAL_MAX;
      if (shift === 0 && weight === 0) {
        prevAlpha = null; // 평활을 끈 상태의 낡은 상태를 들고 있지 않는다
        return;
      }

      const n = mw * mh;
      if (prevAlpha && prevAlpha.length !== n) prevAlpha = null; // 해상도가 바뀌면 이전 값은 무의미
      const blend = prevAlpha ? weight : 0; // 첫 프레임엔 섞을 이전 마스크가 없다
      const keep = prevAlpha ?? new Uint8ClampedArray(n);
      const lut = shift === 0 ? null : edgeShiftLut(shift);

      const image = tctx.getImageData(0, 0, mw, mh);
      const d = image.data;
      for (let i = 0; i < n; i++) {
        const j = i * 4 + 3;
        let a = d[j];
        if (blend > 0) a = keep[i] * blend + a * (1 - blend);
        keep[i] = a; // 되먹임은 두께 보정 **전** 값으로 — 보정 후를 되먹이면 프레임마다 누적된다
        d[j] = lut ? lut[keep[i]] : a;
      }
      tctx.putImageData(image, 0, 0);
      prevAlpha = weight > 0 ? keep : null;
    },
  };
}
