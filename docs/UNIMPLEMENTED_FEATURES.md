# 미구현/불완전 기능 목록

> 분석 기준일: 2026-06-26  
> 대상 프로젝트: `vis-pic-next` (Next.js 기반 AR-pic 포토부스 시스템)

---

## 요약

| 우선순위 | 항목 | 영역 |
|---------|------|------|
| 높음 | 관리자 API 인증 없음 | 보안 |
| 높음 | 수동(manual) 결제 방식 미구현 | 결제 |
| 높음 | 결제 내역 조회 화면 없음 | 관리자 |
| 중간 | 전역 설정·인화 설정이 장치별로 읽히지 않음 | 설정 |
| 중간 | 이미지 타입 CRUD 중 GET만 구현 | 이미지 |
| 중간 | 결제 건너뛰기 버튼 항상 노출 | 결제 |
| 낮음 | 이미지 우선순위·정보 수정 UI 없음 | 이미지 |
| 낮음 | 설정값 유효성 검증 없음 | 설정 |
| 낮음 | 관리자 localStorage 세션에 만료 없음 | 보안 |
| 낮음 | `ADMIN_PASSWORD` 설정 필드 미사용 | 설정 |
| 낮음 | 프린트 클린업 에러 누락 | 기타 |
| 낮음 | 관리자 통계/대시보드 없음 | 기타 |

---

## 1. 결제 (Payment)

### 1-1. 수동(manual) 결제 방식 미구현 [높음]

- **위치:** `src/app/admin/payment/page.tsx:8`, `src/components/service/PaymentSection.tsx`
- **상황:** 관리자 설정 UI의 `결제 방식` 셀렉트에 `수동(manual)` 옵션이 있지만, 서비스 화면의 `PaymentSection`은 PayApp Lite 흐름만 구현되어 있음. `PAYMENT_TERMINAL_MODE=manual`을 선택해도 서비스 화면에서 결제 흐름이 달라지지 않음. `DeviceConfig` 타입에도 `paymentTerminalMode` 필드가 없고 `loadDeviceConfig`에서 해당 설정값을 읽지 않음.
- **필요 작업:** `DeviceConfig`에 `paymentTerminalMode` 추가, `loadDeviceConfig`에서 `PAYMENT_TERMINAL_MODE` 매핑, `PaymentSection`에서 `manual` 분기 UI(현장 결제 확인 버튼) 구현.

### 1-2. 결제 내역 조회 화면 없음 [높음]

- **위치:** `src/app/admin/payment/page.tsx` — 설정 화면만 있음
- **상황:** DB에 `PayappPayment` 테이블이 존재하고 결제/환불 데이터가 쌓이고 있으나, 관리자 화면에서 결제 이력을 조회하거나 환불을 처리하는 UI가 전혀 없음.
- **필요 작업:** 관리자 결제 내역 조회 페이지 및 API 엔드포인트(`GET /api/admin/payments`) 구현.

### 1-3. 결제 건너뛰기 버튼 항상 노출 [중간]

- **위치:** `src/components/service/PaymentSection.tsx:121`, `141`
- **상황:** 두 곳 모두 환경변수 조건 없이 렌더링됨.
  - `waiting` 상태(121줄): "결제 건너뛰기 (개발 모드)" 버튼 — 레이블에 개발 모드임을 명시하지만 운영 환경에서도 노출.
  - `error` 상태(141줄): "건너뛰기" 버튼 — 레이블에 개발 모드 표기도 없이 노출.
- **필요 작업:** `process.env.NODE_ENV === 'development'` 또는 `NEXT_PUBLIC_DEV_MODE` 환경변수로 두 버튼 모두 조건부 렌더링 처리.

---

## 2. 관리자 보안 (Admin Security)

### 2-1. 관리자 API 인증 없음 [높음]

- **위치:** `src/app/api/admin/` 하위 모든 라우트
- **상황:** 관리자 화면은 `localStorage`의 세션 유무로 클라이언트 측 라우팅만 보호함(`src/app/admin/layout.tsx:19-32`). 실제 API 라우트(`/api/admin/devices`, `/api/admin/images/*` 등)에는 인증 미들웨어가 없어 누구나 직접 호출 가능.
- **필요 작업:** Next.js 미들웨어 또는 각 API 라우트에서 세션 쿠키/JWT 검증 로직 추가. `src/app/api/admin/login/route.ts`에서 발급하는 httpOnly 쿠키(`admin_session`)를 서버 사이드에서 검증해야 함.

### 2-2. 관리자 localStorage 세션에 만료 없음 [낮음]

- **위치:** `src/app/admin/layout.tsx:19-32`
- **상황:** 로그인 라우트(`src/app/api/admin/login/route.ts:51-57`)는 24시간 `maxAge`의 httpOnly 쿠키를 발급하지만, 레이아웃은 이 쿠키를 전혀 확인하지 않고 만료 시각이 없는 `localStorage`만 읽음. 브라우저를 닫아도 localStorage 세션이 영구 유지되고, 서버에서 세션을 무효화할 수 없음.
- **필요 작업:** 레이아웃 인증을 localStorage 대신 발급된 httpOnly 쿠키 기반으로 전환. 또는 localStorage에 만료 시각 포함 및 체크 로직 추가.

---

## 3. 이미지 관리 (Image Management)

### 3-1. 이미지 타입 CRUD 중 GET만 구현 [중간]

- **위치:** `src/app/api/admin/image-types/route.ts`
- **상황:** `GET /api/admin/image-types`만 구현되어 있음. 이미지 타입 추가/수정/삭제 API가 없음. 관리자 UI에도 이미지 타입 관리 메뉴가 없음.
- **필요 작업:** `POST`, `PUT`, `DELETE` 메서드 및 대응 관리자 UI 추가. 혹은 시드 데이터로만 관리하는 정책이라면 명시적으로 문서화.

### 3-2. 이미지 우선순위 수정 UI 없음 [낮음]

- **위치:** `src/app/admin/images/page.tsx:157`
- **상황:** 이미지 목록에서 `우선순위: {image.priority}` 값을 표시만 하며 수정할 수 없음. 우선순위는 배경/프레임 선택 화면의 표시 순서에 영향을 주는 중요한 값임.
- **필요 작업:** 우선순위 인라인 수정 또는 드래그 앤 드롭 정렬 UI 추가.

### 3-3. 이미지 정보(이름, 타입) 수정 기능 없음 [낮음]

- **위치:** `src/app/admin/images/page.tsx`, `src/app/api/admin/images/[id]/route.ts`
- **상황:** 삭제만 가능. 업로드 후 이름이나 이미지 타입을 변경하려면 삭제 후 재업로드해야 함.
- **필요 작업:** `PATCH /api/admin/images/{id}` API 및 수정 UI 추가.

---

## 4. 설정 관리 (Settings)

### 4-1. 전역 설정·인화 설정이 장치별로 읽히지 않음 [중간]

- **위치:** `src/app/admin/settings/page.tsx`, `src/app/admin/print-setting/page.tsx`
- **상황:** `DeviceSetting` 테이블과 `/api/device/[deviceId]/settings` API는 존재하고, 장치 편집 페이지(`admin/devices/[id]/page.tsx`)에서도 장치별 설정 일부를 저장함. 그러나 전역 설정 페이지와 인화 설정 페이지는 `selectedDevice`를 무시하고 `/api/setting`(전역 테이블)만 읽고 씀. 장치를 바꿔도 동일한 전역값이 표시됨.
- **필요 작업:** `settings/page.tsx`와 `print-setting/page.tsx`에서 `selectedDevice`가 있을 때 `/api/device/[deviceId]/settings`를 우선 읽고, 저장 시에도 해당 엔드포인트에 저장하도록 변경.

### 4-2. 설정값 유효성 검증 없음 [낮음]

- **위치:** `src/app/api/setting/route.ts:23-45`
- **상황:** `POST /api/setting`은 임의의 key-value 쌍을 검증 없이 저장함. 잘못된 값(음수 카운트다운, 잘못된 JSON, 존재하지 않는 모드명 등)이 저장될 수 있음.
- **필요 작업:** 핵심 설정 키에 대한 서버 사이드 타입/범위 검증 추가.

---

## 5. 서비스 화면 (Service UX)

### 5-1. 에러 상황에서 사용자 피드백 없음 [중간]

- **위치:**
  - `src/app/page.tsx:23` — 장치 목록 로드 실패 시 `.catch(() => {})`로 무시
  - `src/components/service/CameraSection.tsx:72-76` — 배경 이미지 로드 실패 시 `onerror` 핸들러 없음, 캔버스 그라디언트로 조용히 대체
  - `src/components/service/CompleteSection.tsx:149-150, 185-186` — GIF 생성 실패 시 단순 이미지로 폴백 (사용자 알림 없음)
- **상황:** 여러 비동기 작업에서 실패해도 UI가 변하지 않거나 콘솔에만 에러가 출력됨.
- **필요 작업:** 주요 실패 지점에 토스트 알림 또는 에러 메시지 UI 추가.

### 5-2. `payUrl` 활용 미구현 [중간]

- **위치:** `src/app/api/payments/request/route.ts:74-78`, `src/components/service/PaymentSection.tsx:39-42`
- **상황:** PayApp API 요청 성공 시 `payUrl`과 `mulNo`를 응답으로 받지만, `PaymentSection`은 `orderId`만 사용하고 `payUrl`은 무시한 채 폴링만 함. PayApp Lite는 별도 앱을 열거나 QR코드를 표시해야 할 수 있음.
- **필요 작업:** `payUrl` 반환 시 QR코드 표시 또는 딥링크 처리 여부 확인 후 구현.

---

## 6. 기타

### 6-1. 프린트 클린업 에러 누락 [낮음]

- **위치:** `src/app/api/print/cleanup/route.ts`
- **상황:** 파일 삭제 실패와 Supabase 클린업 실패가 빈 catch 블록으로 무시됨. 저장소 공간 정리가 실패해도 성공으로 응답.
- **필요 작업:** 최소한 서버 로그에 실패 이유 기록.

### 6-2. `ADMIN_PASSWORD` 설정 필드 미사용 [낮음]

- **위치:** `src/app/admin/settings/page.tsx:34`
- **상황:** 설정 화면에 `ADMIN_ID`, `ADMIN_PASSWORD` 입력 필드가 있고 저장도 되지만, 프로젝트 전체에서 이 설정값을 읽거나 검증하는 코드가 없음. 관리자 로그인은 `AdminAccount` 테이블만 사용하므로 이 필드는 DB에 쌓이기만 하고 아무 기능도 하지 않는 유령 UI.
- **필요 작업:** 두 가지 중 하나를 선택. (1) 필드를 삭제하고 관리자 계정은 DB seed/별도 관리 화면으로만 관리. (2) 이 값으로 장치별 관리자 비밀번호를 설정하는 기능이 필요하다면, 해당 설정값을 읽어 검증하는 로직을 구현 (단, 평문 저장이므로 bcrypt 처리 필요).

### 6-3. 관리자 통계/대시보드 없음 [낮음]

- **위치:** `src/app/admin/page.tsx`
- **상황:** 관리자 홈에 장치 카드와 빠른 작업 링크만 있음. 촬영 건수, 결제 합계 등 운영 지표 화면 없음.

---

## 구현 완료 확인 항목

아래는 미구현으로 보일 수 있으나 실제 구현된 항목입니다.

| 항목 | 확인 위치 |
|------|-----------|
| PayApp 결제 요청 | `src/app/api/payments/request/route.ts` |
| PayApp feedback webhook 수신 | `src/app/api/payments/feedback/route.ts` |
| 결제 상태 폴링 | `src/components/service/PaymentSection.tsx:53-76` |
| GIF 생성 (폴백 포함) | `src/app/api/gif/create/route.ts` |
| 이미지 업로드 및 삭제 | `src/app/api/admin/images/` |
| 장치 추가/수정/삭제 및 클론 | `src/app/api/admin/devices/` |
| 장치 활성/비활성 토글 | `src/app/admin/devices/page.tsx`, `src/app/api/admin/devices/[id]/route.ts:42-49` |
| 관리자 로그인 bcrypt 검증 | `src/app/api/admin/login/route.ts` (AdminAccount 테이블 사용) |
| 크로마키 / AI 배경 제거 | `src/components/service/CameraSection.tsx` |
| 인화 레이아웃 프리뷰 | `src/app/admin/print-setting/page.tsx` |
