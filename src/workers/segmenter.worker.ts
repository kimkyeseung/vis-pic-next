// 배경제거 세그멘테이션 워커.
// 메인 스레드에서 MediaPipe 추론(segmentForVideo)과 마스크 readback(getAsFloat32Array)을
// 돌리면 프레임당 ~90ms를 잡아먹어 화면이 뚝뚝 끊긴다(측정: GPU에서 마스크 생성 91ms).
// 이 무거운 작업을 워커로 옮겨 메인 스레드의 표시 루프가 절대 막히지 않게 한다.
// 워커는 프레임(ImageBitmap)을 받아 추론 → soft-alpha 마스크(ImageBitmap)를 되돌려준다.
//
// ROI: 메인 스레드가 인물 주변만 잘라 보낼 수 있다(경계 계단 완화 — src/lib/segmentMask.ts 참고).
// 워커는 크롭을 해석하지 않고 `roi`/`maskW`/`maskH`를 그대로 되돌려주기만 한다 — 어느 크롭의
// 결과인지는 붙여넣는 쪽이 알아야 하고, 왕복 중에 메인 스레드의 ROI가 바뀌어도 어긋나지 않는다.
//
// 프로토콜:
//   main → worker: { type:"init", useGpu, light, thresh, feather }
//                  { type:"config", thresh, feather }
//                  { type:"frame", bitmap, timestamp, roi, maskW, maskH, frameW, frameH, rescue }
//                  { type:"close" }                                       (bitmap 소유권 이전)
//   worker → main: { type:"ready" }
//                  { type:"error", error }
//                  { type:"mask", bitmap|null, bbox, roi, maskW, maskH, frameW, frameH }
//                                                                         (bitmap 소유권 이전)

import {
  FilesetResolver,
  ImageSegmenter,
  type ImageSegmenterResult,
} from "@mediapipe/tasks-vision";
import { bakeAlphaMask, type NormRect, type Roi } from "../lib/segmentMask";

type InMsg =
  | { type: "init"; useGpu: boolean; light: boolean; thresh: number; feather: number }
  | { type: "config"; thresh: number; feather: number }
  | {
      type: "frame";
      bitmap: ImageBitmap;
      timestamp: number;
      roi: Roi | null;
      maskW: number;
      maskH: number;
      frameW: number;
      frameH: number;
      /** 손 구제 영역(크롭 정규화 좌표) — 메인이 "모델이 볼 좌표계"로 미리 옮겨 보낸다. */
      rescue?: { rects: NormRect[]; strength: number };
    }
  | { type: "close" };

const MODEL_LIGHT = "/static/mediapipe/model/selfie_segmenter.tflite";
const MODEL_MULTICLASS = "/static/mediapipe/model/selfie_multiclass_256x256.tflite";

let segmenter: ImageSegmenter | null = null;
let thresh = 0.15;
let feather = 0.35;
// 모델별 전경 극성: 멀티클래스는 masks[0]=배경(전경=1-v), 경량 selfie는 masks[0]=전경(전경=v).
let foregroundIsMask0 = true;

// DOM lib 타입에서 self.postMessage는 Window 시그니처(targetOrigin)라 전송 배열과 안 맞는다.
// Worker 시그니처로 캐스팅해 (message, transfer) 형태를 쓴다.
const post = (msg: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

async function init(useGpu: boolean, light: boolean) {
  foregroundIsMask0 = light; // 경량: masks[0]=전경 / 멀티클래스: masks[0]=배경
  const vision = await FilesetResolver.forVisionTasks("/static/mediapipe/wasm");
  segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: light ? MODEL_LIGHT : MODEL_MULTICLASS,
      delegate: useGpu ? "GPU" : "CPU",
    },
    runningMode: "VIDEO",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  post({ type: "ready" });
}

async function handle(msg: InMsg) {
  switch (msg.type) {
    case "init":
      thresh = msg.thresh;
      feather = Math.max(1e-6, msg.feather);
      try {
        await init(msg.useGpu, msg.light);
      } catch (err) {
        post({
          type: "error",
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
      }
      return;

    case "config":
      thresh = msg.thresh;
      feather = Math.max(1e-6, msg.feather);
      return;

    case "close":
      segmenter?.close();
      segmenter = null;
      // 메인 스레드가 terminate()로 강제 종료하면 이 메시지 처리 자체가 중단돼
      // 위 close()가 실행되지 못할 수 있다 — 워커가 스스로 종료해 리소스 해제를 보장한다.
      self.close();
      return;

    case "frame": {
      // 어느 크롭의 결과인지 붙여넣는 쪽이 알아야 하므로 실패 경로에서도 그대로 되돌려준다.
      const echo = {
        roi: msg.roi,
        maskW: msg.maskW,
        maskH: msg.maskH,
        frameW: msg.frameW,
        frameH: msg.frameH,
      };
      if (!segmenter) {
        msg.bitmap.close();
        return;
      }
      let result: ImageSegmenterResult | undefined;
      try {
        result = segmenter.segmentForVideo(msg.bitmap, msg.timestamp);
        const masks = result.confidenceMasks;
        if (masks && masks.length > 0) {
          const mask = masks[0];
          // getAsFloat32Array가 GPU→CPU readback을 강제한다(이 워커에서 감당하는 비용).
          const arr = mask.getAsFloat32Array();
          const mw = mask.width;
          const mh = mask.height;
          // 전경 확신도(모델 극성은 foregroundIsMask0). rgb는 흰색, alpha에만 soft mask를 굽는다.
          const img = new ImageData(mw, mh);
          const bbox = bakeAlphaMask(arr, img.data, mw, mh, {
            fgIsMask0: foregroundIsMask0,
            thresh,
            feather,
            rescue: msg.rescue,
          });
          const out = await createImageBitmap(img);
          post({ type: "mask", bitmap: out, bbox, ...echo }, [out]);
        } else {
          post({ type: "mask", bitmap: null, bbox: null, ...echo });
        }
      } catch (err) {
        post({
          type: "error",
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
      } finally {
        result?.close();
        msg.bitmap.close();
      }
      return;
    }
  }
}

self.onmessage = (e: MessageEvent) => {
  void handle(e.data as InMsg);
};
