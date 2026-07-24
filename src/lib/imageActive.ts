import prisma from "@/lib/db";
import { BACKGROUND_IMAGE_TYPE, MAX_ACTIVE_BACKGROUNDS } from "@/constants/images";

/**
 * 새로 업로드되는 이미지의 초기 active 값.
 * 배경(type 1)은 이미 최대치(MAX_ACTIVE_BACKGROUNDS)만큼 활성이면 비활성으로 생성해
 * "활성 배경 최대 6개" 불변식을 업로드 경로에서도 유지한다. 그 외 타입은 항상 활성.
 */
export async function defaultActiveForNewImage(imageType: number): Promise<boolean> {
  if (imageType !== BACKGROUND_IMAGE_TYPE) return true;
  const activeCount = await prisma.image.count({
    where: { imageType: BACKGROUND_IMAGE_TYPE, active: true },
  });
  return activeCount < MAX_ACTIVE_BACKGROUNDS;
}
