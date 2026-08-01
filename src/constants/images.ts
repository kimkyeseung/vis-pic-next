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
