// 촬영 카메라 해상도(화질) 티어.
// 인화 슬롯이 4:3이라 좌우 잘림을 없애려 모든 티어를 4:3으로 정의한다(촬영 요청에 aspectRatio 4/3 유지).
// getUserMedia에는 ideal로만 넘기므로, 카메라가 해당 해상도를 지원하지 않으면 가장 가까운 값으로 대체된다.
export type CameraResolutionId = "low" | "sd" | "hd" | "fhd" | "uhd";

export interface CameraResolution {
  id: CameraResolutionId;
  label: string;
  width: number;
  height: number;
}

export const CAMERA_RESOLUTIONS: readonly CameraResolution[] = [
  { id: "low", label: "가장 낮음 (320×240)", width: 320, height: 240 },
  { id: "sd", label: "SD (640×480)", width: 640, height: 480 },
  { id: "hd", label: "HD (960×720)", width: 960, height: 720 },
  { id: "fhd", label: "FHD (1440×1080)", width: 1440, height: 1080 },
  { id: "uhd", label: "4K (2880×2160)", width: 2880, height: 2160 },
] as const;

// 기존 하드코딩(1440×1080)과 동일 — 미설정 시 화질 변화가 없도록 한다.
export const DEFAULT_CAMERA_RESOLUTION: CameraResolutionId = "fhd";

/** id로 해상도 티어를 찾는다. 알 수 없는 값이면 기본(FHD) 티어를 반환. */
export function getCameraResolution(id: string): CameraResolution {
  return (
    CAMERA_RESOLUTIONS.find((r) => r.id === id) ??
    CAMERA_RESOLUTIONS.find((r) => r.id === DEFAULT_CAMERA_RESOLUTION)!
  );
}
