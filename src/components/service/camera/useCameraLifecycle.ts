"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCameraResolution } from "@/constants/camera";
import type { CameraResolutionId } from "@/constants/camera";
import type { MessageKey } from "@/i18n/translations";

/**
 * 카메라 장치 획득/해제 수명주기 — 시작/재시도/에러 분류, mock 카메라 모드(관리자 미리보기),
 * 카메라를 못 쓰는 환경에서의 MOCK CAMERA 캔버스 표시까지 담당한다. 배경제거·크로마키·촬영 로직은
 * 이 훅이 채워주는 `videoRef`의 스트림을 그대로 가져다 쓸 뿐 여기서는 다루지 않는다.
 */
export function useCameraLifecycle({
  videoRef,
  displayCanvasRef,
  mockCamera,
  cameraResolution,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  mockCamera: boolean;
  cameraResolution: CameraResolutionId;
}): {
  cameraError: { key: MessageKey; reason?: string } | null;
  cameraDeviceDiag: string | null;
  startCamera: () => Promise<void>;
} {
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<{ key: MessageKey; reason?: string } | null>(null);
  const [cameraDeviceDiag, setCameraDeviceDiag] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [videoRef]);

  const startCamera = useCallback(async () => {
    // 관리자 화면 미리보기: 실제 장치에 접근하지 않고 곧바로 mock 화면으로 대체한다.
    if (mockCamera) {
      stopCamera();
      return;
    }
    for (let attempt = 0; ; attempt++) {
      // 기존 스트림 먼저 정리
      stopCamera();

      try {
        // 관리자 설정 해상도(화질)로 촬영. 모든 티어가 4:3이라 슬롯(4:3) 대비 좌우 잘림이 없다.
        // (프린트 합성 시 슬롯 비율로 center-crop 되므로 원본이 4:3이면 잘림이 사라진다)
        // ideal이므로 카메라가 미지원하면 가장 가까운 해상도로 대체된다.
        const res = getCameraResolution(cameraResolution);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: res.width }, height: { ideal: res.height }, aspectRatio: { ideal: 4 / 3 } },
        });
        cameraStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(null);
        return;
      } catch (err) {
        const e = err as DOMException;
        if (e.name === "NotReadableError" && attempt === 0) {
          // 다른 컨텍스트가 아직 카메라를 점유 중 → 800ms 후 한 번 재시도
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        if (e.name === "NotAllowedError") {
          setCameraError({ key: "camera.errPermission" });
        } else if (e.name === "NotFoundError") {
          setCameraError({ key: "camera.errNotFound" });
          // 진단: 브라우저 레벨 장치 목록 + OS 레벨 장치 목록 수집
          navigator.mediaDevices?.enumerateDevices().then(async (devices) => {
            const videoInputs = devices.filter((d) => d.kind === "videoinput");
            const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
            let osCameras: string[] = [];
            if (isTauri) {
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                osCameras = await invoke<string[]>("get_cameras");
              } catch { /* ignore */ }
            }
            const diag = `브라우저 장치: ${videoInputs.length}개 | OS 장치: ${osCameras.length > 0 ? osCameras.join(", ") : "없음"}`;
            setCameraDeviceDiag(diag);
          }).catch(() => {});
        } else if (e.name === "NotReadableError") {
          setCameraError({ key: "camera.errBusy" });
        } else {
          setCameraError({ key: "camera.errGeneric", reason: e.name || e.message });
        }
        return;
      }
    }
  }, [stopCamera, cameraResolution, mockCamera, videoRef]);

  // 카메라를 쓸 수 없는 브라우저(개발용 프리뷰 등)에서도 실제 카메라와 같은 크기의 mock
  // 화면을 표시 캔버스에 그려둔다 — 이러면 하단 "촬영하기" 버튼이 정상 플로우(카운트다운 →
  // captureHiRes 실패 → snapshotWithStickers 폴백)로 mock 사진을 캡처할 수 있다.
  useEffect(() => {
    if (!cameraError && !mockCamera) return;
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const res = getCameraResolution(cameraResolution);
    canvas.width = res.width;
    canvas.height = res.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, res.width, res.height);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = `bold ${Math.round(res.width * 0.08)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MOCK CAMERA", res.width / 2, res.height / 2);
  }, [cameraError, mockCamera, cameraResolution, displayCanvasRef]);

  useEffect(() => {
    let active = true;
    (async () => {
      await startCamera();
      // 획득이 (재시도 대기 등으로) 늦어지는 동안 언마운트됐다면, 뒤늦게 잡힌
      // 스트림을 정리한다. 안 그러면 카메라가 계속 점유돼 CameraStreamer가
      // 재획득하지 못하고 서브 모니터가 멈춘다.
      if (!active) stopCamera();
    })();
    return () => {
      active = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return { cameraError, cameraDeviceDiag, startCamera };
}
