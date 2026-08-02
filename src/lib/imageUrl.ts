/**
 * 이미지 소스 문자열을 실제 표시 가능한 URL로 해석한다.
 *
 * - 완전한 URL(`http(s):`)·데이터 URI(`data:`)·`blob:`·절대경로(`/…`)는 그대로 사용
 *   (미리보기 목업 data URI, 외부 URL 대응).
 * - 그 외(순수 파일명 또는 실수로 붙은 경로 프리픽스)는 basename만 취해 `baseUrl` 뒤에 붙인다.
 * - 빈 값은 빈 문자열.
 *
 * 서비스 화면의 배경/프레임 썸네일·미리보기·합성이 이 규칙을 공유한다.
 */
const ABSOLUTE_SRC = /^(https?:|data:|blob:|\/)/;

export function resolveImageSrc(value: string, baseUrl: string): string {
  if (!value) return "";
  if (ABSOLUTE_SRC.test(value)) return value;
  const filename = value.split("/").pop() ?? value;
  return `${baseUrl}/${filename}`;
}
