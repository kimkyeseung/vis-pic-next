// 배경제거 세그멘테이션 워커.
// 메인 스레드에서 MediaPipe 추론(segmentForVideo)과 마스크 readback(getAsFloat32Array)을
// 돌리면 프레임당 ~90ms를 잡아먹어 화면이 뚝뚝 끊긴다(측정: GPU에서 마스크 생성 91ms).
// 이 무거운 작업을 워커로 옮겨 메인 스레드의 표시 루프가 절대 막히지 않게 한다.
// 워커는 프레임(ImageBitmap)을 받아 추론 → soft-alpha 마스크(ImageBitmap)를 되돌려준다.
//
// 프로토콜:
//   main → worker: { type:"init", useGpu, thresh, feather }
//                  { type:"config", thresh, feather }
//                  { type:"frame", bitmap, timestamp }   (bitmap 소유권 이전)
//                  { type:"close" }
//   worker → main: { type:"ready" }
//                  { type:"error", error }
//                  { type:"mask", bitmap|null }          (bitmap 소유권 이전)

import {
  FilesetResolver,
  ImageSegmenter,
  type ImageSegmenterResult,
} from "@mediapipe/tasks-vision";

type InMsg =
  | { type: "init"; useGpu: boolean; light: boolean; thresh: number; feather: number }
  | { type: "config"; thresh: number; feather: number }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number }
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
      if (!segmenter) {
        msg.bitmap.close();
        return;
      }
      try {
        const result: ImageSegmenterResult = segmenter.segmentForVideo(
          msg.bitmap,
          msg.timestamp
        );
        const masks = result.confidenceMasks;
        if (masks && masks.length > 0) {
          const mask = masks[0];
          // getAsFloat32Array가 GPU→CPU readback을 강제한다(이 워커에서 감당하는 비용).
          const arr = mask.getAsFloat32Array();
          const mw = mask.width;
          const mh = mask.height;
          // 전경 확신도(모델 극성은 foregroundIsMask0). rgb는 흰색, alpha에만 soft mask를 굽는다.
          const img = new ImageData(mw, mh);
          const d = img.data;
          for (let i = 0; i < arr.length; i++) {
            const fg = foregroundIsMask0 ? arr[i] : 1 - arr[i];
            const a = Math.max(0, Math.min(1, (fg - thresh) / feather));
            const j = i * 4;
            d[j] = 255;
            d[j + 1] = 255;
            d[j + 2] = 255;
            d[j + 3] = Math.round(a * 255);
          }
          const out = await createImageBitmap(img);
          post({ type: "mask", bitmap: out }, [out]);
        } else {
          post({ type: "mask", bitmap: null });
        }
      } catch (err) {
        post({
          type: "error",
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
      } finally {
        msg.bitmap.close();
      }
      return;
    }
  }
}

self.onmessage = (e: MessageEvent) => {
  void handle(e.data as InMsg);
};
