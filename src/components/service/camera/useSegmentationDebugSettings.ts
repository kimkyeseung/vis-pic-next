"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * MediaPipe 배경제거 성능 디버그 토글 5종(GPU 델리게이트/경량 모델/Web Worker/추론 스로틀 간격/
 * 마스크 업스케일 품질) — 값과 localStorage 영속화만 담당한다. 이 값들을 실제로 소비해 세그멘터를
 * 재생성하거나 프레임을 처리하는 로직은 `useMediapipeSegmentation`/`useCameraCapture`에 있다.
 * 운영자 전용(디버그 모드에서만 UI 노출 — `SegmentationDebugPanel` 참고), 손님에게는 영향 없음.
 */
export function useSegmentationDebugSettings(): {
  useGpuDelegate: boolean;
  setDelegate: (gpu: boolean) => void;
  useLightModel: boolean;
  setModel: (light: boolean) => void;
  lightModelRef: React.RefObject<boolean>;
  useWorker: boolean;
  setWorkerEnabled: (on: boolean) => void;
  inferenceInterval: number;
  chooseInterval: (ms: number) => void;
  inferenceIntervalRef: React.RefObject<number>;
  maskSmoothQuality: "high" | "low";
  setMaskSmoothQuality: (q: "high" | "low") => void;
  maskSmoothQualityRef: React.RefObject<"high" | "low">;
} {
  // ── 성능 계측(A) & 세그멘테이션 델리게이트 토글(B) — 운영자 디버그 모드에서만 노출 ──
  // 델리게이트: CPU(WASM) ↔ GPU(WebGL). 값이 바뀌면 세그멘터 재생성 effect(useMediapipeSegmentation)가
  // 세그멘터를 재생성한다. localStorage에 저장돼 앱 재시작에도 유지된다(SSR 기본 false → effect에서 복원).
  // 기본값 GPU(WebGL). 운영자가 디버그 토글로 명시적으로 CPU를 선택한 경우에만 CPU로 복원한다.
  const [useGpuDelegate, setUseGpuDelegate] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { setUseGpuDelegate(localStorage.getItem("photobooth_seg_delegate") !== "cpu"); } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const setDelegate = useCallback((gpu: boolean) => {
    setUseGpuDelegate(gpu);
    try { localStorage.setItem("photobooth_seg_delegate", gpu ? "gpu" : "cpu"); } catch {}
  }, []);
  // 세그멘테이션 모델 토글: 경량 selfie_segmenter(249KB, 빠름) ↔ 멀티클래스(16MB, 정밀).
  // 경량은 배경 처리 품질이 떨어져 기본은 정밀(멀티클래스). 값이 바뀌면 세그멘터/워커가 재생성된다.
  // 극성이 반대라(경량 masks[0]=전경, 멀티클래스 masks[0]=배경) 모델과 극성을 함께 전환한다.
  const [useLightModel, setUseLightModel] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { setUseLightModel(localStorage.getItem("photobooth_seg_model") === "light"); } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const setModel = useCallback((light: boolean) => {
    setUseLightModel(light);
    try { localStorage.setItem("photobooth_seg_model", light ? "light" : "multiclass"); } catch {}
  }, []);
  // 메인 스레드 폴백 경로가 deps 재생성 없이 최신 극성을 읽도록 ref로도 보관.
  const lightModelRef = useRef(false);
  useEffect(() => { lightModelRef.current = useLightModel; }, [useLightModel]);
  // Web Worker 토글: 추론을 워커로 분리(기본 false = 메인 스레드). 값이 바뀌면 세그멘터/워커가 재생성된다.
  const [useWorker, setUseWorker] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { setUseWorker(localStorage.getItem("photobooth_seg_worker") === "on"); } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const setWorkerEnabled = useCallback((on: boolean) => {
    setUseWorker(on);
    try { localStorage.setItem("photobooth_seg_worker", on ? "on" : "off"); } catch {}
  }, []);
  // 메인 스레드 추론 스로틀 간격(ms). 낮을수록 마스크가 자주 갱신돼 잔상↓이지만 메인 스레드 부하↑.
  // 워커 경로는 이 값을 쓰지 않는다(busy 플래그로 왕복 속도만큼 갱신).
  const [inferenceInterval, setInferenceInterval] = useState(50);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const v = Number(localStorage.getItem("photobooth_seg_interval"));
        if ([10, 20, 50, 100, 150, 200].includes(v)) setInferenceInterval(v);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  // rAF 루프(무-deps)가 최신 값을 읽도록 ref로 보관 — 값이 바뀌어도 루프를 재생성하지 않는다.
  const inferenceIntervalRef = useRef(50);
  useEffect(() => { inferenceIntervalRef.current = inferenceInterval; }, [inferenceInterval]);
  const chooseInterval = useCallback((ms: number) => {
    setInferenceInterval(ms);
    try { localStorage.setItem("photobooth_seg_interval", String(ms)); } catch {}
  }, []);
  // 마스크 업스케일 스무딩 품질: 256×256 confidence mask를 프리뷰/촬영 해상도로 확대해
  // destination-in 합성할 때 쓰는 imageSmoothingQuality. 명시하지 않으면 브라우저 기본값인
  // "low"로 동작해 경계가 거칠어 보인다("high" 기본 적용, 필요시 디버그 토글로 비교).
  const [maskSmoothQuality, setMaskSmoothQualityState] = useState<"high" | "low">("high");
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const v = localStorage.getItem("photobooth_seg_smoothquality");
        if (v === "high" || v === "low") setMaskSmoothQualityState(v);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const setMaskSmoothQuality = useCallback((q: "high" | "low") => {
    setMaskSmoothQualityState(q);
    try { localStorage.setItem("photobooth_seg_smoothquality", q); } catch {}
  }, []);
  // 무-deps rAF 표시 루프(processFrame)가 최신 값을 읽도록 ref로도 보관.
  const maskSmoothQualityRef = useRef<"high" | "low">("high");
  useEffect(() => { maskSmoothQualityRef.current = maskSmoothQuality; }, [maskSmoothQuality]);

  return {
    useGpuDelegate,
    setDelegate,
    useLightModel,
    setModel,
    lightModelRef,
    useWorker,
    setWorkerEnabled,
    inferenceInterval,
    chooseInterval,
    inferenceIntervalRef,
    maskSmoothQuality,
    setMaskSmoothQuality,
    maskSmoothQualityRef,
  };
}
