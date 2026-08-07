// 촬영 배경 이미지 타입 id (prisma seed: ImageType id 1 = background)
export const BACKGROUND_IMAGE_TYPE = 1;

// 프레임(인화 배경) 이미지 타입 id (prisma seed: ImageType id 2 = image)
export const FRAME_IMAGE_TYPE = 2;

// 스티커 이미지 타입 id (prisma seed: ImageType id 3 = sticker)
export const STICKER_IMAGE_TYPE = 3;

// 테마 배경화면(wallpaper) / 로고 이미지 타입 id (prisma seed)
export const WALLPAPER_IMAGE_TYPE = 5;
export const LOGO_IMAGE_TYPE = 6;

// 서비스 화면에 노출할 수 있는 활성 배경의 최대 개수.
// 이 수를 초과해 활성화하려 하면 관리자에서 거부(invalid)된다.
export const MAX_ACTIVE_BACKGROUNDS = 6;

// 지점별로 노출할 수 있는 프레임(인화 배경)의 최대 개수.
export const MAX_ACTIVE_FRAMES = 6;

// 지점별로 노출할 수 있는 스티커의 최대 개수.
export const MAX_ACTIVE_STICKERS = 20;

// ── 배경 이펙트 영상(동작 트리거) ──
// 촬영 화면에서 배경별로 지정한 제스처(MediaPipe GestureRecognizer 카테고리)를 취하면
// 현재 배경의 이펙트 영상이 재생된다. 손바닥(Open_Palm)은 촬영 트리거라 옵션에서 제외한다.
export const EFFECT_TRIGGER_GESTURES = [
  { value: "Victory", label: "브이 ✌️" },
  { value: "Thumb_Up", label: "엄지 척 👍" },
  { value: "Thumb_Down", label: "엄지 아래 👎" },
  { value: "Pointing_Up", label: "검지 위로 ☝️" },
  { value: "ILoveYou", label: "러브 사인 🤟" },
  { value: "Closed_Fist", label: "주먹 ✊" },
] as const;
export const DEFAULT_EFFECT_GESTURE = "Victory";
/** 저장된 제스처 값이 허용 목록에 있는지 검증. 아니면 기본값. */
export function normalizeEffectGesture(v: string | null | undefined): string {
  return EFFECT_TRIGGER_GESTURES.some((g) => g.value === v) ? (v as string) : DEFAULT_EFFECT_GESTURE;
}
// 관리자가 지속시간을 지정하지 않은 배경의 기본 최대 재생 시간(초).
export const DEFAULT_EFFECT_DURATION = 4;
// 관리자 설정 UI에서 허용하는 지속시간 범위(초).
export const EFFECT_DURATION_RANGE = { min: 1, max: 30 } as const;
// 이펙트 영상으로 허용하는 파일 확장자.
export const EFFECT_VIDEO_EXTENSIONS = ["mp4", "webm"] as const;
