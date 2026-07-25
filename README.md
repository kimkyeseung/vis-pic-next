# AR-pic

AR 포토부스 키오스크. 카메라 촬영 → AI 배경제거(MediaPipe) → 프레임 합성/인쇄 → QR 다운로드까지의
셀프 촬영 흐름을 제공한다. Next.js(App Router) + Tauri(Windows 데스크톱) + Supabase(DB/Storage) 구성.

## 문서

- **[SPEC.md](SPEC.md)** — 아키텍처·사용자 흐름·API·데이터 모델 등 전체 명세
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — 배포·환경 변수·설정 키
- [docs/QR_CODE_FEATURE.md](docs/QR_CODE_FEATURE.md) · [docs/GIF_GENERATION.md](docs/GIF_GENERATION.md) — 기능별 상세
- `docs/20260722/` — 레이아웃 V3 시안(디자인 참고)

## 개발

```bash
npm run dev            # 개발 서버 (localhost:3000)
npm run build          # 프로덕션 빌드 (prisma generate 포함)

npm run db:push        # Prisma 스키마 → DB 반영
npm run db:seed        # 초기 시드 (운영 DB는 SEED_FORCE 가드)
npm run db:add-theme   # 테마용 이미지 타입·설정만 안전하게 추가(멱등)

npm run tauri:dev      # 데스크톱 앱(개발)
npm run tauri:build    # 데스크톱 앱 빌드

npm test               # 단위 테스트 (vitest)
npm run test:e2e       # E2E (playwright)
```

## 주의

이 저장소의 Next.js는 관례가 다를 수 있으니, 코드 작성 전 `node_modules/next/dist/docs`의 가이드를
확인한다(`AGENTS.md`). 커밋은 명시 요청 시에만 한다(`CLAUDE.md`).
