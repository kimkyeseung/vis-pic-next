// 촬영 배경 이미지 타입 id (prisma seed: ImageType id 1 = background)
export const BACKGROUND_IMAGE_TYPE = 1;

// 프레임(인화 배경) 이미지 타입 id (prisma seed: ImageType id 2 = image)
export const FRAME_IMAGE_TYPE = 2;

// 스티커 이미지 타입 id (prisma seed: ImageType id 3 = sticker)
export const STICKER_IMAGE_TYPE = 3;

// 테마 배경화면(wallpaper) / 로고 / 버튼 이미지 타입 id (prisma seed)
export const WALLPAPER_IMAGE_TYPE = 5;
export const LOGO_IMAGE_TYPE = 6;
export const BUTTON_IMAGE_TYPE = 7;

// 첫(대기) 화면 배경화면은 가로/세로 두 장을 따로 업로드한다.
// 같은 imageType(5) 안에서 name으로 구분한다. 기존 단일 배경화면은 name "wallpaper"였으므로
// 이를 가로용으로 유지해 하위호환한다(세로 미설정 시 서비스는 가로 이미지로 폴백).
export const WALLPAPER_NAME_LANDSCAPE = "wallpaper";
export const WALLPAPER_NAME_PORTRAIT = "wallpaper_portrait";

// 첫 화면을 제외한 나머지 서비스 화면(그동안 '배경 단색'만 쓰이던 자리)에 깔리는 배경화면.
// 첫 화면과 마찬가지로 같은 imageType(5) 안에서 name으로 가로/세로를 구분한다.
// 미설정 시 기존대로 배경 단색이 사용된다.
export const WALLPAPER_NAME_SUB_LANDSCAPE = "wallpaper_sub";
export const WALLPAPER_NAME_SUB_PORTRAIT = "wallpaper_sub_portrait";

// 화면별 배경화면 — 첫 화면을 제외한 각 단계에 개별 배경을 지정한다(같은 imageType 5, name으로 구분).
// CSS 캐스케이드처럼 "화면별 이미지 → 공통(나머지 화면) 이미지 → 배경 단색" 순으로 적용된다.
// Image.name이 VarChar(32)라 짧은 접두어(wp_)를 쓴다.
export const WALLPAPER_PAGE_STEPS = [
  { step: "payment", label: "결제" },
  { step: "frame", label: "프레임(컷) 선택" },
  { step: "background", label: "배경 선택" },
  { step: "camera", label: "촬영" },
  { step: "select", label: "사진 선택" },
  { step: "printbg", label: "인쇄 프레임 선택" },
  { step: "complete", label: "완료(인쇄)" },
] as const;
export type WallpaperPageStep = (typeof WALLPAPER_PAGE_STEPS)[number]["step"];
export function wallpaperPageName(step: WallpaperPageStep, portrait: boolean): string {
  return `wp_${step}${portrait ? "_pt" : ""}`;
}

// 촬영 화면 안내 오버레이 — 카메라 미리보기(4:3) 위에 겹쳐 보이는 안내 이미지(예: "손바닥을 펴세요").
// 화면 표시용이며 촬영본에는 합성되지 않는다. 같은 imageType 5 안에서 name으로 구분.
export const OVERLAY_NAME_CAMERA = "overlay_camera";

// 대형 강조 버튼(촬영하기·다음·결제하기) 배경 이미지도 같은 imageType(7) 안에서
// name으로 구분해 버튼별로 따로 업로드한다.
export const BUTTON_NAME_CAPTURE = "button_capture";
export const BUTTON_NAME_NEXT = "button_next";
export const BUTTON_NAME_PAYMENT = "button_payment";

// 버튼 이미지를 올리면 버튼이 이 고정 크기(px, 1920×1080 / 1080×1920 스테이지 기준)로 바뀐다.
// 관리자 화면에 권장 이미지 크기로 그대로 안내되므로, 디자이너는 이 크기로 제작하면 된다.
// 값은 기존 단색 버튼(SERVICE_BIG_BUTTON_CLASS)의 실측 크기와 같게 잡아 이미지 유무로 레이아웃이 흔들리지 않게 했다.
export const BUTTON_IMAGE_SIZE = {
  landscape: { width: 544, height: 116 },
  portrait: { width: 736, height: 160 },
} as const;

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
/** 제스처 값에 해당하는 안내용 이모지 — label의 "설명 이모지" 표기에서 이모지만 뽑아 쓴다. */
export function getGestureEmoji(gesture: string): string | null {
  const g = EFFECT_TRIGGER_GESTURES.find((x) => x.value === gesture);
  if (!g) return null;
  return g.label.split(" ").pop() ?? null;
}
// 관리자가 지속시간을 지정하지 않은 배경의 기본 최대 재생 시간(초).
export const DEFAULT_EFFECT_DURATION = 4;
// 관리자 설정 UI에서 허용하는 지속시간 범위(초).
export const EFFECT_DURATION_RANGE = { min: 1, max: 30 } as const;
// 이펙트 영상으로 허용하는 파일 확장자.
export const EFFECT_VIDEO_EXTENSIONS = ["mp4", "webm"] as const;

// ── 이펙트 재생 모드 ──
// 레이어 순서는 항상 배경 → 이펙트 → 사람. 프리뷰뿐 아니라 촬영본(captureHiRes)에도
// 동일하게 합성되므로, 촬영 순간 재생 중이던 이펙트는 사진에 담긴다.
// dissolve: 영상을 배경 위·사람 아래에 블렌드 오버레이로 1회 재생.
// transition: 트리거 시 배경이 영상으로 전환, 다시 트리거하면 원배경으로 복귀(제스처 토글).
// chromakey: dissolve처럼 오버레이하되 키 색상을 제거하고 남은 부분만 합성.
export const EFFECT_MODES = [
  { value: "dissolve", label: "디졸브 (블렌드 오버레이)" },
  { value: "transition", label: "트랜지션 (배경 전환)" },
  { value: "chromakey", label: "크로마키 (키색 제거 오버레이)" },
] as const;
export const DEFAULT_EFFECT_MODE = "dissolve";
/** 저장된 모드 값 검증. 아니면 기본값(dissolve). */
export function normalizeEffectMode(v: string | null | undefined): string {
  return EFFECT_MODES.some((m) => m.value === v) ? (v as string) : DEFAULT_EFFECT_MODE;
}

// 디졸브 모드 블렌드 방식(CSS mix-blend-mode 값). 검은 배경 이펙트 영상엔 screen이 무난.
export const EFFECT_BLEND_MODES = [
  { value: "screen", label: "스크린 (밝게 — 검은 배경 영상)" },
  { value: "lighten", label: "라이튼 (밝은 픽셀 우선)" },
  { value: "overlay", label: "오버레이 (대비 강조)" },
  { value: "hard-light", label: "하드라이트" },
  { value: "multiply", label: "멀티플라이 (어둡게)" },
  { value: "normal", label: "노멀 (불투명 덮기)" },
] as const;
export const DEFAULT_EFFECT_BLEND_MODE = "screen";
/** 저장된 블렌드 값 검증. 아니면 기본값(screen). */
export function normalizeEffectBlendMode(v: string | null | undefined): string {
  return EFFECT_BLEND_MODES.some((m) => m.value === v) ? (v as string) : DEFAULT_EFFECT_BLEND_MODE;
}

// 트랜지션 모드 전환 효과.
export const EFFECT_TRANSITIONS = [
  { value: "fade", label: "페이드 (크로스페이드)" },
  { value: "cut", label: "즉시 전환" },
] as const;
export const DEFAULT_EFFECT_TRANSITION = "fade";
/** 저장된 전환 효과 값 검증. 아니면 기본값(fade). */
export function normalizeEffectTransition(v: string | null | undefined): string {
  return EFFECT_TRANSITIONS.some((t) => t.value === v) ? (v as string) : DEFAULT_EFFECT_TRANSITION;
}
// 트랜지션(크로스페이드) 지속 시간(ms) 허용 범위·기본값. 0이면 즉시(cut과 동일).
export const EFFECT_TRANSITION_MS_RANGE = { min: 0, max: 3000 } as const;
export const DEFAULT_EFFECT_TRANSITION_MS = 600;

// 크로마키 모드 기본값. 감도·부드러움은 메인 크로마키(§Chromakey)와 동일한 파생 규칙을 쓴다.
export const DEFAULT_EFFECT_CHROMA_COLOR = "0,255,0";
export const DEFAULT_EFFECT_CHROMA_SIMILARITY = 50;
export const DEFAULT_EFFECT_CHROMA_SMOOTHNESS = 50;

/** "R,G,B" 문자열을 0-255 정수 3개로 정규화. 형식이 어긋나면 fallback. */
export function normalizeRgbString(v: string | null | undefined, fallback = DEFAULT_EFFECT_CHROMA_COLOR): string {
  if (typeof v !== "string") return fallback;
  const parts = v.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return parts.map((n) => Math.max(0, Math.min(255, n))).join(",");
}
