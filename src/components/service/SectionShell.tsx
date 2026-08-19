import type { ReactNode } from "react";
import type { MessageKey } from "@/i18n/translations";
import { ServiceNav } from "./ServiceNav";
import { SERVICE_SECTION_CLASS } from "./sectionLayout";

/**
 * 서비스 화면 공통 타이틀(h2). 모든 단계의 큰 제목 스타일을 여기 한 곳에 모은다.
 * 색/그림자/등장 애니메이션을 바꿀 땐 이 컴포넌트만 고치면 전 화면에 반영된다.
 * text-center·mb-*·whitespace-pre-line 같은 화면별 차이는 className으로 덧붙인다.
 */
export function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-title font-extrabold text-white leading-[1.2] animate-fadeInDown ${className}`}
      style={{ textShadow: "0 2px 15px rgba(0,0,0,0.5)" }}
    >
      {children}
    </h2>
  );
}

/**
 * grid-rows 리터럴 매핑. Tailwind JIT은 arbitrary 클래스를 소스에서 "정적으로" 발견해야
 * CSS를 생성하므로 `grid-rows-[${rows}]`처럼 동적 조합하면 안 된다.
 * 각 리터럴을 이 파일 안에 그대로 둬서 Tailwind 스캐너가 인식하게 한다.
 */
const ROWS_CLASS = {
  "auto_1fr": "grid-rows-[auto_1fr]",
  "auto_auto_1fr": "grid-rows-[auto_auto_1fr]",
} as const;

/**
 * 서비스 화면 공통 3단 껍데기: [타이틀] · [본문(children)] · [하단 다음 버튼].
 * - 외곽 여백/그리드 뼈대는 SERVICE_SECTION_CLASS + rows 로 통일한다.
 * - 본문은 단계마다 완전히 달라 children으로 각 섹션이 직접 넘긴다.
 * - 하단 버튼은 ServiceNav 하나로 공통.
 *
 * 조건부 타이틀·커스텀 하단바를 쓰는 결제/완료 화면은 이 껍데기 대신
 * SectionTitle만 골라 쓴다.
 */
export function SectionShell({
  title,
  titleClassName = "text-center",
  rows = "auto_1fr",
  className = "",
  children,
  onNext,
  onPrev,
  nextKey,
  nextDisabled,
}: {
  title: ReactNode;
  /** 타이틀에 덧붙일 화면별 클래스 (기본: 가운데 정렬) */
  titleClassName?: string;
  /** 그리드 행 구성 — 본문 위에 부제(<p>)가 하나 더 있으면 "auto_auto_1fr" */
  rows?: keyof typeof ROWS_CLASS;
  /** <section>에 덧붙일 클래스 (예: 좌우 여백 px-16) */
  className?: string;
  children: ReactNode;
  onNext: () => void;
  onPrev?: () => void;
  nextKey?: MessageKey;
  nextDisabled?: boolean;
}) {
  return (
    <section className={`${SERVICE_SECTION_CLASS} ${ROWS_CLASS[rows]} ${className}`}>
      <SectionTitle className={titleClassName}>{title}</SectionTitle>
      {children}
      <ServiceNav onNext={onNext} onPrev={onPrev} nextKey={nextKey} nextDisabled={nextDisabled} />
    </section>
  );
}
