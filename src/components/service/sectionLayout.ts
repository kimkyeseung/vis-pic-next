import type { Locale } from "@/i18n/translations";

/**
 * 서비스 화면 각 섹션 래퍼의 공통 레이아웃 + 외곽 여백 클래스.
 * grid-rows(제목/콘텐츠 행 구성)는 섹션마다 달라 별도로 덧붙인다.
 * 예: `${getServiceSectionClass(lang)} grid-rows-[auto_1fr]`
 *     `${getServiceSectionClass(lang)} grid-rows-[auto_auto_1fr]`
 *
 * 외곽 여백을 조정할 땐 여기 한 곳만 고치면 모든 섹션에 반영된다.
 * pt-[245px]/pt-[173px]/pt-[202px]는 리터럴로 남겨야 Tailwind가 정적 스캔으로 클래스를
 * 인식한다(동적 조합 `pt-[${n}px]` 금지 — ROWS_CLASS와 동일한 이유, SectionShell.tsx 참고).
 */
export function getServiceSectionClass(lang: Locale): string {
  return `w-full h-full grid justify-items-center relative z-10 pt-14 ${getServicePortraitTopClass(lang)} pb-52 portrait:pb-40`;
}

/**
 * 세로(1080×1920) 화면 타이틀 상단 여백 — 언어별 타이틀 길이/줄바꿈 차이에 맞춰 보정한다.
 * 영문 ≈9%(≈173px), 일본어 ≈10.5%(≈202px), 그 외(한국어·중국어)는 ≈15% 중심(≈245px 여백).
 * 섹션 껍데기를 따로 쓰는 완료 화면도 타이틀 위치를 맞추려고 이 값만 가져다 쓴다.
 */
export function getServicePortraitTopClass(lang: Locale): string {
  return lang === "en" ? "portrait:pt-[173px]" :
    lang === "ja" ? "portrait:pt-[202px]" :
    "portrait:pt-[245px]";
}

/**
 * 대형 강조 버튼(촬영하기 · 다음)의 크기/모양 공용 클래스 — 색상은 각 버튼이 별도 지정한다.
 * 촬영하기(CameraSection)와 다음(ServiceNav)이 이 상수를 함께 써서 항상 같은 크기를 유지한다.
 * 버튼을 더 키우거나 줄일 땐 여기 한 곳만 고치면 두 버튼에 동시 반영된다.
 */
export const SERVICE_BIG_BUTTON_CLASS =
  "tracking-widest rounded-[22px] font-extrabold text-5xl px-28 py-8 portrait:px-20 portrait:py-[3.35rem] min-w-[34rem] portrait:min-w-[46rem]";
