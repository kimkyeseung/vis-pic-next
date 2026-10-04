// 관리자 계정 입력 규칙 — 계정 관리 화면(클라이언트)과 계정 API(서버)가 같은 규칙을 쓴다.
export const ADMIN_PASSWORD_MIN_LENGTH = 8;
const USERNAME_MAX = 64; // DB VarChar(64)
const NAME_MAX = 64; // DB VarChar(64)

export function validateAdminPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) return "비밀번호를 입력해주세요.";
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) return `비밀번호는 ${ADMIN_PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  return null;
}

export function validateAdminUsername(username: unknown): string | null {
  if (typeof username !== "string" || !username.trim()) return "아이디를 입력해주세요.";
  if (username.trim().length > USERNAME_MAX) return `아이디는 ${USERNAME_MAX}자 이하로 입력해주세요.`;
  return null;
}

export function validateAdminName(name: unknown): string | null {
  if (name === null || name === undefined) return null;
  if (typeof name !== "string") return "이름 형식이 올바르지 않습니다.";
  if (name.trim().length > NAME_MAX) return `이름은 ${NAME_MAX}자 이하로 입력해주세요.`;
  return null;
}
