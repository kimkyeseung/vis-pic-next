"use client";

import { useEffect, useRef } from "react";
import type { GestureRecognizer } from "@mediapipe/tasks-vision";
import { handRectsFromLandmarks, type NormRect } from "@/lib/segmentMask";

/**
 * 손동작 인식 서브시스템 — 손바닥(Open_Palm)으로 촬영 트리거, 배경에 지정된 트리거 제스처로
 * 이펙트 영상 트리거. 배경제거(MediaPipe) 여부와 무관하게 항상 동작하며, 같은 tasks-vision
 * 패키지·WASM 파일셋을 재사용한다(별도 GestureRecognizer 인스턴스).
 *
 * 콜백은 `*Ref`로만 받는다 — rAF 감지 루프를 매 렌더 재생성하지 않기 위해 호출부가 최신 함수를
 * ref에 담아 넘기는 계약이다(호출부: `CameraSection.tsx`가 `handleManualCaptureRef`/
 * `onEffectTriggerRef`/`effectGestureRef`를 유지).
 *
 * 부산물로 **손 위치(`handRectsRef`)** 도 내보낸다. 인식기는 어차피 랜드마크 21점을 함께
 * 돌려주는데 지금까지 제스처 이름만 쓰고 버리고 있었다 — 배경제거의 "손 구제"(손 주변만 전경
 * 컷오프를 낮춰 손끝이 잘리는 걸 막는다)가 이 값을 쓰므로 추가 추론 비용이 0이다.
 */
export function useHandGestureCapture({
  videoRef,
  countdownRef,
  handleManualCaptureRef,
  onEffectTriggerRef,
  effectGestureRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  countdownRef: React.RefObject<number | null>;
  handleManualCaptureRef: React.RefObject<() => void>;
  onEffectTriggerRef: React.RefObject<() => void>;
  effectGestureRef: React.RefObject<string>;
}): { handRectsRef: React.RefObject<NormRect[]> } {
  const gestureRef = useRef<GestureRecognizer | null>(null);
  // 최근 인식된 손을 감싸는 영역(프레임 정규화 좌표). 손이 없으면 빈 배열.
  // 합성 루프(무-deps)가 읽으므로 ref로 둔다.
  const handRectsRef = useRef<NormRect[]>([]);

  // 손바닥(Open_Palm) 제스처 인식기 초기화 — 배경 제거 모드와 무관하게 항상 동작.
  // 배경제거용 ImageSegmenter와 같은 tasks-vision 패키지·WASM 파일셋을 재사용한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // WASM 초기화 중 내부 stdout/stderr 로그 억제 (세그멘터 init과 동일 처리)
      const noop = () => {};
      const origLog = console.log, origInfo = console.info, origWarn = console.warn;
      console.log = noop; console.info = noop; console.warn = noop;
      try {
        const { FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks("/static/mediapipe/wasm");
        if (cancelled) return;
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/static/mediapipe/model/gesture_recognizer.task" },
          runningMode: "VIDEO",
          numHands: 1,
        });
        if (cancelled) { recognizer.close(); return; }
        gestureRef.current = recognizer;
      } catch {
        // 초기화 실패 시 제스처 촬영만 비활성 — 버튼 촬영은 그대로 동작
      } finally {
        console.log = origLog; console.info = origInfo; console.warn = origWarn;
      }
    })();
    return () => {
      cancelled = true;
      gestureRef.current?.close();
      gestureRef.current = null;
    };
  }, []);

  // 손바닥을 펼쳐 보이면 "촬영하기" 버튼 클릭과 동일하게 촬영을 트리거한다.
  // - 세그멘터와 동시 구동 부하를 줄이려 추론은 스로틀링.
  // - HOLD_MS 이상 유지돼야 발동(순간 오탐 방지).
  // - 재발동(re-arm): (1) 손을 내리면(비-손바닥 프레임) 즉시, 또는 (2) 촬영이 끝난 뒤
  //   REARM_COOLDOWN_MS가 지나면 손바닥을 계속 든 상태에서도 자동으로. 포토부스 사용자가
  //   손을 든 채 연속 촬영할 수 있게 하되, 촬영 직후 즉시 재발동되진 않도록 쿨다운을 둔다.
  //   촬영 중(countdown)에는 capturePhoto 내부 가드가 재트리거를 막는다.
  useEffect(() => {
    let raf = 0;
    const GESTURE_INTERVAL_MS = 200;
    const HOLD_MS = 500;
    const REARM_COOLDOWN_MS = 1200; // 촬영 완료 후 손바닥 유지 시 자동 재발동까지의 간격
    const MIN_SCORE = 0.6;
    let lastInfer = 0;
    let palmSince = 0;
    let palmArmed = true;
    let rearmAt = 0;          // >0: 이 시각 이후 손바닥 유지 상태에서 자동 재무장
    let prevCapturing = false; // 직전 틱의 촬영(countdown) 진행 여부
    // V사인(트리거 제스처) → 배경 이펙트 영상. 손바닥과 독립적으로 arming을 관리한다.
    let triggerSince = 0;
    let triggerArmed = true;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const recognizer = gestureRef.current;
      const video = videoRef.current;
      if (!recognizer || !video || video.readyState < 2 || !video.videoWidth) return;
      const now = performance.now();
      if (now - lastInfer < GESTURE_INTERVAL_MS) return;
      lastInfer = now;

      let name: string | undefined;
      let score = 0;
      try {
        const res = recognizer.recognizeForVideo(video, now);
        const g = res.gestures?.[0]?.[0];
        name = g?.categoryName;
        score = g?.score ?? 0;
        // 제스처와 함께 오는 랜드마크로 손 영역을 갱신한다(배경제거 손 구제용, 추가 비용 없음).
        handRectsRef.current = handRectsFromLandmarks(res.landmarks ?? []);
      } catch {
        return;
      }

      const isPalm = name === "Open_Palm" && score >= MIN_SCORE;
      const isTrigger = !!name && name === effectGestureRef.current && score >= MIN_SCORE;

      // 촬영이 끝나는 순간(진행중 true→false)에 쿨다운 시작 → 이후 손바닥 유지 시 자동 재무장.
      const capturing = countdownRef.current !== null;
      if (prevCapturing && !capturing) rearmAt = now + REARM_COOLDOWN_MS;
      prevCapturing = capturing;

      // 손바닥 → 촬영
      if (isPalm) {
        if (palmSince === 0) palmSince = now;
        // 손을 든 채로도 촬영 완료 + 쿨다운 경과 시 자동 재무장(포토부스 연속 촬영).
        if (!palmArmed && !capturing && rearmAt > 0 && now >= rearmAt) {
          palmArmed = true;
          palmSince = now;
          rearmAt = 0;
        }
        if (palmArmed && now - palmSince >= HOLD_MS) {
          palmArmed = false;
          rearmAt = 0;
          handleManualCaptureRef.current();
        }
      } else {
        // 손을 내리면 즉시 재무장.
        palmSince = 0;
        palmArmed = true;
        rearmAt = 0;
      }

      // 트리거 제스처 → 이펙트 발동(모드별 분기). 한 번 발동 후 손을 내렸다 다시 취해야 재발동.
      if (isTrigger) {
        if (triggerSince === 0) triggerSince = now;
        if (triggerArmed && now - triggerSince >= HOLD_MS) {
          triggerArmed = false;
          onEffectTriggerRef.current();
        }
      } else {
        triggerSince = 0;
        triggerArmed = true;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      handRectsRef.current = [];
    };
  }, [videoRef, countdownRef, handleManualCaptureRef, onEffectTriggerRef, effectGestureRef]);

  return { handRectsRef };
}
