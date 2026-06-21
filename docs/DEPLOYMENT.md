# AR-pic 배포 및 운영 가이드

## 환경 요구사항

- Node.js 20+
- Rust + Cargo (Tauri 빌드 시)
- Visual Studio C++ Build Tools (Windows, Tauri 빌드 시)

---

## 1. 환경 변수 설정

`.env.example`을 참고하여 `.env` 파일을 생성합니다.

### 필수

```env
# Prisma (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.[REF]:[PW]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://postgres.[REF]:[PW]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
```

### Supabase 클라이언트

```env
NEXT_PUBLIC_SUPABASE_URL=https://[REF].supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable__xxxxx
```

### PayApp 결제 (선택)

```env
PAYAPP_USERID=viswave
PAYAPP_SHOPNAME=AR-pic
PAYAPP_GOODNAME=AR-pic 촬영
PAYAPP_RECVPHONE=01000000000
PAYAPP_FEEDBACK_URL=https://your-domain.com/api/payments/feedback
PAYAPP_RETURN_URL=https://your-domain.com/payment/return
```

---

## 2. 로컬 개발

```bash
npm install
npx prisma generate
npm run dev
# → http://localhost:3000
```

### 데이터베이스 시드 (운영 DB)

운영 DB에 시드를 실행하려면 `SEED_FORCE=1`이 필요합니다:

```bash
SEED_FORCE=1 npm run db:seed
```

### 관리자 비밀번호 마이그레이션

기존 평문 비밀번호를 bcrypt로 해싱:

```bash
npx tsx prisma/hash-passwords.ts
```

---

## 3. Supabase Storage 설정

이미지를 Supabase Storage로 관리하려면:

1. [Supabase Dashboard](https://supabase.com/dashboard) → Storage 이동
2. **New bucket** → 이름: `images`, Public: ON
3. Bucket policies 설정:
   - SELECT (읽기): `true` (공개)
   - INSERT (업로드): `authenticated` 또는 `true`
4. 기존 로컬 이미지를 버킷에 업로드

설정하지 않으면 로컬 파일시스템(`public/static/images/`)으로 자동 폴백됩니다.

---

## 4. Tauri 데스크탑 빌드

```bash
# Next.js 프로덕션 빌드
npm run build

# Tauri 빌드 (MSI + NSIS 설치 파일 생성)
npm run tauri:build
```

출력 위치:
- `src-tauri/target/release/bundle/msi/AR-pic_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/AR-pic_0.1.0_x64-setup.exe`

### Tauri 개발 모드

```bash
npm run tauri:dev
```

---

## 5. 키오스크 배포

### 설치

1. 키오스크 PC에 `AR-pic_0.1.0_x64-setup.exe` 실행
2. 설치 후 AR-pic 실행
3. 관리자 페이지(`/admin`)에서 장치 등록 및 설정

### 프린터 설정

1. 관리자 → 프린터/카메라 설정
2. 연결된 프린터 선택 (Tauri 데스크탑에서만 가능)
3. 테스트 인쇄로 확인

### 카메라 설정

- 외장 카메라 USB 연결
- 브라우저/Tauri 앱에서 카메라 권한 허용
- 다른 프로그램이 카메라를 사용하지 않도록 확인

---

## 6. 서비스 URL 구조

| URL | 설명 |
|-----|------|
| `/` | 메인 (서비스/관리자 선택) |
| `/service?device=DEVICE_ID` | 서비스 화면 (키오스크) |
| `/admin` | 관리자 대시보드 |
| `/admin/login` | 관리자 로그인 |
| `/admin/devices` | 장치 관리 |
| `/admin/images` | 이미지 관리 |
| `/admin/settings` | 전역 설정 |
| `/admin/printer` | 프린터/카메라 (Tauri) |

---

## 7. 서비스 촬영 플로우

```
시작 → [결제] → 프레임 선택 → 배경 선택 → 촬영 → 사진 선택 → 합성/인쇄 → 완료
```

- **결제**: `PAYMENT_ENABLED=1`이면 PayApp 결제 진행 (개발 모드에서는 건너뛰기 가능)
- **프레임**: `CAPTURE_MODES` 설정에 따라 1x1, 2x1, 2x2 등 선택
- **촬영**: 슬롯당 `CAPTURE_COUNT_UNIFORM`장 촬영, 필요한 수만 선택
- **인쇄**: Tauri → 선택된 프린터로 인쇄 / 브라우저 → 새 창 인쇄 또는 다운로드

---

## 8. 관리자 계정

| 계정 | 기본 비밀번호 |
|------|-------------|
| admin | admin |
| viswave | viswave1214 |

운영 환경에서는 반드시 비밀번호를 변경하세요.

---

## 9. 유틸리티 스크립트

| 스크립트 | 설명 |
|---------|------|
| `npx tsx prisma/seed.ts` | DB 시드 (SEED_FORCE=1 필요) |
| `npx tsx prisma/hash-passwords.ts` | 평문 비밀번호 → bcrypt 해싱 |
| `npx tsx prisma/check-images.ts` | 이미지 레코드 vs 파일 존재 확인 |
| `npx tsx prisma/cleanup-missing-images.ts` | 파일 없는 이미지 레코드 삭제 |
