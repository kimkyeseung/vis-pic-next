import { config } from "dotenv";

// 통합 테스트는 실행 중인 개발 서버(next dev)와 같은 env 값을 써야 한다 — 특히 SESSION_PASSWORD
// (테스트가 봉인한 관리자 세션 쿠키를 서버가 풀어야 함). `dotenv/config`는 .env만 읽어 .env.local 값과
// 어긋날 수 있으므로, next dev와 같은 우선순위로 먼저 로드한다(앞 파일이 우선, 이미 있는 값은 덮어쓰지 않음).
// @next/env의 loadEnvConfig는 NODE_ENV=test(vitest)에서 .env.local을 일부러 건너뛰어 쓰지 않는다.
// (각 테스트의 `import "dotenv/config"`는 이미 설정된 값을 덮어쓰지 않으므로 그대로 둬도 된다.)
config({ path: [".env.development.local", ".env.local", ".env.development", ".env"], quiet: true });
