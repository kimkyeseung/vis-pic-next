import prisma from "@/lib/db";

/**
 * 관리자 결제 설정에서 편집하는 PayApp 연동 키. 공개 설정 조회 API에서는 숨긴다(isPayappSettingKey).
 * 상점명(shopname)은 PayApp JS API 전용 파라미터라 서버 결제요청(REST payrequest)에는 쓸 곳이 없어 두지 않는다.
 */
export const PAYAPP_SETTING_KEYS = [
  "PAYAPP_USERID",
  "PAYAPP_GOODNAME",
  "PAYAPP_RECVPHONE",
  "PAYAPP_FEEDBACK_URL",
  "PAYAPP_RETURN_URL",
  "PAYAPP_OPENPAYTYPE",
] as const;

type PayappSettingKey = (typeof PAYAPP_SETTING_KEYS)[number];

export type PayappConfig = {
  userid: string;
  goodname: string;
  recvphone: string;
  feedbackurl: string;
  returnurl: string;
  openpaytype: string;
};

/**
 * PayApp 연동 값은 판매자 정보·전화번호라, 인증 없이 열려 있는 설정 조회 API(키오스크가 사용)로
 * 내보내지 않는다. 관리자 세션일 때만 포함한다.
 */
export function isPayappSettingKey(name: string): boolean {
  return name.startsWith("PAYAPP_");
}

/**
 * 지점의 PayApp 연동 설정. 우선순위: 지점 설정(DeviceSetting) ← 전역 설정(Setting) ← 환경변수.
 * 관리자 결제 설정 화면에서 지점별로 저장한 값이 적용되고, 비워 둔 항목은 기존 환경변수 값을 쓴다.
 * 피드백 위변조 검증용 연동 KEY/VALUE(PAYAPP_LINKKEY/LINKVAL)는 비밀값이라 계속 환경변수에서만 읽는다.
 */
export async function getPayappConfig(deviceId: string): Promise<PayappConfig> {
  const names = [...PAYAPP_SETTING_KEYS];
  const [globals, deviceRows] = await Promise.all([
    prisma.setting.findMany({ where: { name: { in: names } } }),
    prisma.deviceSetting.findMany({ where: { deviceId, name: { in: names } } }),
  ]);
  const merged: Partial<Record<PayappSettingKey, string>> = {};
  for (const row of [...globals, ...deviceRows]) {
    const v = row.value.trim();
    if (v) merged[row.name as PayappSettingKey] = v;
  }
  const pick = (key: PayappSettingKey) => merged[key] ?? process.env[key]?.trim() ?? "";

  return {
    userid: pick("PAYAPP_USERID"),
    goodname: pick("PAYAPP_GOODNAME") || "AR-pic 촬영",
    recvphone: pick("PAYAPP_RECVPHONE"),
    feedbackurl: pick("PAYAPP_FEEDBACK_URL"),
    returnurl: pick("PAYAPP_RETURN_URL"),
    openpaytype: pick("PAYAPP_OPENPAYTYPE"),
  };
}
