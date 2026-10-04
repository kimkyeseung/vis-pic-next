# 통합 테스트 (Integration Tests)

이 디렉터리의 테스트는 실제 API 라우트를 **`http://localhost:3000`** 으로 호출한다.
순수 유닛 테스트(`__tests__/unit/`, `npm test`)와 달리 **개발 서버가 떠 있어야** 통과한다.

## 실행

```bash
npm run dev              # 1) 별도 터미널에서 개발 서버 기동
npm run test:integration # 2) 통합 테스트 실행 (vitest.integration.config.ts)
```

서버 주소는 `INTEGRATION_BASE_URL`로 바꿀 수 있다(기본 `http://localhost:3000`). 3000 포트를 다른
프로젝트가 쓰고 있으면 요청이 그쪽으로 가서 **모든 테스트가 404로 실패**하니, 다른 포트로 띄우고 지정한다:

```bash
npx next dev -p 3100
INTEGRATION_BASE_URL=http://localhost:3100 npm run test:integration
```

서버가 없으면 `ECONNREFUSED 127.0.0.1:3000`으로 실패한다. 그래서 이 파일들은
기본 `npm test`(유닛)에서 제외되어 있다 — `vitest.config.ts`의 `include`는
`__tests__/unit/**`만 포함한다.

## 목록

| 파일 | 대상 |
|------|------|
| `settings-api.test.ts` | `/api/setting`, `/api/device/[id]/settings` 관리자 인증 |
| `settings-persistence.test.ts` | 설정 저장/삭제(null) 영속성 |
| `payapp-feedback.test.ts` | `/api/payments/feedback` 위조 방지 검증 |
| `gif-create.test.ts` | `/api/gif/create` GIF 생성 |
