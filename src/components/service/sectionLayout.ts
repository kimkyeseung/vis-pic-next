/**
 * 서비스 화면 각 섹션 래퍼의 공통 레이아웃 + 외곽 여백 클래스.
 * grid-rows(제목/콘텐츠 행 구성)는 섹션마다 달라 별도로 덧붙인다.
 * 예: `${SERVICE_SECTION_CLASS} grid-rows-[auto_1fr]`
 *     `${SERVICE_SECTION_CLASS} grid-rows-[auto_auto_1fr]`
 *
 * 외곽 여백을 조정할 땐 여기 한 곳만 고치면 모든 섹션에 반영된다.
 */
export const SERVICE_SECTION_CLASS =
  "w-full h-full grid justify-items-center relative z-10 pt-14 portrait:pt-10 pb-52 portrait:pb-40";
