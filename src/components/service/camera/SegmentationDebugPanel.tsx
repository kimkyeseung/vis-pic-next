"use client";

/**
 * MediaPipe 배경제거 성능 계측 + 디버그 토글 오버레이. 순수 표시 컴포넌트 — 모든 값/토글 함수는
 * `useSegmentationDebugSettings`(토글)와 `useMediapipeSegmentation`(상태)에서 props로 받는다.
 * `debug && bgRemovalMode === "mediapipe"`일 때만 호출부(`CameraSection`)가 마운트한다.
 */
export function SegmentationDebugPanel({
  perf,
  workerActive,
  segmenterStatus,
  useGpuDelegate,
  setDelegate,
  useLightModel,
  setModel,
  useWorker,
  setWorkerEnabled,
  maskSmoothQuality,
  setMaskSmoothQuality,
  inferenceInterval,
  chooseInterval,
}: {
  perf: { fps: number; inferMs: number; maskMs: number };
  workerActive: boolean;
  segmenterStatus: "idle" | "loading" | "ready" | "error";
  useGpuDelegate: boolean;
  setDelegate: (gpu: boolean) => void;
  useLightModel: boolean;
  setModel: (light: boolean) => void;
  useWorker: boolean;
  setWorkerEnabled: (on: boolean) => void;
  maskSmoothQuality: "high" | "low";
  setMaskSmoothQuality: (q: "high" | "low") => void;
  inferenceInterval: number;
  chooseInterval: (ms: number) => void;
}) {
  return (
    <div className="absolute top-4 left-4 z-40 bg-black/80 text-white text-xs font-mono px-3 py-2 rounded-lg space-y-1.5 leading-tight">
      <div className="flex justify-between gap-4"><span className="opacity-70">FPS(표시)</span><span className="tabular-nums">{perf.fps}</span></div>
      {workerActive ? (
        <>
          <div className="flex justify-between gap-4"><span className="opacity-70">추론 왕복(worker)</span><span className="tabular-nums">{perf.inferMs} ms</span></div>
          <div className="flex justify-between gap-4"><span className="opacity-70">마스크 갱신</span><span className="tabular-nums">{perf.inferMs > 0 ? Math.round(1000 / perf.inferMs) : 0} /s</span></div>
          <div className="flex justify-between gap-4"><span className="opacity-70">처리</span><span>Web Worker</span></div>
        </>
      ) : (
        <>
          <div className="flex justify-between gap-4"><span className="opacity-70">추론 segmentForVideo</span><span className="tabular-nums">{perf.inferMs} ms</span></div>
          <div className="flex justify-between gap-4"><span className="opacity-70">마스크 생성</span><span className="tabular-nums">{perf.maskMs} ms</span></div>
          <div className="flex justify-between gap-4"><span className="opacity-70">처리</span><span>메인 스레드(폴백)</span></div>
        </>
      )}
      <div className="flex justify-between gap-4"><span className="opacity-70">상태</span><span>{segmenterStatus}</span></div>
      <div className="h-px bg-white/20 my-1" />
      <button
        type="button"
        role="switch"
        aria-checked={useGpuDelegate}
        onClick={() => setDelegate(!useGpuDelegate)}
        className="flex items-center justify-between gap-3 w-full"
      >
        <span>GPU 가속 {useGpuDelegate ? "(WebGL)" : "(끔 · CPU/WASM)"}</span>
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${useGpuDelegate ? "bg-emerald-500" : "bg-slate-500"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useGpuDelegate ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={useLightModel}
        onClick={() => setModel(!useLightModel)}
        className="flex items-center justify-between gap-3 w-full"
      >
        <span>경량 모델 {useLightModel ? "(빠름·selfie)" : "(정밀·멀티클래스)"}</span>
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${useLightModel ? "bg-emerald-500" : "bg-slate-500"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useLightModel ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={useWorker}
        onClick={() => setWorkerEnabled(!useWorker)}
        className="flex items-center justify-between gap-3 w-full"
      >
        <span>Web Worker {useWorker ? "(분리)" : "(끔 · 메인 스레드)"}</span>
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${useWorker ? "bg-emerald-500" : "bg-slate-500"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useWorker ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={maskSmoothQuality === "high"}
        onClick={() => setMaskSmoothQuality(maskSmoothQuality === "high" ? "low" : "high")}
        className="flex items-center justify-between gap-3 w-full"
      >
        <span>마스크 업스케일 {maskSmoothQuality === "high" ? "(고품질)" : "(기본 · 거칠음)"}</span>
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${maskSmoothQuality === "high" ? "bg-emerald-500" : "bg-slate-500"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${maskSmoothQuality === "high" ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
      </button>
      {/* 메인 스레드 추론 스로틀 간격(ms). 워커 경로에선 무시되므로 흐리게 표시. */}
      <div className={`flex items-center justify-between gap-2 ${useWorker ? "opacity-40" : ""}`}>
        <span>스로틀{useWorker ? "(워커 미적용)" : ""}</span>
        <span className="flex gap-1">
          {[10, 20, 50, 100, 150, 200].map((ms) => (
            <button
              key={ms}
              type="button"
              onClick={() => chooseInterval(ms)}
              className={`px-1.5 py-0.5 rounded tabular-nums ${inferenceInterval === ms ? "bg-emerald-500 text-white" : "bg-white/15 hover:bg-white/25"}`}
            >
              {ms}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
