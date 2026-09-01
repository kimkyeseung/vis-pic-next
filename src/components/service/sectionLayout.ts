/**
 * 서비스 화면 각 섹션 래퍼의 공통 레이아웃 + 외곽 여백 클래스.
 * grid-rows(제목/콘텐츠 행 구성)는 섹션마다 달라 별도로 덧붙인다.
 * 예: `${SERVICE_SECTION_CLASS} grid-rows-[auto_1fr]`
 *     `${SERVICE_SECTION_CLASS} grid-rows-[auto_auto_1fr]`
 *
 * 외곽 여백을 조정할 땐 여기 한 곳만 고치면 모든 섹션에 반영된다.
 */
export const SERVICE_SECTION_CLASS =
  // 세로(1080×1920)에서 타이틀 세로 중심을 상단 ≈15%(≈288px)에 맞추려 pt-[245px]로 키움.
  "w-full h-full grid justify-items-center relative z-10 pt-14 portrait:pt-[245px] pb-52 portrait:pb-40";

/**
 * 대형 강조 버튼(촬영하기 · 다음)의 크기/모양 공용 클래스 — 색상은 각 버튼이 별도 지정한다.
 * 촬영하기(CameraSection)와 다음(ServiceNav)이 이 상수를 함께 써서 항상 같은 크기를 유지한다.
 * 버튼을 더 키우거나 줄일 땐 여기 한 곳만 고치면 두 버튼에 동시 반영된다.
 */
export const SERVICE_BIG_BUTTON_CLASS =
  "tracking-widest rounded-[22px] font-extrabold text-5xl px-28 py-8 portrait:px-20 portrait:py-[3.35rem] min-w-[34rem] portrait:min-w-[46rem]";
