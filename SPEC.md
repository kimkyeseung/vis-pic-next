# AR-pic 프로젝트 명세서 (Project Specification)

> **버전:** 0.1.0 | **앱 식별자:** net.viswave.arpic | **최종 수정:** 2026-07-06

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [아키텍처 개요](#3-아키텍처-개요)
4. [앱 라우트 및 페이지](#4-앱-라우트-및-페이지)
5. [7단계 사용자 흐름 (Photo Flow)](#5-7단계-사용자-흐름-photo-flow)
6. [주요 컴포넌트](#6-주요-컴포넌트)
7. [커스텀 훅](#7-커스텀-훅)
8. [API 엔드포인트](#8-api-엔드포인트)
9. [데이터 모델 (Prisma Schema)](#9-데이터-모델-prisma-schema)
10. [Tauri 명령어 (Rust)](#10-tauri-명령어-rust)
11. [카메라 시스템](#11-카메라-시스템)
12. [배경 제거 모드](#12-배경-제거-모드)
13. [프레임 / 레이아웃 시스템](#13-프레임--레이아웃-시스템)
14. [스티커 시스템](#14-스티커-시스템)
15. [서브 모니터 스트리밍](#15-서브-모니터-스트리밍)
16. [인쇄 시스템](#16-인쇄-시스템)
17. [결제 시스템 (PayApp)](#17-결제-시스템-payapp)
18. [MediaPipe 다운로드 및 캐시](#18-mediapipe-다운로드-및-캐시)
19. [오프라인 지원 (Service Worker / PWA)](#19-오프라인-지원-service-worker--pwa)
20. [설정 시스템](#20-설정-시스템)
21. [환경 변수](#21-환경-변수)
22. [빌드 시스템](#22-빌드-시스템)
23. [관리자 패널](#23-관리자-패널)
24. [다국어 (i18n)](#24-다국어-i18n)

---

## 1. 프로젝트 개요

**AR-pic (비즈웨이브 AR-pic)** 는 Windows 전용 AI 포토부스 데스크탑 애플리케이션이다.

### 목적

실내 설치형 무인 포토부스 키오스크에서 동작하며, 다음 기능을 통합 제공한다:

- 실시간 AI 배경 제거 (MediaPipe selfie segmentation)
- 6종 프레임 레이아웃 선택
- 이모지 스티커 오버레이
- 카드 결제 (PayApp Lite)
- 인화지 출력 (Windows 프린터)
- QR코드 기반 디지털 사진 공유 (3일 만료 URL)
- 보조 모니터 실시간 카메라 미리보기
- 다국어 지원 (한국어/영어/일본어/중국어 — §24)

### 사용자 유형

| 유형 | 진입점 | 역할 |
|------|--------|------|
| **고객** | `/service?device={id}` | 포토 촬영 (7단계 흐름) |
| **운영자** | `/` → StartSection 패널 | 서브 모니터 설정, 디바이스 선택 |
| **관리자** | `/admin/login` | 디바이스/이미지/결제/설정 관리 |

---

## 2. 기술 스택

### Frontend

| 패키지 | 버전 | 용도 |
|--------|------|------|
| Next.js | 16.2.9 | App Router 기반 풀스택 프레임워크 |
| React | 19.2.4 | UI 라이브러리 |
| @tauri-apps/api | 2.11.1 | Tauri IPC 브릿지 |
| @mediapipe/tasks-vision | 0.10.35 | ML 배경 제거 |
| @supabase/supabase-js | 2.108.2 | 클라우드 DB / 스토리지 |
| @prisma/client | 5.22.0 | ORM |
| gif-encoder-2 | 1.0.5 | GIF 생성 |
| qrcode.react | 4.2.0 | QR코드 렌더링 |
| bcryptjs | 3.0.3 | 비밀번호 해싱 |
| pretendard | 1.3.9 | 한국어 폰트 |
| Tailwind CSS | 4 | 스타일링 |
| TypeScript | 5 | 타입 안전성 |

### Backend (Rust / Tauri)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| tauri | 2.11.3 | 데스크탑 프레임워크 |
| tauri-plugin-global-shortcut | 2 | F11 전역 단축키 |
| tauri-plugin-shell | 2 | 시스템 쉘 |
| tauri-plugin-log | 2 | 로깅 |
| webview2-com | 0.38.2 | WebView2 Win32 API |
| zip | 2 | server.zip 압축 해제 |
| dirs | 5 | 시스템 경로 |

### 인프라

| 서비스 | 용도 |
|--------|------|
| Supabase (PostgreSQL) | 데이터베이스 + 스토리지 |
| Supabase Storage `pic-prints` | 인화 이미지 업로드 |
| PayApp | 결제 게이트웨이 |
| jsDelivr CDN | MediaPipe WASM 다운로드 |
| Google Cloud Storage | MediaPipe `.tflite` 모델 다운로드 |

---

## 3. 아키텍처 개요

```
┌────────────────────────────────────────────────────────┐
│  Tauri 데스크탑 프로세스 (Rust)                          │
│  ┌──────────────────┐   ┌───────────────────────────┐  │
│  │  WebViewWindow   │   │  Child Process (Node.js)  │  │
│  │  (WebView2)      │   │  Next.js @ port 3001      │  │
│  │                  │←→ │                           │  │
│  │  Frontend (React)│   │  API Routes               │  │
│  │  /service        │   │  Prisma → PostgreSQL      │  │
│  │  /admin          │   │  Sharp, GifEncoder        │  │
│  │  /output         │   │  SSE (camera-frame)       │  │
│  └──────────────────┘   └───────────────────────────┘  │
│                                                         │
│  Tauri Commands (IPC):                                  │
│  get_monitors, open_camera_window, print_image,         │
│  get_printers, get_cameras, mediapipe_is_installed,     │
│  download_mediapipe, save_settings, load_settings       │
└────────────────────────────────────────────────────────┘
            ↕ (네트워크)
┌──────────────────────────────────────────────────────────┐
│  외부 서비스                                               │
│  Supabase (DB + Storage) | PayApp | CDN (MediaPipe)      │
└──────────────────────────────────────────────────────────┘
```

### 로컬 파일 시스템 경로

| 경로 | 용도 |
|------|------|
| `%LOCALAPPDATA%\ar-pic\` | 앱 데이터 루트 |
| `%LOCALAPPDATA%\ar-pic\server\` | server.zip 압축 해제 대상 |
| `%LOCALAPPDATA%\ar-pic\mediapipe\` | MediaPipe WASM 캐시 |
| `%LOCALAPPDATA%\ar-pic\server-stdout.log` | Node.js stdout 로그 |
| `%LOCALAPPDATA%\ar-pic\server-stderr.log` | Node.js stderr 로그 |
| `%LOCALAPPDATA%\ar-pic\.version` | 현재 추출된 서버 버전 |
| `%LOCALAPPDATA%\net.viswave.arpic\EBWebView\` | WebView2 프로파일 |

---

## 4. 앱 라우트 및 페이지

### 공개 라우트

| 라우트 | 파일 | 설명 |
|--------|------|------|
| `/` | `src/app/page.tsx` | 디바이스 선택 + 관리자 진입 |
| `/service?device={id}` | `src/app/service/page.tsx` | 사용자 포토부스 메인 (7단계) |
| `/output` | `src/app/output/page.tsx` | 서브 모니터용 카메라 미리보기 |

### 관리자 라우트 (로그인 필요)

| 라우트 | 파일 | 설명 |
|--------|------|------|
| `/admin/login` | `src/app/admin/login/page.tsx` | 관리자 인증 |
| `/admin` | `src/app/admin/page.tsx` | 관리자 대시보드 |
| `/admin/devices` | `src/app/admin/devices/page.tsx` | 디바이스 목록 |
| `/admin/devices/new` | `src/app/admin/devices/new/page.tsx` | 디바이스 생성 |
| `/admin/devices/[id]` | `src/app/admin/devices/[id]/page.tsx` | 디바이스 편집 |
| `/admin/images` | `src/app/admin/images/page.tsx` | 배경/프레임 이미지 관리 |
| `/admin/images/upload` | `src/app/admin/images/upload/page.tsx` | 이미지 업로드 |
| `/admin/print-setting` | `src/app/admin/print-setting/page.tsx` | 인쇄 레이아웃 치수 설정 |
| `/admin/settings` | `src/app/admin/settings/page.tsx` | 전역 시스템 설정 |
| `/admin/payment` | `src/app/admin/payment/page.tsx` | PayApp 결제 단말 설정 |
| `/admin/payment-history` | `src/app/admin/payment-history/page.tsx` | 결제 내역 조회 |

---

## 5. 7단계 사용자 흐름 (Photo Flow)

상태는 `sessionStorage` 키 `photobooth_session_v2`에 저장되어 새로고침 후에도 복원된다.

```
[1. START] → [2. PAYMENT*] → [3. FRAME] → [4. BACKGROUND]
     → [5. CAMERA] → [6. SELECT] → [7. COMPLETE]
                                              ↓
                                        [1. START (리셋)]
* 결제 비활성 시 스킵
```

### Step 1: START

- 스플래시 화면 ("Touch to start" 애니메이션)
- **언어 선택 버튼**: 한국어/English/日本語/中文 (§24) — 대기 화면 복귀 시 한국어로 초기화
- 우측 상단 빌드 시각 표시 (`NEXT_PUBLIC_BUILD_DATE`, §22)
- 운영자 설정 패널: 서브 모니터 출력 ON/OFF, 모니터 선택
- Tauri 환경 감지 (`__TAURI_INTERNALS__` in window)
- `useTauriMonitor` 훅으로 연결된 모니터 목록 조회
- 이 단계부터 `CameraStreamer`가 카메라를 상시 점유(웜업)한다 (§15)

### Step 2: PAYMENT (조건부)

- `config.paymentEnabled === false`이면 자동 스킵
- **Manual 모드**: 사용자가 결제 완료 버튼 누르면 진행
- **PayApp Lite 모드**:
  1. `POST /api/payments/request` → orderId + payUrl 반환
  2. 사용자가 PayApp 단말 UI에서 카드 결제
  3. PayApp이 `POST /api/payments/feedback` 콜백 전송
  4. 앱이 `GET /api/payments/status/{orderId}` 2초 간격 폴링 (최대 300초)
  5. status="paid" 감지 → 다음 단계 진행

### Step 3: FRAME SELECT

- 6종 레이아웃 그리드 표시 (`CAPTURE_MODES` 설정에 따라 필터링)
- 카드 미리보기는 실물 인화지 비율(10×15cm, 모드별 방향)의 흰 종이 위에
  `computePrintLayout` 폴백 배치를 축소해 그린다 (`PaperPreview`, 여백 설정값 미반영)
- 선택 시 `slotsNeeded` (슬롯 수) 결정

### Step 4: BACKGROUND SELECT

- 업로드된 배경 이미지 (type=1) 표시
- MP4/WebM 영상 배경 자동 재생 미리보기
- 그라디언트 폴백 지원 (6종) — 목록 로드 실패 시 재시도 후에도 실패하면 표시 (§20)
- **랜덤 자동 선택**: 페이지 진입 시 `selectedBackground`가 `null`이면 배경 풀에서 랜덤으로 하나를 자동 선택
  - DB 이미지 로드 전: fallback 그라디언트 중 랜덤 선택
  - DB 이미지 로드 후: DB 이미지 중 랜덤으로 교체 (fallback 선택 중이었을 경우에만)
  - 세션 리셋 후 재시작 시에도 재선택
- 배경 선택 단계 진입 시 자동 선택된 항목이 활성(체크마크) 표시됨
- 선택된 배경이 카메라 합성 및 서브 모니터 미리보기에 사용됨

### Step 5: CAMERA CAPTURE (메인 루프)

- WebRTC `getUserMedia`로 카메라 스트림 획득
- 레이아웃: 좌측 프리뷰(화면 높이 기준 최대 크기) + 우측 고정폭(320px) 컨트롤 패널
- **프리뷰 하단 배경 썸네일 스트립**: 촬영 중 배경 즉시 변경 가능
  (`onBackgroundSelect` → flow의 `selectedBackground` 갱신 → 프리뷰·서브 모니터 실시간 반영,
  배경제거 `off` 모드에서는 숨김)
- 30fps 캔버스 렌더링 루프:
  1. 영상 프레임을 캔버스에 그리기
  2. 배경 제거 적용 (mediapipe / chromakey / off)
  3. 스티커 오버레이
  4. 서브 모니터 동기화 (활성 시 `/api/camera-frame` POST)
  5. 카운트다운 타이머 표시
- **촬영 시퀀스**:
  - 자동 타이머 경과 또는 사용자 클릭
  - 카운트다운 (`captureSeconds`초)
  - 캔버스 스냅샷 저장 (data URL)
  - 중간 프레임도 `intermediateFrames[photoIndex][]`에 저장
  - `slotsNeeded × captureCount`장 촬영 완료까지 반복

### Step 6: SELECT

- 촬영된 사진 그리드 표시 (촬영 원본 비율 그대로, 크롭 없음)
- 사용자가 정확히 `slotsNeeded`장 선택

### Step 7: COMPLETE

1. 선택 사진 합성 이미지 생성 (`src/lib/printLayout.ts` 공용 레이아웃 계산 사용)
2. `POST /api/print/upload-image` → 3일 만료 URL
3. `POST /api/gif/create-layout` → 애니메이션 GIF URL
4. QR 코드 표시 (사진 URL + GIF URL)
5. 인쇄 버튼 → `print_image` Tauri 명령어 호출 (전역 설정 `PRINTER_NAME` 사용, 비어 있으면 기본 프린터)
6. 재시작 버튼 → Step 1으로 리셋

※ 프린터 목록 조회(`get_printers`)는 관리자 인화 설정 페이지에서 사용된다.

---

## 6. 주요 컴포넌트

### 서비스 흐름 컴포넌트 (`src/components/service/`)

| 파일 | 역할 |
|------|------|
| `StartSection.tsx` | 환영 화면 + 언어 선택 버튼 + 서브 모니터 설정 패널 |
| `PaymentSection.tsx` | 결제 UI (manual / PayApp Lite 폴링) |
| `FrameSection.tsx` | 프레임 레이아웃 선택 그리드 |
| `BackgroundSection.tsx` | 배경 이미지/영상 선택기 |
| `CameraSection.tsx` | 카메라 + AI 합성 + 스티커 + 촬영 로직 |
| `SelectSection.tsx` | 사진 선택 UI |
| `CompleteSection.tsx` | 결과 출력 + QR + 인쇄 |
| `CircularTimer.tsx` | 원형 아이들 타임아웃 카운트다운 |
| `CameraStreamer.tsx` | 카메라 상시 웜업 + 서브 모니터 프레임 전송 (배경 합성 포함, §15) |
| `FloatingElements.tsx` | 배경 데코레이션 애니메이션 |

### 전역 컴포넌트 (`src/components/`)

| 파일 | 역할 |
|------|------|
| `FullscreenToggle.tsx` | F11 전체화면 토글 웹뷰 리스너 (전역 단축키 등록 실패 시 폴백) |
| `MediapipeLoader.tsx` | 앱 시작 시 MediaPipe WASM 설치 확인 + 다운로드 UI |

### CameraSection 상세

`CameraSection.tsx`는 애플리케이션에서 가장 복잡한 컴포넌트다.

**핵심 상태:**
- `cameraError` / `cameraDeviceDiag` — 카메라 오류 메시지 + 장치 진단 정보
- `segmenterError` / `segmenterStatus` — MediaPipe 초기화 오류
- `countdown` / `captureProgress` — 촬영 카운트다운
- `stickers[]` — 현재 활성 스티커 배열

**초기화 순서:**
1. `getUserMedia()` 호출
2. `NotFoundError` 시 → `enumerateDevices()` + `get_cameras` Tauri 명령어로 진단
3. 스트림 성공 시 → MediaPipe segmenter 초기화
4. WASM HEAD 요청으로 파일 접근 가능 여부 사전 검사

---

## 7. 커스텀 훅

| 훅 | 파일 | 역할 |
|----|------|------|
| `useDeviceSetup` | `src/hooks/useDeviceSetup.ts` | 디바이스 설정 + 이미지 목록 + 인쇄 설정 로드 |
| `usePhotoFlow` | `src/hooks/usePhotoFlow.ts` | 7단계 상태 머신, sessionStorage 영속성 |
| `useIdleTimer` | `src/hooks/useIdleTimer.ts` | 비활동 타임아웃 카운트다운 |
| `useTauriMonitor` | `src/hooks/useTauriMonitor.ts` | Tauri 모니터 목록 + 서브 윈도우 열기/닫기 |
| `useSceneSync` | `src/hooks/useSceneSync.ts` | SSE 프레임 스트림 + BroadcastChannel 상태 동기화 |

### usePhotoFlow 상세

- **30+ 상태 항목** 관리 (step, selectedFrame, selectedBackground, photos, stickers, ...)
- `sessionStorage`에 JSON 직렬화 저장 (키: `photobooth_session_v2`)
- `advanceFromCurrentStep()` → 단계별 유효성 검사 후 다음 단계로 이동
- 사진 업로드 (`uploadPhotos()`), GIF 생성 (`createGif()`) 포함

### useSceneSync 상세

```
useFrameSender     → POST /api/camera-frame (throttled)
useFrameReceiver   → EventSource GET /api/camera-frame
useSceneSyncSender → BroadcastChannel.postMessage(state)   ※ 레거시
useSceneSyncReceiver → BroadcastChannel.onmessage(state)   ※ 레거시
```

※ 프레임에 배경·스티커가 **합성된 상태로 전송**되므로 output 페이지는
`useFrameReceiver`만 사용한다. BroadcastChannel 기반 상태 동기화 훅은
코드에 남아 있으나 현재 수신처가 없다 (제거 후보).

---

## 8. API 엔드포인트

### 디바이스 & 설정

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/device/[deviceId]/settings` | 디바이스 설정 조회 |
| POST | `/api/device/[deviceId]/settings` | 디바이스 설정 업데이트 |
| GET | `/api/setting` | 전역 설정 조회 |
| POST | `/api/setting` | 전역 설정 업데이트 |

### 이미지 & 배경

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/image/list/[imageType]` | 이미지 목록 (1=배경, 2+=프레임) |
| GET | `/api/images/url` | 이미지 베이스 URL (Supabase or 로컬) |
| POST | `/api/admin/images/upload` | 이미지 업로드 (최대 50MB) |
| DELETE | `/api/admin/images/[id]` | 이미지 삭제 |

### 관리자

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/admin/login` | 관리자 로그인 (세션 쿠키 반환) |
| GET | `/api/admin/devices` | 디바이스 목록 |
| POST | `/api/admin/devices` | 디바이스 생성 |
| GET | `/api/admin/devices/[id]` | 디바이스 상세 |
| POST | `/api/admin/devices/[id]` | 디바이스 수정 |
| POST | `/api/admin/devices/clone` | 디바이스 설정 복제 |
| GET | `/api/admin/image-types` | 이미지 타입 목록 |

### 결제

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/payments/request` | PayApp 결제 요청 생성 |
| GET | `/api/payments/status/[sessionId]` | 결제 상태 폴링 |
| POST | `/api/payments/feedback` | PayApp 서버 콜백 수신 |

### 사진 처리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/print/upload-image` | 합성 사진 업로드 (3일 만료 URL) |
| POST | `/api/gif/create` | 단순 GIF 생성 |
| POST | `/api/gif/create-layout` | 레이아웃 기반 GIF 생성 |
| GET | `/api/gif/[gifId]` | GIF 메타데이터 조회 |

### 서브 모니터 스트리밍

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/camera-frame` | 카메라 프레임 데이터 업로드 |
| GET | `/api/camera-frame` | SSE 스트림 구독 |

### 헬스

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/health` | 헬스 체크 |
| GET | `/api/ping` | 핑 |

---

## 9. 데이터 모델 (Prisma Schema)

### 포토부스 모델 (`pic_` 프리픽스)

**`Device`** - 물리적 키오스크 단위

| 필드 | 타입 | 설명 |
|------|------|------|
| deviceId | String (PK) | 기기 고유 ID |
| name | String | 기기 이름 |
| description | String? | 설명 |
| isActive | Boolean | 활성 여부 |

**`DeviceSetting`** - 기기별 설정

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| deviceId | String | Device 외래키 |
| name | String | 설정 키 (예: CHROMAKEY_MODE) |
| value | String | 설정 값 |

**`Setting`** - 전역 설정

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| name | String | 설정 키 |
| value | String | 설정 값 |

**`Image`** - 배경/프레임 이미지

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| deviceId | String? | Device 외래키 (null=전역) |
| imageType | Int | 1=배경, 2=프레임 |
| filename | String | 파일명 |
| width | Int? | 이미지 너비 (px) |
| height | Int? | 이미지 높이 (px) |
| priority | Int | 정렬 순서 |

**`ImageType`** - 이미지 카테고리

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 1=배경, 2=프레임, 3=스티커 |
| name | String | 카테고리 이름 |

**`AdminAccount`** - 관리자 계정

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| username | String | 사용자명 |
| password | String | bcrypt 해시 |
| isActive | Boolean | 활성 여부 |

**`PayappPayment`** - 결제 내역

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| orderId | String | 주문 ID |
| deviceId | String | 기기 ID |
| amount | Int | 결제 금액 (원) |
| status | String | pending / paid / refunded |
| payState | String? | PayApp pay_state 코드 |
| mulNo | String? | PayApp 거래번호 |
| rawPayload | String? | PayApp 원시 콜백 JSON |
| paidAt | DateTime? | 결제 완료 시각 |
| cancelledAt | DateTime? | 취소 시각 |
| createdAt | DateTime | 생성 시각 |

---

## 10. Tauri 명령어 (Rust)

파일: `src-tauri/src/lib.rs`

| 명령어 | 반환 | 설명 |
|--------|------|------|
| `get_monitors` | `Vec<MonitorInfo>` | 연결된 모니터 목록 (위치, 크기 포함) |
| `open_camera_window(x, y, width, height)` | `Result<(), String>` | 지정 좌표에 서브 윈도우 열기 |
| `close_camera_window` | `void` | 서브 윈도우 닫기 |
| `get_printers` | `Vec<String>` | Windows 프린터 목록 (PowerShell) |
| `get_cameras` | `Vec<String>` | 연결된 카메라 목록 (PnP) |
| `print_image(printer_name, image_data)` | `Result<bool, String>` | base64 JPEG 출력 (.NET PrintDocument) |
| `mediapipe_is_installed` | `bool` | 필수 파일 **전체**(wasm 6개 + 모델)의 완전성 검사 (디버그 모드: 항상 true) |
| `download_mediapipe` | `Result<(), String>` | CDN에서 MediaPipe 다운로드 + `mediapipe-progress` 이벤트 발행. 임시 파일(`.download`)로 받은 뒤 rename하여 부분 다운로드 잔존 방지 |
| `save_settings` | `Result<bool, String>` | `%APPDATA%\ar-pic\settings.json` 저장 |
| `load_settings` | `Result<HashMap<String,String>, String>` | 설정 JSON 로드 |

### 자동 초기화 동작 (앱 시작 시)

1. `%LOCALAPPDATA%\ar-pic\.version` 파일로 **앱 버전 + server.zip 내용 해시**
   (build.rs가 FNV-1a로 계산, `SERVER_BUILD_ID`) 비교 — 같은 앱 버전(0.1.0)이라도
   번들이 바뀌면 재추출된다 (버전만 비교하면 이전 빌드를 설치했던 PC에서
   새 설치 후에도 구버전 server 디렉터리가 재사용되는 버그)
2. 불일치 시 `server.zip` 압축 해제 (`%LOCALAPPDATA%\ar-pic\server\`)
3. MediaPipe 캐시가 있고 서버 디렉토리가 **불완전하면** 캐시에서 다시 복사
4. 포트 3001 선점 프로세스 종료
5. `node.exe server.js` 자식 프로세스 시작 (`HOSTNAME=127.0.0.1` 바인딩)
6. 최대 60초 대기 후 서버 준비 확인
7. WebView2 카메라 권한 자동 허용 (localhost URL)
8. F11 전역 단축키 등록 (실패해도 앱 시작은 계속 — 웹뷰 리스너가 폴백)

### 종료 동작

- **메인 창**(`main`)이 파괴될 때만 Node 자식 프로세스를 종료한다.
  서브 모니터 창(`camera-output`)을 닫거나 재생성해도 서버는 유지된다
  (`should_shutdown_server_on_destroy`, 단위 테스트 포함).

### 키보드 단축키

| 단축키 | 동작 | 구현 위치 |
|--------|------|---------|
| `F11` | 전체화면 ↔ 창 모드 토글 | 1차: Rust 전역 단축키 (`toggle_fullscreen`, lib.rs) / 폴백: `src/components/FullscreenToggle.tsx` (전역 레이아웃에 마운트) |

- 창은 borderless 1920×1080 전체화면으로 시작하므로, 창 모드 전환 시
  **테두리 복원 + 1280×800 축소 + 화면 중앙 배치**로 토글이 시각적으로 구분되게 한다
- 전체화면 복귀 시 테두리 제거 후 `setFullscreen(true)`
- 두 구현(Rust/웹뷰)은 동일한 동작을 수행하며, 전역 단축키가 등록되면
  OS가 키를 소비하므로 웹뷰 리스너는 실행되지 않는다 (이중 토글 없음)
- 브라우저 직접 실행: 동작 없음 (Tauri API 미존재)

---

## 11. 카메라 시스템

### 카메라 접근

```typescript
navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
```

- WebView2: `PermissionRequested` 이벤트 핸들러가 localhost URL에 대해 자동 허용
- 브라우저 직접 실행: 표준 브라우저 권한 다이얼로그

### 오류 처리

| 오류 | 원인 | 표시 메시지 |
|------|------|-------------|
| `NotFoundError` | 카메라 하드웨어 없음 | "연결된 카메라가 없습니다" + 장치 진단 |
| `NotAllowedError` | 권한 거부 | "카메라 접근 권한이 필요합니다" |
| 기타 | 알 수 없는 오류 | 오류 메시지 직접 표시 |

`NotFoundError` 시 자동 진단:
```
브라우저 장치: N개 | OS 장치: {카메라명} (또는 없음)
```

### 렌더링 루프

```
requestAnimationFrame loop (≈30fps)
  ↓
drawImage(videoElement) → canvas
  ↓
배경 제거 적용 (mediapipe / chromakey / off)
  ↓
sticker 오버레이 (canvas.drawImage / fillText)
  ↓
서브 모니터 동기화 (throttled POST)
  ↓
화면에 표시 (canvas → display)
```

---

## 12. 배경 제거 모드

### MediaPipe (`bgRemovalMode: "mediapipe"`)

- 모델: `selfie_multiclass_256x256.tflite`
- WASM: `vision_wasm_internal.js` + `.wasm` (SIMD / non-SIMD 자동 선택)
- 출력: `ConfidenceMask` (float32 alpha 값 배열)
- 전경 카테고리 선택 로직:
  1. "person" 또는 "selfie" 레이블 검색
  2. 없으면 휴리스틱: 중앙 픽셀 vs 테두리 픽셀 비율로 판단
- 마스크를 캔버스 크기에 맞게 스케일링 후 alpha 채널 적용

### Chromakey (`bgRemovalMode: "chromakey"`)

- 설정: `CHROMAKEY_RGB` (기본: "0,255,0", 녹색)
- RGB 색상 공간에서 유사도 임계값 기반 제거
- `similarity` + `smoothness` 슬라이더로 조정 가능

### 없음 (`bgRemovalMode: "off"`)

- 배경 제거 없이 영상 그대로 표시

---

## 13. 프레임 / 레이아웃 시스템

### 6종 레이아웃

| ID | 레이블 | 그리드 | 슬롯 수 | 방향 |
|----|--------|--------|---------|------|
| `1x1` | 1컷 | 1×1 | 1 | 가로 |
| `2x1` | 2컷 | 1×2 | 2 | 세로 |
| `2x2` | 4컷 | 2×2 | 4 | 가로 |
| `2x3` | 6컷 | 3×2 | 6 | 가로 |
| `2x4` | 8컷 | 2×4 | 8 | 세로 |
| `4x1` | 4컷 | 1×4 | 4 | 세로 |

### 인쇄 레이아웃 설정 키 패턴

키의 `{ID}`는 모드 문자열의 `x`를 `_`로 치환한 형태다 (예: `2x2` → `MODE_2_2_*`).

```
MODE_{ID}_WIDTH          # 사진 슬롯 너비 (cm)
MODE_{ID}_HEIGHT         # 사진 슬롯 높이 (cm)
MODE_{ID}_HGAP           # 사진 간 가로 간격 (cm)
MODE_{ID}_VGAP           # 사진 간 세로 간격 (cm)
MODE_{ID}_MARGIN_TOP     # 상단 여백 (cm, 선택)
MODE_{ID}_MARGIN_BOTTOM  # 하단 여백 (cm, 선택)
MODE_{ID}_MARGIN_LEFT    # 좌측 여백 (cm, 선택)
MODE_{ID}_MARGIN_RIGHT   # 우측 여백 (cm, 선택)
PICTURE_WIDTH            # 인화지 너비 (cm)
PICTURE_HEIGHT           # 인화지 높이 (cm)
PRINT_BACKGROUND         # 인쇄 배경 이미지 (선택)
PRINTER_NAME             # 출력 프린터 이름 (비우면 기본 프린터)
```

예: `MODE_2_2_WIDTH=6.5`, `MODE_2_2_HEIGHT=4.7`, `MODE_2_2_HGAP=0.2`, `MODE_2_2_VGAP=0.2`

### 슬롯 배치 계산 (`src/lib/printLayout.ts`)

관리자 인화 설정의 **실시간 미리보기**와 서비스의 **합성/레이아웃 GIF**가
동일한 `computePrintLayout()` 함수를 사용한다 (보이는 대로 인쇄 보장).

**여백 규칙** (가로/세로 축 각각 독립):

| 입력 상태 | 배치 기준 |
|-----------|----------|
| 상단(좌측) 여백 지정 | 위(왼쪽) 기준 |
| 하단(우측) 여백만 지정 | 아래(오른쪽) 기준 |
| 둘 다 비움 | 중앙 정렬 |
| 둘 다 지정 | 상단/좌측 우선 (관리자 UI에서 동시 입력을 비활성화로 차단) |

- 빈 문자열·NaN·음수 값은 "미설정"으로 취급 (`parseCm`)
- `WIDTH`/`HEIGHT` 미설정 시 4:3 비율 자동 배치 폴백
- 슬롯이 인화지를 벗어나면 `overflow` 플래그 → 미리보기에 빨간 슬롯 + 경고 배너 표시

### 중간 프레임 (Intermediate Frames)

- 촬영 카운트다운 중 **~180ms 간격**으로 중간 프레임을 `intermediateFrames[photoIndex][]`에 저장
  (GIF 재생 10fps와 매칭, 800px 다운스케일 JPEG, 최근 24장만 유지 — 메모리·파일 크기 제한)
- `CompleteSection`에서 `/api/gif/create-layout` 호출 시 사용
- GIF 애니메이션: 촬영 과정이 자연스럽게 보임 (10fps, 24프레임 시 ~2.4초 루프)

---

## 14. 스티커 시스템

### 기본 제공 이모지 (12종)

| 이모지 | 이름 |
|--------|------|
| ⭐ | 별 |
| ❤️ | 하트 |
| ✨ | 반짝 |
| 🎉 | 파티 |
| 🌸 | 벚꽃 |
| 🦋 | 나비 |
| 🌈 | 무지개 |
| 🎀 | 리본 |
| 🌙 | 달 |
| 🔥 | 불꽃 |
| 💫 | 빛 |
| 🎵 | 음표 |

### 데이터 구조

```typescript
interface Sticker {
  id: string;
  emoji?: string;  // 이모지 문자
  src?: string;    // 이미지 URL (커스텀 스티커)
  x: number;       // 0~1 (캔버스 너비 비율)
  y: number;       // 0~1 (캔버스 높이 비율)
  scale: number;   // 크기 배율
}
```

### 인터랙션

| 제스처 | 동작 |
|--------|------|
| 드래그 | 스티커 이동 |
| 핀치 (두 손가락) | 스티커 크기 조절 |
| 탭 | 선택 / 해제 |
| 이모지 피커 | 스티커 추가 |

---

## 15. 서브 모니터 스트리밍

### 아키텍처

```
[카메라 단계 외 모든 스텝 (대기 화면 포함)]
CameraStreamer (헤드리스, 메인 윈도우) — 항상 마운트
    ↓ enabled=true: 앱 진입 즉시 getUserMedia로 카메라 상시 점유 (웜업)
    ↓ sendFrames=syncEnabled: 서브 모니터 출력이 켜진 경우에만
    ↓   배경 합성 후 JPEG (chromakey / mediapipe / raw)
    ↓   (전송 대상 없으면 픽셀 합성 연산 생략, 카메라만 유지)
    POST /api/camera-frame
    ↓ SSE 브로드캐스트
Output Page (서브 모니터 윈도우)
    ↓ useFrameReceiver (EventSource)
    <img src={frameUrl} />  (≈100-200ms 지연)

[카메라 단계 (step="camera")]
CameraSection (메인 윈도우) — CameraStreamer는 언마운트되고 카메라 소유권 이관
    ↓ 동일 파이프라인 (배경 합성 + 스티커 포함)
    POST /api/camera-frame
    → Output Page

※ 카메라를 미리 켜두므로 서브 모니터 출력을 켜는 즉시 화면이 출력된다
(getUserMedia 초기화 지연 없음).
※ 배경·스티커가 합성된 프레임이 전송되므로 output 페이지에 별도 상태
동기화가 필요 없다. (BroadcastChannel 훅은 레거시 — §7 참고)
```

### CameraStreamer 배경 합성 모드

| `bgRemovalMode` | 배경 선택 여부 | 서브 모니터 출력 |
|-----------------|--------------|----------------|
| `"off"` | — | 원본 카메라 (미러) |
| `"chromakey"` | 없음 | 원본 카메라 |
| `"chromakey"` | 있음 | 크로마키 배경 제거 + 선택 배경 합성 |
| `"mediapipe"` | 없음 | 원본 카메라 |
| `"mediapipe"` | 있음 (세그멘터 준비 전) | 원본 카메라 (폴백) |
| `"mediapipe"` | 있음 (세그멘터 준비 후) | MediaPipe 배경 제거 + 선택 배경 합성 |

### SSE 구현 (`/api/camera-frame`)

- **POST**: 프레임 data URL을 메모리의 `sseClients` Set에 브로드캐스트
- **GET**: `ReadableStream` 생성, SSE 헤더 설정, 클라이언트를 `sseClients`에 등록
- 연결 끊긴 클라이언트는 send 실패 시 자동 제거

### 서브 윈도우 생성 (Tauri)

```rust
open_camera_window(x, y, width, height)
  → WebviewWindowBuilder::new("camera-output", "/output")
  → .fullscreen(true).decorations(false).always_on_top(true)
  → .position(x, y).inner_size(width, height)
```

---

## 16. 인쇄 시스템

### 디지털 공유 (`/api/print/upload-image`)

- 입력: base64 JPEG
- 파일명: `{YYYYMMDD}_{UUID8}.jpg`
- 저장 순서:
  1. Supabase Storage `pic-prints` 버킷 (우선)
  2. 로컬 `/static/prints/` (폴백)
- 반환: URL + 3일 만료 날짜

### GIF 생성 (`/api/gif/create`)

- 입력: base64 이미지 배열 + 프레임 지속시간(ms)
- 최대 너비 800px (비율 유지 리사이징)
- `gif-encoder-2` + `sharp` 사용
- Neuquant 팔레트 (quality=10)
- 프레임 지속시간: 중간 프레임 GIF는 100ms(10fps), 완성 사진 나열 GIF는 800ms
  ※ GIF 딜레이를 20ms 미만으로 낮추면 브라우저가 100ms로 강제하므로 50fps가 포맷 실질 한계

### 레이아웃 GIF (`/api/gif/create-layout`)

- 입력: `intermediate_pictures` (위치별 프레임 배열), 레이아웃 파라미터,
  프레임 스타일 파라미터(`corner_radius`/`border_width`/`border_color`),
  배경 데이터 URL(`background_image_data`)
- **합성 사진과 동일한 프레임 스타일 적용**: 클라이언트가 배경만 그려진
  합성 캔버스 스냅샷과 스타일 값(공용 상수 `FRAME_CORNER_RADIUS_CM` 등,
  `src/lib/printLayout.ts`)을 GIF 축척으로 환산해 전달 → 서버가 SVG 마스크로
  둥근 모서리, SVG 스트로크로 테두리를 각 사진에 적용
- 로직:
  1. 각 프레임을 `photo_width × photo_height`로 리사이징 + 둥근 모서리·테두리 적용
  2. 배경 베이스 캔버스 생성 — `background_image_data`(합성과 동일 배경) >
     `background_image`(PRINT_BACKGROUND 파일) > `background_color` 순
     (단색 배경은 반드시 png로 인코딩 — `sharp({create})`를 포맷 미지정으로
     `toBuffer()`하면 raw 픽셀이 반환되어 이후 재파싱이 실패한다)
  3. 각 애니메이션 프레임마다 모든 포지션 버퍼를 계산된 오프셋에 합성
  4. GIF 인코딩 (duration 100ms = 10fps)

### 물리적 인쇄 (`print_image` Tauri 명령어)

1. base64를 임시 JPEG 파일로 저장
2. PowerShell 스크립트 실행:
   - `System.Drawing.Image`로 이미지 로드
   - 가로(width > height) / 세로 자동 감지
   - `PrintDocument` + `CenterImage` 여백 설정
   - .NET 프린터 API 호출
3. 임시 파일 정리

---

## 17. 결제 시스템 (PayApp)

### 결제 흐름

```
[앱] POST /api/payments/request
    → PayappPayment 생성 (status=pending)
    → PayApp API (cmd=payrequest)
    → payUrl + mulNo 반환

[사용자] payUrl에서 카드 결제

[PayApp] POST /api/payments/feedback (서버 콜백)
    → pay_state=4 → status=paid 업데이트

[앱] GET /api/payments/status/{orderId} (2초 폴링)
    → status=paid 감지 → 다음 단계
```

### PayApp 콜백 pay_state 코드

| 코드 | 상태 |
|------|------|
| 4 | 결제 완료 |
| 5 | 환불/취소 |

### 결제 환경 변수

```
PAYAPP_USERID          # PayApp 계정 ID
PAYAPP_GOODNAME        # 상품명 (예: "AR-pic 촬영")
PAYAPP_RECVPHONE       # 수신 전화번호
PAYAPP_FEEDBACK_URL    # 콜백 URL
PAYAPP_RETURN_URL      # 결제 완료 후 리다이렉트 URL
```

---

## 18. MediaPipe 다운로드 및 캐시

### 다운로드 파일 목록 (v0.10.35, 총 7개)

| 파일 | 출처 | 크기(약) |
|------|------|---------|
| `wasm/vision_wasm_internal.js` | jsDelivr | ~800KB |
| `wasm/vision_wasm_internal.wasm` | jsDelivr | ~7MB |
| `wasm/vision_wasm_module_internal.js` | jsDelivr | ~800KB |
| `wasm/vision_wasm_module_internal.wasm` | jsDelivr | ~7MB |
| `wasm/vision_wasm_nosimd_internal.js` | jsDelivr | ~800KB |
| `wasm/vision_wasm_nosimd_internal.wasm` | jsDelivr | ~7MB |
| `model/selfie_multiclass_256x256.tflite` | Google Storage | ~20MB |

### 캐시 전략

```
앱 최초 실행
    ↓ mediapipe_is_installed() → false
    ↓ MediapipeLoader.tsx: 다운로드 UI 표시
    ↓ download_mediapipe() Rust 명령어
    ↓ 7개 파일 순차 다운로드 (파일별 {이름}.download 임시 파일 → 성공 시 rename)
    ↓ %LOCALAPPDATA%\ar-pic\mediapipe\ 에 저장
    ↓ server\ 디렉토리에 복사

이후 실행
    ↓ prepare_server_dir(): server\ 쪽 파일이 불완전하면 캐시에서 재복사
    ↓ mediapipe_is_installed() → 필수 7개 파일 전체 존재 시에만 true
    ↓ 다운로드 UI 스킵
```

**부분 다운로드 복구**: 다운로드가 중간에 중단되어도 (1) 임시 파일 rename
방식이라 불완전한 파일이 최종 경로에 남지 않고, (2) 설치 검사가 전체 파일
기준이라 다음 실행 시 다운로드 UI가 다시 표시되어 이어받는다
(`download_file`은 이미 존재하는 파일을 스킵).

**디버그 모드**: `mediapipe_is_installed()` 항상 `true` 반환 (다운로드 스킵)

---

## 19. 오프라인 지원 (Service Worker / PWA)

### 캐시 전략

| 리소스 유형 | 전략 | 캐시 이름 |
|------------|------|---------|
| 정적 자산, 페이지 | Cache-first → 네트워크 업데이트 | `arpic-static-v2` |
| API 응답 | 네트워크-first → 캐시 폴백 | `arpic-dynamic-v2` |
| `/api/payments/*` | 네트워크 전용 (실패 시 오류) | — |

### 사전 캐시 항목 (10개)

페이지 4종 (`/`, `/service`, `/admin`, `/output`), `manifest.json`,
MediaPipe WASM 4종 + 모델 1종

### PWA 매니페스트 (`public/manifest.json`)

```json
{
  "name": "AR-pic 포토부스",
  "short_name": "AR-pic",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#2a2a2a",
  "icons": ["192x192", "512x512"]
}
```

### 오프라인 동작

| 기능 | 오프라인 가능? |
|------|--------------|
| UI 탐색 | ✅ (캐시됨) |
| 카메라 촬영 | ✅ (로컬 장치) |
| MediaPipe AI | ✅ (캐시됨) |
| 사진/GIF 업로드 | ❌ (네트워크 필요) |
| 결제 | ❌ (네트워크 필요) |

---

## 20. 설정 시스템

### 설정 레이어 계층

```
1. 하드코딩 기본값 (useDeviceSetup.ts)
      ↓ 오버라이드
2. 전역 설정 (Setting 테이블, /api/setting)
      ↓ 오버라이드
3. 디바이스별 설정 (DeviceSetting 테이블, /api/device/[id]/settings)
```

병합은 클라이언트의 `useDeviceSetup.loadSettings()`에서 수행한다:
전역과 디바이스 설정을 병렬 조회 후 `{...global, ...device}`로 합쳐
`config`(파싱된 값)와 `printSettings`(원시 키-값)를 구성한다.

**로드 실패 재시도**: 설정과 배경 목록 조회가 모두 실패하면(서버 기동
직후 등) 3초 간격으로 최대 5회 재시도한다. 재시도가 없으면 배경은 폴백
그라디언트, 설정은 하드코딩 기본값(결제 비활성 등)으로 영영 남는다.
언마운트(abort) 시 재시도를 중단한다.

### 주요 설정 키

| 키 | 기본값 | 설명 |
|----|--------|------|
| `CAPTURE_SECONDS` | 3 | 촬영 카운트다운 초 |
| `CAPTURE_COUNT_UNIFORM` | 4 | 슬롯당 촬영 수 |
| `CAPTURE_MODES` | "1x1,2x2" | 활성 프레임 모드 |
| `CHROMAKEY_MODE` | "mediapipe" | 배경 제거 모드 |
| `CHROMAKEY_RGB` | "0,255,0" | 크로마키 색상 |
| `PAYMENT_ENABLED` | "0" | 결제 활성화 |
| `PAYMENT_AMOUNT` | "1000" | 결제 금액 (원) |
| `PAYMENT_TERMINAL_MODE` | "manual" | 결제 모드 |
| `IDLE_TIMEOUT_SECONDS` | "30" | 자동 진행 타임아웃 |
| `CAMERA_AUTO_TIMER` | "60" | 자동 촬영 타이머 (초) |
| `PICTURE_WIDTH` / `PICTURE_HEIGHT` | "10" / "15" | 인화지 크기 (cm) |
| `PRINTER_NAME` | "" | 출력 프린터 (비우면 기본 프린터) |
| `MODE_2_2_WIDTH` | — | 2×2 모드 사진 슬롯 너비 (cm) |
| `MODE_2_2_HEIGHT` | — | 2×2 모드 사진 슬롯 높이 (cm) |

---

## 21. 환경 변수

### 데이터베이스

```env
DATABASE_URL=postgresql://[pool-user]@[host]:6543/[db]?pgbouncer=true
DIRECT_URL=postgresql://[user]@[host]:5432/[db]
```

### Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
```

### PayApp

```env
PAYAPP_USERID=[계정ID]
PAYAPP_GOODNAME=AR-pic 촬영
PAYAPP_RECVPHONE=[전화번호]
PAYAPP_FEEDBACK_URL=https://[도메인]/api/payments/feedback
PAYAPP_RETURN_URL=https://[도메인]/payment/return
```

### 기타

```env
CRON_SECRET=[웹훅 시크릿]
UPLOAD_DIR=static/images
```

---

## 22. 빌드 시스템

### 개발 환경

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run tauri dev    # Tauri + Next.js dev (WebView2 → localhost:3000)
```

### 빌드 시각 표시

`next.config.ts`의 `env.NEXT_PUBLIC_BUILD_DATE`에 빌드 시점(KST,
`YYYY-MM-DD HH:mm`)이 상수로 인라인된다. 루트 페이지(`/`)와 서비스 대기
화면(StartSection) 우측 상단에 `빌드 {시각}` 형태로 표시된다.
dev 모드에서는 dev 서버 시작 시각이 표시된다.

### 프로덕션 빌드 파이프라인

```
npm run tauri:build
    │
    ├─ scripts/prepare-tauri.mjs
    │    ├─ [0] .version 파일 삭제 (캐시 무효화)
    │    ├─ [1] npm run build (Next.js standalone 빌드)
    │    ├─ [2] .next/standalone → src-tauri/server/ 복사
    │    │       ⚠ public/static/prints, public/static/mediapipe 제외
    │    ├─ [2] .next/cache/ 삭제
    │    ├─ [2] Prisma 임시파일 정리
    │    │       .tmpXXXX 패턴 (19MB × N개)
    │    │       .so.node / .dylib.node (비Windows 바이너리)
    │    ├─ [3] node.exe 복사 (Node.js 런타임 번들링)
    │    ├─ [4] sharp 네이티브 DLL 복사
    │    ├─ [5] .env 파일 복사
    │    └─ [6] src-tauri/server/ → src-tauri/server.zip (PowerShell)
    │
    └─ cargo build --release
         ├─ include_bytes!("server.zip") 임베딩
         ├─ Tauri 플러그인 컴파일
         └─ NSIS 인스톨러 생성

출력물:
  src-tauri/target/release/bundle/nsis/AR-pic_0.1.0_x64-setup.exe
```

### server.zip 크기 최적화

| 항목 | 제거 이유 | 절감 크기 |
|------|----------|---------|
| `public/static/mediapipe/` | 런타임 다운로드로 대체 | ~48MB |
| `public/static/prints/` | 앱이 mkdir으로 생성 | 소량 |
| Prisma `.tmpXXXX` 파일 | 빌드 아티팩트 | ~133MB |
| Prisma 비Windows `.so.node` | Windows에서 불필요 | ~16MB |
| `.next/cache/` | 프로덕션 불필요 | 수십MB |

정리 전: ~160MB → 정리 후: ~100MB → 최종 exe: ~112MB

### Tauri 앱 설정 (`src-tauri/tauri.conf.json`)

| 항목 | 값 |
|------|---|
| 제품명 (productName) | AR-pic |
| 창 제목 | 비즈웨이브 AR-pic |
| 버전 | 0.1.0 |
| 식별자 | net.viswave.arpic |
| 초기 창 크기 | 1920×1080 |
| 전체화면 | true |
| 데코레이션 | false |
| 번들 형식 | NSIS (인스톨러) |
| 내장 서버 | http://127.0.0.1:3001 |

---

## 23. 관리자 패널

### 기능 목록

| 메뉴 | 경로 | 주요 기능 |
|------|------|---------|
| 디바이스 관리 | `/admin/devices` | 생성, 편집, 복제 |
| 이미지 관리 | `/admin/images` | 배경/프레임/스티커 탭별 조회·삭제·업로드, MP4/WebM 영상 미리보기 |
| 인화 설정 | `/admin/print-setting` | 인화지 크기, 모드별 사진 크기·간격·4방향 여백, 배경 이미지, 프린터 선택. 설정값 실시간 미리보기 + 용지 초과 경고 |
| 시스템 설정 | `/admin/settings` | 유휴 타임아웃, 촬영 횟수, 크로마키 등 전역 설정 (그룹: 기본/촬영/기타) |
| 결제 설정 | `/admin/payment` | PayApp 활성화, 금액, 단말 모드 설정 (전역 적용, 디바이스 설정이 우선) |
| 결제 내역 | `/admin/payment-history` | 거래 이력 조회 |

- 이미지 타입(배경=1, 프레임=2, 스티커=3)은 `/api/admin/image-types` 조회 시
  기본 3종이 upsert로 보장된다 (시드 이전 DB에서도 스티커 업로드 가능).
- 인화 설정의 여백 입력은 상/하 또는 좌/우를 동시에 설정할 수 없다
  (한쪽 입력 시 반대쪽 비활성화, 비우면 자동 중앙 정렬 — §13 참고).

### 인증

- `POST /api/admin/login` → bcrypt 비밀번호 검증 → 세션 쿠키 발급
- 미들웨어 또는 각 페이지에서 세션 쿠키 확인
- `AdminAccount` 테이블 기반 (isActive 체크)

---

## 24. 다국어 (i18n)

외부 라이브러리 없이 자체 사전 + React 컨텍스트로 구현 (`src/i18n/`).

### 지원 언어

| 코드 | 언어 | 버튼 라벨 |
|------|------|----------|
| `ko` | 한국어 (기본) | 한국어 |
| `en` | 영어 | English |
| `ja` | 일본어 | 日本語 |
| `zh` | 중국어 (간체) | 中文 |

### 구조

| 파일 | 역할 |
|------|------|
| `src/i18n/translations.ts` | 4개 언어 사전 (`MessageKey` 타입으로 키 누락 시 컴파일 에러), `{param}` 치환 지원 |
| `src/i18n/LanguageContext.tsx` | `LanguageProvider` + `useLanguage()` → `{ lang, setLang, t }` |

### 동작

- **언어 선택**: 대기 화면(StartSection) 터치 버튼 아래 4개 버튼.
  버튼 클릭은 화면 터치(시작)로 전파되지 않는다.
- **초기화**: 대기 화면(`currentStep === "start"`)으로 돌아오면 다음 손님을
  위해 한국어로 자동 리셋 (service page의 effect).
- **적용 범위**: 손님이 보는 서비스 플로우 전체 — 대기/결제/프레임/배경/
  촬영/선택/완료 화면과 공통 버튼(이전/다음/처음으로/다시 시도), 카메라
  오류 메시지 (에러는 `MessageKey`로 저장해 언어 변경 시에도 재번역).
- **비적용(한국어 유지)**: 관리자 페이지, 운영자 UI(출력 설정 패널, 빌드
  표시), 개발용 버튼, 장치 진단 문자열.
- 프레임 라벨(`1컷` 등)은 `frame.cut` 키 + 슬롯 수 파라미터로 생성
  (예: en `4-Cut`, ja `4カット`, zh `4格`).

---

## 부록: 주요 파일 경로 참조

| 역할 | 파일 경로 |
|------|---------|
| 타입 정의 | `src/types/index.ts` |
| 메인 서비스 페이지 | `src/app/service/page.tsx` |
| 서브 모니터 페이지 | `src/app/output/page.tsx` |
| 카메라 컴포넌트 | `src/components/service/CameraSection.tsx` |
| MediaPipe 로더 | `src/components/MediapipeLoader.tsx` |
| 사진 흐름 훅 | `src/hooks/usePhotoFlow.ts` |
| 장면 동기화 훅 | `src/hooks/useSceneSync.ts` |
| 인화 레이아웃 계산 | `src/lib/printLayout.ts` |
| 다국어 사전/컨텍스트 | `src/i18n/translations.ts`, `src/i18n/LanguageContext.tsx` |
| Tauri 백엔드 | `src-tauri/src/lib.rs` |
| Tauri 설정 | `src-tauri/tauri.conf.json` |
| Prisma 스키마 | `prisma/schema.prisma` |
| 빌드 스크립트 | `scripts/prepare-tauri.mjs` |
| 서비스 워커 | `public/sw.js` |
| PWA 매니페스트 | `public/manifest.json` |
| 전역 레이아웃 | `src/app/layout.tsx` |
