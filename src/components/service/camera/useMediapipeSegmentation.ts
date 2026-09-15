"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { BgRemovalMode } from "@/types";

// 워커 프로토콜(src/workers/segmenter.worker.ts 참고) 중 워커 → 메인 방향 메시지만 타입으로 재선언한다
// (워커 파일 자체는 건드리지 않음 — 타입만 여기서 대응시켜 e.data의 암묵적 any를 없앤다).
type WorkerOutMsg =
  | { type: "ready" }
  | { type: "error"; error: string }
  | { type: "mask"; bitmap: ImageBitmap | null };

/**
 * MediaPipe 배경제거 세그멘터의 **초기화·정리·설정동기화**만 담당한다. 메인 스레드 폴백 경로의
 * "프레임마다 마스크 굽기"는 rAF 핫패스라 이 훅이 아니라 `useCameraCapture`의 `processFrame` 루프
 * 안에 그대로 있다 — 이 훅이 내보내는 refs(`segmenterRef`/`maskCanvasRef`/...)를 그 루프가 읽는다.
 */
export function useMediapipeSegmentation({
  bgRemovalMode,
  useGpuDelegate,
  useLightModel,
  useWorker,
  segmentThresh,
  segmentFeather,
  perfRef,
}: {
  bgRemovalMode: BgRemovalMode;
  useGpuDelegate: boolean;
  useLightModel: boolean;
  useWorker: boolean;
  segmentThresh: number;
  segmentFeather: number;
  perfRef: React.RefObject<{ frames: number; lastFlush: number; inferMs: number; maskMs: number; sentAt: number }>;
}): {
  segmenterRef: React.RefObject<ImageSegmenter | null>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  maskReadyRef: React.RefObject<boolean>;
  lastInferenceTimeRef: React.RefObject<number>;
  workerRef: React.RefObject<Worker | null>;
  workerBusyRef: React.RefObject<boolean>;
  workerActiveRef: React.RefObject<boolean>;
  segmenterStatus: "idle" | "loading" | "ready" | "error";
  segmenterError: string | null;
  workerActive: boolean;
} {
  const segmenterRef = useRef<ImageSegmenter | null>(null);
  // mediapipe 추론(segmentForVideo)은 무거우므로 매 프레임 돌리지 않고 스로틀링해서
  // 재사용한다 — 화면 갱신(최대 60fps)과 AI 추론(간격은 INFERENCE_INTERVAL_MS)을 분리해 끊김을 줄인다.
  // 추론(200ms 간격)마다 alpha 마스크를 이 캔버스에 한 번만 굽고, 매 프레임에는
  // GPU 합성(destination-in)으로만 적용한다 — per-frame getImageData/픽셀 루프 제거.
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskReadyRef = useRef(false);
  const lastInferenceTimeRef = useRef(0);
  const [segmenterStatus, setSegmenterStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [segmenterError, setSegmenterError] = useState<string | null>(null);

  // ── 세그멘테이션 워커 ── 추론+마스크 readback을 메인 스레드에서 떼어내 표시 루프가 안 막히게 한다.
  // worker가 뜨면 workerActive=true로 워커 경로를, 실패하면 기존 메인 스레드 세그멘터로 폴백한다.
  const workerRef = useRef<Worker | null>(null);
  const workerBusyRef = useRef(false); // 워커가 한 프레임 처리 중이면 새 프레임을 안 보낸다(큐 적체 방지).
  const workerActiveRef = useRef(false);
  const [workerActive, setWorkerActive] = useState(false);

  // 워커 init 메시지에 임계값/부드러움을 deps 없이 최신값으로 실어 보내기 위한 ref.
  const segmentThreshRef = useRef(segmentThresh);
  const segmentFeatherRef = useRef(segmentFeather);
  useEffect(() => { segmentThreshRef.current = segmentThresh; }, [segmentThresh]);
  useEffect(() => { segmentFeatherRef.current = segmentFeather; }, [segmentFeather]);

  useEffect(() => {
    if (bgRemovalMode !== "mediapipe") {
      return;
    }
    let cancelled = false;

    async function initSegmenter() {
      if (!cancelled) setSegmenterStatus("loading");
      // MediaPipe WASM이 초기화 중 stdout/stderr로 찍는 내부 로그를 무시한다.
      const noop = () => {};
      const origLog = console.log;
      const origInfo = console.info;
      const origWarn = console.warn;
      console.log = noop;
      console.info = noop;
      console.warn = noop;
      try {
        // WASM 파일 접근 가능 여부 먼저 확인
        const wasmCheck = await fetch("/static/mediapipe/wasm/vision_wasm_internal.wasm", { method: "HEAD" }).catch((e) => { throw new Error(`WASM fetch failed: ${e.message}`); });
        if (!wasmCheck.ok) throw new Error(`WASM HTTP ${wasmCheck.status}: /static/mediapipe/wasm/vision_wasm_internal.wasm`);
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        if (cancelled) { console.log = origLog; console.info = origInfo; console.warn = origWarn; return; }
        const vision = await FilesetResolver.forVisionTasks(
          "/static/mediapipe/wasm"
        );
        if (cancelled) { console.log = origLog; console.info = origInfo; console.warn = origWarn; return; }
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: useLightModel
              ? "/static/mediapipe/model/selfie_segmenter.tflite"
              : "/static/mediapipe/model/selfie_multiclass_256x256.tflite",
            // CPU(WASM) ↔ GPU(WebGL) 전환. 디버그 토글(B)이 이 값을 바꾸면 effect가 재생성.
            delegate: useGpuDelegate ? "GPU" : "CPU",
          },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (cancelled) { segmenter.close(); console.log = origLog; console.info = origInfo; console.warn = origWarn; return; }
        segmenterRef.current = segmenter;
        setSegmenterStatus("ready");
      } catch (err) {
        console.error("MediaPipe initialization failed:", err);
        if (!cancelled) {
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          setSegmenterError(msg);
          setSegmenterStatus("error");
        }
      } finally {
        console.log = origLog;
        console.info = origInfo;
        console.warn = origWarn;
      }
    }

    // 워커가 안 뜨거나 에러나면 메인 스레드 세그멘터로 폴백(배경제거가 아예 깨지지 않도록).
    function fallbackToMainThread(reason: string) {
      if (cancelled) return;
      console.error("Segmenter worker unavailable, falling back to main thread:", reason);
      // terminate()로 즉시 죽이면 워커 안의 segmenter.close()가 실행되지 못해 GPU/WASM
      // 리소스가 새므로, close 메시지를 보내 워커가 스스로 정리 후 종료하도록 한다.
      if (workerRef.current) { try { workerRef.current.postMessage({ type: "close" }); } catch { /* noop */ } workerRef.current = null; }
      workerActiveRef.current = false;
      setWorkerActive(false);
      maskReadyRef.current = false;
      initSegmenter();
    }

    // 초기 로딩 표시(effect 본문 동기 setState 회피 — 마이크로태스크로 미룸).
    Promise.resolve().then(() => { if (!cancelled) setSegmenterStatus("loading"); });
    maskReadyRef.current = false;
    workerBusyRef.current = false;

    // Web Worker 토글이 꺼져 있으면 곧장 메인 스레드 세그멘터를 쓴다(기본값).
    if (!useWorker) {
      workerActiveRef.current = false;
      Promise.resolve().then(() => { if (!cancelled) setWorkerActive(false); });
      initSegmenter();
    }

    let worker: Worker | null = null;
    if (useWorker) {
      try {
        worker = new Worker(new URL("../../../workers/segmenter.worker.ts", import.meta.url), { type: "module" });
      } catch (err) {
        fallbackToMainThread(err instanceof Error ? err.message : String(err));
      }
    }

    if (worker) {
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
        if (cancelled) return;
        const msg = e.data;
        if (msg.type === "ready") {
          workerActiveRef.current = true;
          setWorkerActive(true);
          setSegmenterStatus("ready");
        } else if (msg.type === "error") {
          fallbackToMainThread(msg.error);
        } else if (msg.type === "mask") {
          // 워커가 돌려준 alpha 마스크를 maskCanvasRef에 그려 둔다(표시 루프·촬영 캡처가 공유).
          workerBusyRef.current = false;
          const bmp = msg.bitmap;
          if (bmp) {
            let mc = maskCanvasRef.current;
            if (!mc) { mc = document.createElement("canvas"); maskCanvasRef.current = mc; }
            if (mc.width !== bmp.width) mc.width = bmp.width;
            if (mc.height !== bmp.height) mc.height = bmp.height;
            const mctx = mc.getContext("2d")!;
            mctx.clearRect(0, 0, mc.width, mc.height);
            mctx.drawImage(bmp, 0, 0);
            bmp.close();
            maskReadyRef.current = true;
            const sent = perfRef.current.sentAt;
            if (sent) perfRef.current.inferMs = performance.now() - sent; // 계측: 워커 왕복 시간
          }
        }
      };
      worker.onerror = (ev) => fallbackToMainThread(ev.message || "worker onerror");
      worker.postMessage({
        type: "init",
        useGpu: useGpuDelegate,
        light: useLightModel,
        thresh: segmentThreshRef.current,
        feather: segmentFeatherRef.current,
      });
    }

    return () => {
      cancelled = true;
      // terminate()로 즉시 죽이면 워커 안의 segmenter.close()가 실행되지 못해 GPU/WASM
      // 리소스가 새므로, close 메시지를 보내 워커가 스스로 정리 후 종료하도록 한다.
      if (workerRef.current) {
        try { workerRef.current.postMessage({ type: "close" }); } catch { /* noop */ }
        workerRef.current = null;
      }
      workerActiveRef.current = false;
      segmenterRef.current?.close();
      segmenterRef.current = null;
      maskReadyRef.current = false;
      lastInferenceTimeRef.current = 0;
      workerBusyRef.current = false;
    };
  }, [bgRemovalMode, useGpuDelegate, useLightModel, useWorker, perfRef]);

  // 임계값/부드러움 변경을 워커에 반영(워커가 마스크를 굽기 때문). 메인 스레드 폴백은 processFrame이 직접 읽는다.
  useEffect(() => {
    if (workerActiveRef.current && workerRef.current) {
      workerRef.current.postMessage({ type: "config", thresh: segmentThresh, feather: segmentFeather });
    }
  }, [segmentThresh, segmentFeather]);

  return {
    segmenterRef,
    maskCanvasRef,
    maskReadyRef,
    lastInferenceTimeRef,
    workerRef,
    workerBusyRef,
    workerActiveRef,
    segmenterStatus,
    segmenterError,
    workerActive,
  };
}
