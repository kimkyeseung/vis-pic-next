// 이미지 뱅크(배경·프레임·스티커) 목록 항목 매핑 — 순수 함수(컴포넌트와 테스트가 공유).

export interface Bg {
  id: number;
  name: string;
  filename: string;
}

/** 편집 다이얼로그에 넘기기 위한 확장 정보. */
export interface BankImage extends Bg {
  priority: number;
  deviceIds: string[];
  imageType: number;
  focalX: number;
  focalY: number;
}

export type BankImageInput = {
  id: number;
  name: string;
  filename: string;
  priority?: number;
  deviceIds?: string[];
  imageType?: number;
  focalX?: number;
  focalY?: number;
};

/**
 * 목록 API 응답 항목을 BankImage로 정규화한다.
 * focalX/focalY는 편집 다이얼로그(프레임 포컬)가 소비하므로 반드시 보존한다 —
 * 여기서 누락되면 이름만 바꿔 저장해도 포컬이 0.5로 초기화되는 조용한 데이터 손실이 된다.
 * 값이 없거나 숫자가 아니면 0.5 기본값(0은 유효값으로 유지).
 */
export function toBankImage(i: BankImageInput, fallbackType: number): BankImage {
  return {
    id: i.id,
    name: i.name,
    filename: i.filename,
    priority: i.priority ?? 0,
    deviceIds: i.deviceIds ?? [],
    imageType: i.imageType ?? fallbackType,
    focalX: typeof i.focalX === "number" ? i.focalX : 0.5,
    focalY: typeof i.focalY === "number" ? i.focalY : 0.5,
  };
}
