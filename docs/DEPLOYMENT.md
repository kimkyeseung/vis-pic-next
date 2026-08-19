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
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
```

### 보안 / 세션 (필수)

```env
# 관리자 세션 봉인 키(iron-session). 32자 이상 임의 문자열. 미설정 시 관리자 로그인/인증 실패(fail-loud).
# 생성 예: node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"
SESSION_PASSWORD=[32자 이상 임의 문자열]
# HTTPS로 서빙할 때만 true → 세션 쿠키에 Secure 부여. Tauri 로컬 HTTP(localhost:3001)에선 설정하지 않는다.
COOKIE_SECURE=false
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

이미지는 항상 Supabase Storage에서 서빙되므로 `NEXT_PUBLIC_SUPABASE_URL` 설정이 필수입니다.
(설정하지 않으면 `getImageBaseUrl()`이 `/static/images`를 반환하지만, 해당 디렉터리는 더 이상
번들·리포지토리에 포함되지 않으므로 이미지가 표시되지 않는다. 유일한 로컬 정적 자산은
시작 화면 로고 `public/static/viswave_logo.png` 뿐이다.)

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
| `/admin/accounts` | 계정 관리 (계정 추가·삭제·비밀번호 변경) |
| `/admin/devices` | 장치 목록 |
| `/admin/devices/new` | 장치 추가 |
| `/admin/devices/[id]` | 장치 편집 |
| `/admin/images` | 이미지 관리 |
| `/admin/images/upload` | 이미지 업로드 |
| `/admin/theme-setting` | 테마 관리 (서비스 화면 배경화면·글자색) |
| `/admin/print-setting` | 인화 설정 (용지 크기·촬영 모드·배경·focal point 조절) |
| `/admin/capture-setting` | 촬영 설정 (카운트다운·크로마키 등) |
| `/admin/timer-setting` | 타이머 설정 (유휴·촬영·인화 타이머) |
| `/admin/payment` | 결제 설정 |
| `/admin/payment-history` | 결제 내역 |

---

## 7. 서비스 촬영 플로우

```
시작 → [결제] → 컷 선택 → 배경 선택 → 촬영 → 사진 선택 → [프레임(인화 배경) 선택] → 합성/인쇄 → 완료
```

- **결제**: `PAYMENT_ENABLED=1`이면 PayApp 결제 진행 (개발 모드에서는 건너뛰기 가능)
- **프레임**: `CAPTURE_MODES` 설정에 따라 1x1, 2x1, 2x2 등 선택
- **촬영**: 슬롯당 `CAPTURE_COUNT_UNIFORM`장 촬영, 필요한 수만 선택. `CAMERA_AUTO_TIMER`(초) 경과 시 자동 촬영
- **인화 배경 선택**: 인화 배경 이미지가 등록된 경우에만 노출
- **인쇄**: Tauri → 선택된 프린터로 인쇄 / 브라우저 → 새 창 인쇄 또는 다운로드
- **완료 화면**: `PRINT_AUTO_TIMER`(초) 경과 시 자동으로 시작 화면으로 복귀 (기본 30초, 0이면 비활성)

### 주요 설정 키 (DB `pic_Setting` 테이블)

| 키 | 기본값 | 설명 |
|----|--------|------|
| `IDLE_TIMEOUT_SECONDS` | 30 | 유휴 타임아웃 (프레임·배경·선택·인화배경 단계) |
| `CAMERA_AUTO_TIMER` | 60 | 촬영 단계 자동 촬영 타이머 (0이면 비활성) |
| `CAMERA_RESOLUTION` | `fhd` | 카메라 촬영 해상도 티어 — `low`(320×240)/`sd`(640×480)/`hd`(960×720)/`fhd`(1440×1080)/`uhd`(4K 2880×2160). 모두 4:3. 관리자 촬영 설정 페이지에서 선택 |
| `PRINT_AUTO_TIMER` | 30 | 완료 화면 자동 복귀 타이머 (0이면 비활성) |
| `CAPTURE_SECONDS` | 3 | 촬영 카운트다운 (초) |
| `CAPTURE_MODES` | `1x1,2x2` | 사용 가능한 촬영 모드. 콤마로 구분된 `NxM` 문자열 목록. **주의**: 관리자 인화 설정 페이지의 미리보기는 목록에 없는 임의의 `NxM` 값도 정규식으로 인식해 보여주지만, 실제 서비스 화면(`src/constants/frames.ts`의 `FRAME_INFO`)은 정적으로 등록된 모드만 표시한다. 새 모드를 추가하려면 `FRAME_INFO`에도 코드로 추가해야 하며, 그렇지 않으면 관리자 화면엔 보여도 고객 화면에선 조용히 빠진다 (실제로 `1x2`가 이 문제로 한 번 발생함 — 세로 셀이 되어 의도적으로 제외된 이력도 있으니 추가 전 §12 참고) |
| `CAPTURE_COUNT_UNIFORM` | 4 | 슬롯당 촬영 횟수 |
| `CHROMAKEY_MODE` | `mediapipe` | 배경 제거 모드 (mediapipe/chromakey/off) |
| `PAYMENT_ENABLED` | `0` | 결제 활성화 여부 |
| `PAYMENT_AMOUNT` | `5000` | 1장당 가격 (원). 결제 화면은 1/2/4장 고정, 총액 = 가격 × 매수 |

> **전체 설정 키는 [SPEC §20](../SPEC.md#20-설정-시스템)이 단일 출처.** 배경제거 세부 튜닝(AI 경계 침식·부드러움,
> 크로마키 색상·감도·부드러움·스필·침식·밝기무시 — §12), 인화지 크기, 테마 색상/버튼 글로우(§25) 등은
> 대부분 관리자 UI에서 조정하므로 여기서는 운영 필수 키만 싣는다.

> 설정은 관리자에서 **상단에서 선택한 지점 기준**으로 편집된다(결제·촬영·타이머·인화·테마).
> 전역값은 새 지점의 기본값/폴백으로만 쓰이며, 지점 편집 시 변경분만 해당 지점에 저장된다.
> 테마 배경화면·로고 이미지는 지점에 연결(linked)되어 지점별로 노출된다.

관리자 촬영 설정 페이지(`/admin/capture-setting`)에서 "카메라로 미리보기" 버튼으로 실제 카메라를 켜서
현재 설정(AI 배경제거 경계값 또는 크로마키 색상·감도)의 적용 결과를 실시간으로 확인하며 값을 바로 조정할 수 있다.
크로마키 미리보기에서는 **스포이드** 버튼으로 화면을 클릭해 그 지점의 원본 색을 키 색상으로 추출할 수 있다.

---

## 8. 관리자 계정

| 계정 | 기본 비밀번호 |
|------|-------------|
| admin | admin |
| viswave | viswave1214 |

운영 환경에서는 반드시 비밀번호를 변경하세요.
계정 추가·삭제·비밀번호 변경은 `/admin/accounts` 페이지에서 관리합니다.

- **세션**: 관리자 세션은 iron-session으로 봉인(암호화·서명)된 쿠키다. `SESSION_PASSWORD`(§1)가 있어야 로그인/인증이 동작한다. 스키마·`SESSION_PASSWORD` 변경 후에는 기존 로그인 세션이 무효화되어 재로그인이 필요하다.
- **장치 실행 잠금**: 장치마다 실행 비밀번호(bcrypt)를 설정하면(장치 편집), 서비스 실행 시 홈에서 그 장치를 선택할 때 비밀번호를 입력해야 한다. 미설정이면 잠금 없이 실행.

---

## 9. 유틸리티 스크립트

| 스크립트 | 설명 |
|---------|------|
| `npx tsx prisma/seed.ts` | DB 시드 (SEED_FORCE=1 필요) |
| `npx tsx prisma/hash-passwords.ts` | 평문 비밀번호 → bcrypt 해싱 |
| `npx tsx prisma/check-images.ts` | 이미지 레코드 vs 파일 존재 확인 |
| `npx tsx prisma/cleanup-missing-images.ts` | 파일 없는 이미지 레코드 삭제 |
