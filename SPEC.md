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
25. [테마 관리 (배경화면 / 로고 / 색상) — 지점별](#25-테마-관리-배경화면--로고--색상--지점별)
26. [손바닥 제스처 촬영](#26-손바닥-제스처-촬영)
27. [디버그 모드 (서비스 화면)](#27-디버그-모드-서비스-화면)

---

## 1. 프로젝트 개요

**AR-pic (비즈웨이브 AR-pic)** 는 Windows 전용 AI 포토부스 데스크탑 애플리케이션이다.

### 목적

실내 설치형 무인 포토부스 키오스크에서 동작하며, 다음 기능을 통합 제공한다:

- 실시간 AI 배경 제거 (MediaPipe selfie segmentation)
- 6종 프레임 레이아웃 선택
- 스티커 오버레이 (지점별 이미지 뱅크)
- 카드 결제 (PayApp Lite)
- 인화지 출력 (Windows 프린터)
- QR코드 기반 디지털 사진 공유 (24시간 만료 URL)
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
| `/admin/login` | `src/app/admin/login/page.tsx` | 관리자 인증 (`(protected)` 라우트 그룹 밖) |
| `/admin` | `src/app/admin/(protected)/page.tsx` | 관리자 대시보드 |
| `/admin/accounts` | `src/app/admin/(protected)/accounts/page.tsx` | 관리자 계정 추가·삭제·비밀번호 변경 |
| `/admin/devices` | `src/app/admin/(protected)/devices/page.tsx` | 디바이스 목록 |
| `/admin/devices/new` | `src/app/admin/(protected)/devices/new/page.tsx` | 디바이스 생성 |
| `/admin/devices/[id]` | `src/app/admin/(protected)/devices/[id]/page.tsx` | 디바이스 편집 |
| `/admin/images` | `src/app/admin/(protected)/images/page.tsx` | 배경/프레임/스티커 이미지 관리 |
| `/admin/images/upload` | `src/app/admin/(protected)/images/upload/page.tsx` | 이미지 업로드 |
| `/admin/theme-setting` | `src/app/admin/(protected)/theme-setting/page.tsx` | 테마 관리(지점별) — 배경화면(첫/공통/화면별)·로고·촬영 안내 오버레이·버튼 이미지·글자색·강조색 (§25 참고) |
| `/admin/print-setting` | `src/app/admin/(protected)/print-setting/page.tsx` | 인쇄 레이아웃 치수 설정 |
| `/admin/capture-setting` | `src/app/admin/(protected)/capture-setting/page.tsx` | 촬영/배경 제거 설정 (§12, §23 참고) |
| `/admin/timer-setting` | `src/app/admin/(protected)/timer-setting/page.tsx` | 유휴·촬영·인화 타이머 설정 |
| `/admin/payment` | `src/app/admin/(protected)/payment/page.tsx` | PayApp 결제 단말 설정 |
| `/admin/payment-history` | `src/app/admin/(protected)/payment-history/page.tsx` | 결제 내역 조회 |

`/admin/settings`(전역 시스템 설정 통합 페이지)는 이후 리팩터링으로 제거되고
`capture-setting`/`timer-setting` 등으로 쪼개졌다 — 옛 경로이니 참고 시 주의.

---

## 5. 7단계 사용자 흐름 (Photo Flow)

진행 상태(단계·선택값)는 `sessionStorage` 키 `photobooth_session_v3`에 저장되어 새로고침 후에도 복원된다. 단, **촬영본(photos)·중간프레임은 저장하지 않는다**(세션당 수십 MB로 5MB 쿼터 초과 + 촬영마다 재직렬화 비용). 따라서 사진이 필요한 단계(select 이후)로 저장돼 있으면 복원 시 **촬영 단계로 되돌려** 같은 프레임/배경으로 재촬영하게 한다.

```
[1. START] → [2. PAYMENT*] → [3. FRAME] → [4. BACKGROUND]
     → [5. CAMERA] → [6. SELECT] → [6.5 PRINTBG†] → [7. COMPLETE]
                                                          ↓
                                                    [1. START (리셋)]
* 결제 비활성 시 스킵
† 인쇄 배경(프레임, imageType 2) 이미지가 이 지점에 하나라도 있을 때만 표시.
  없으면 SELECT → COMPLETE로 바로 건너뛴다. (유휴 타임아웃도 동일하게 분기)
```

### Step 0: PREFLIGHT (시스템 점검)

대기 화면 진입 전 `PreflightSection`이 병렬 점검을 수행한다 (세션 복원으로
중간 단계 진입 시에는 생략).

| 항목 | 등급 | 실패 시 |
|------|------|--------|
| 서버 연결 (`/api/health`) | 차단 | 4초 간격 자동 재시도 |
| 앱 버전 정합성 (클라이언트 빌드 시각 vs 서버 `buildDate`) | — | **불일치 = 구버전/SW 캐시 감지** → 캐시·서비스워커 삭제 후 1회 강제 새로고침 (자가 복구), 재발 시 경고 표시 |
| 장치 설정 로드 | 차단 | 자동 재시도 |
| 배경 이미지 (목록 + 첫 이미지 실제 로드) | 경고 | 표시만 하고 진입 허용 |
| AI 모델 (mediapipe 모드일 때 wasm+모델 HEAD) | 경고 | 표시만 하고 진입 허용 |
| 카메라 장치 (`enumerateDevices`) | 차단 | 자동 재시도 |

- 차단 항목 전부 통과 → 0.7초 후 대기 화면 자동 진입
- 실패 항목은 빨간 표시 + 상세 사유 노출 (원격 진단용)

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
- **인쇄 매수 선택**: **1장/2장/4장 고정** 카드 중 선택 →
  **총액 = `PAYMENT_AMOUNT`(1장당 가격) × 선택 매수**, 하단에 선택 총액 실시간 표시.
  선택한 매수는 `usePhotoFlow.printQuantity`에 저장되어 인화 단계에서 그 수만큼 출력된다(§16).
- **언어 선택**: 언어 버튼이 이 화면에 있다(결제 비활성 시에는 시작 화면에 표시 — §24).
- **Manual 모드**: 결제하기 → 결제 완료로 간주하고 진행
- **PayApp Lite 모드**:
  1. `POST /api/payments/request`(amount = 선택 총액) → orderId + payUrl 반환
  2. 사용자가 PayApp 단말 UI에서 카드 결제
  3. PayApp이 `POST /api/payments/feedback` 콜백 전송
  4. 앱이 `GET /api/payments/status/{orderId}` 2초 간격 폴링 (최대 300초)
  5. status="paid" 감지 → 다음 단계 진행

### Step 3: FRAME SELECT

- 6종 레이아웃 그리드 표시 (`CAPTURE_MODES` 설정에 따라 필터링)
- 카드 미리보기는 실물 인화지 비율(10×15cm, 모드별 방향)의 종이 위에
  `computePrintLayout` 폴백 배치를 축소해 그린다 (`PaperPreview`, 여백 설정값 미반영)
  - 프레임은 이후 "프레임 선택"(Step 6.5)에서 확정하므로, 여기선 대표 프레임·배경을 미리 씌우지 않고
    **흰 용지 + 회색 더미 슬롯**으로 사진이 채워질 위치만 보여준다(레이아웃 V3, `DUMMY_SLOT_GRADIENT`)
- 선택 시 `slotsNeeded` (슬롯 수) 결정

### Step 4: BACKGROUND SELECT

- **지점별 배경 뱅크**: 서비스 화면엔 관리자가 이 지점에 선택·정렬한 배경(type=1, 최대 6개)만 순서대로 표시
  (뱅크 모델 — 업로드는 공용 뱅크, 지점마다 `ImageDevice`로 노출 배경 선택·`sortOrder`로 순서 지정. §23·관리자 이미지 관리 참고)
  - `useDeviceSetup`은 `GET /api/device/[deviceId]/backgrounds`로 이 지점 선택분만 로드
- MP4/WebM 영상 배경 자동 재생 미리보기
- 그라디언트 폴백 지원 (6종) — 목록 로드 실패 시 재시도 후에도 실패하면 표시 (§20)
- **랜덤 자동 선택**: 페이지 진입 시 `selectedBackground`가 `null`이면 배경 풀에서 랜덤으로 하나를 자동 선택
  - DB 이미지 로드 전: fallback 그라디언트 중 랜덤 선택
  - DB 이미지 로드 후: DB 이미지 중 랜덤으로 교체 (fallback 선택 중이었을 경우에만)
  - 세션 리셋 후 재시작 시에도 재선택
- 배경 선택 단계 진입 시 자동 선택된 항목이 활성(체크마크) 표시됨
- 선택된 배경이 카메라 합성 및 서브 모니터 미리보기에 사용됨
- **배경별 동작 트리거 이펙트 영상**(선택): 관리자가 배경마다 이펙트 영상(mp4/webm)과 **트리거 제스처**를 지정할 수 있고, 촬영 화면에서 그 제스처(기본 V사인) 시 재생된다 (§26)

### Step 5: CAMERA CAPTURE (메인 루프)

- WebRTC `getUserMedia`로 카메라 스트림 획득 — **해상도는 관리자 설정 `CAMERA_RESOLUTION`**(가장 낮음 320×240 ~ 4K 2880×2160, 모두 4:3, 미설정 시 FHD). ideal 제약이라 카메라 미지원 시 가장 가까운 값으로 대체 (§11)
- 레이아웃(레이아웃 V3): 제목 · 카메라 프리뷰(4:3) · 배경 변경 패널 · 스티커 패널을 CSS Grid 영역으로 배치
  — 세로 화면은 프리뷰 아래 배경/스티커 2분할, 가로 화면은 배경·프리뷰·스티커 3열(컨테이너 실제 비율로 방향 판단)
- **배경 변경 패널**: 촬영 중 배경 즉시 변경 가능
  (`onBackgroundSelect` → flow의 `selectedBackground` 갱신 → 프리뷰·서브 모니터 실시간 반영,
  배경제거 `off` 모드에서는 숨김)
- 30fps 캔버스 렌더링 루프:
  1. 영상 프레임을 캔버스에 그리기
  2. 배경 제거 적용 (mediapipe / chromakey / chromakey-yuv / off)
  3. 스티커 오버레이
  4. 서브 모니터 동기화 (활성 시 `/api/camera-frame` POST)
  5. 카운트다운 타이머 표시
- **동작 트리거 이펙트 영상**: 현재 배경에 이펙트 영상이 설정돼 있으면 **배경별로 지정한 제스처**(기본 Victory) 시 프리뷰 위에 스크린 블렌드로 재생(지정 시간 or 영상 종료까지). 촬영 트리거(손바닥)와 별개 제스처 (§26)
- 자동 촬영 타이머는 `useAutoCaptureTimer` 훅으로 분리 — 배경 변경·스티커 적용 등 리렌더에도 리셋되지 않는다
- **촬영 시퀀스**:
  - 자동 타이머 경과, 사용자 클릭, 또는 **손바닥 제스처**(§26) 중 하나로 시작
  - 카운트다운 (`captureSeconds`초) — 매 초 비프음(Web Audio 합성), 촬영 순간 셔터음(`shutter.wav`) 재생 (`src/lib/sounds.ts`)
  - 캔버스 스냅샷 저장 (data URL)
  - 중간 프레임도 `intermediateFrames[photoIndex][]`에 저장
  - `slotsNeeded × captureCount`장 촬영 완료까지 반복

### Step 6: SELECT

- 촬영된 사진 그리드 표시 (촬영 원본 비율 그대로, 크롭 없음)
- **슬롯 지정 방식**(`src/lib/slotSelection.ts`): 프레임 미리보기의 슬롯을 탭해 active로 만들고 사진을 탭하면 그 슬롯에 배치. 슬롯을 안 골라도 **active가 순번대로 자동 이동**하며 채워진다. 슬롯이 다 차 있어도 active는 유지되어 다른 사진 탭 시 해당 슬롯 교체. **한 사진은 한 슬롯만**(다른 슬롯에 있던 사진은 이동). `selectedPhotos`는 슬롯 인덱스 배열(빈칸 -1)
- 사용자가 모든 슬롯을 채우면(정확히 `slotsNeeded`장) 진행 가능

### Step 6.5: PRINTBG (조건부)

- **인쇄 배경(프레임) 선택**: 이 지점에 인쇄 배경 이미지(imageType 2)가 있을 때만
  진입하는 단계 (`PrintBgSection`). 없으면 SELECT에서 곧장 COMPLETE로 넘어간다.
- `FramedPreview`로 선택 프레임 위에 실제 선택 사진을 슬롯 배치한 미리보기를 보여준다.
- 선택값은 `usePhotoFlow.selectedPrintBg`에 저장되어 COMPLETE 합성/인쇄에 쓰인다.
- 버튼(다음)과 유휴 타임아웃 모두 `handleSelectNext`로 동일하게 분기한다.

### Step 7: COMPLETE

1. 선택 사진 합성 이미지 생성 (`src/lib/printLayout.ts` 공용 레이아웃 계산 사용) — **모든 컷(1컷 포함) 동일 경로**로 프레임·슬롯 합성. 세로 용지 모드(2컷 등)는 프레임(인쇄 배경) 이미지를 **90° 회전**해 용지 방향에 맞춘다 (§13)
2. `POST /api/print/upload-image` → 24시간 만료 URL
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
| `PreflightSection.tsx` | 대기 화면 진입 전 시스템 점검 (서버/번들/설정/애셋/AI/카메라) |
| `StartSection.tsx` | 환영 화면 + 언어 선택 버튼 + 서브 모니터 설정 패널 |
| `PaymentSection.tsx` | 결제 UI (manual / PayApp Lite 폴링) |
| `FrameSection.tsx` | 프레임 레이아웃 선택 그리드 |
| `BackgroundSection.tsx` | 배경 이미지/영상 선택기 |
| `CameraSection.tsx` | 카메라 + AI 합성 + 스티커 + 촬영 로직 |
| `SelectSection.tsx` | 사진 선택 UI |
| `PrintBgSection.tsx` | 인쇄 배경(프레임) 선택 UI — printbg 단계. 인쇄 배경 이미지가 있을 때만 노출 |
| `CompleteSection.tsx` | 결과 출력 + QR + 인쇄 |
| `FramedPreview.tsx` | 선택 프레임 위에 사진 슬롯 배치 미리보기 (CompleteSection과 동일 배경 우선순위) |
| `SectionShell.tsx` | 서비스 화면 공통 3단 껍데기(타이틀·본문·다음 버튼) + `SectionTitle`. Background/Frame/PrintBg/Select가 사용. 타이틀 스타일을 한 곳에서 관리 |
| `ServiceNav.tsx` | 서비스 화면 공통 "다음" 버튼 (하단 중앙 절대배치, 촬영하기와 동일 크기 = `SERVICE_BIG_BUTTON_CLASS`) |
| `CircularTimer.tsx` | 원형 카운트다운 — frame·background·select·printbg는 유휴 타임아웃, complete는 인화 자동복귀 타이머로 표시 (start·payment·camera 제외) |
| `CameraStreamer.tsx` | 카메라 상시 웜업 + 서브 모니터 프레임 전송 (배경 합성 포함, §15) |
| `FloatingElements.tsx` | 배경 데코레이션 애니메이션 |
| `DebugContext.tsx` / `DebugOverlay.tsx` / `DebugGridOverlay.tsx` | 숨겨진 디버그 모드 — 토글·진단 패널·그리드 시각화 (§27) |

### 전역 컴포넌트 (`src/components/`)

| 파일 | 역할 |
|------|------|
| `FullscreenToggle.tsx` | F11 전체화면 토글 웹뷰 리스너 (전역 단축키 등록 실패 시 폴백) |
| `HomeShortcut.tsx` | `Ctrl+Shift+H` — 초기(모드 선택) 화면 복귀 단축키 |
| `camera/useHandGestureCapture.ts` | 손동작 인식(촬영·이펙트 트리거) + 손 위치 제공(배경제거 손 구제) |
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
| `useIdleTimer` | `src/hooks/useIdleTimer.ts` | 비활동 타임아웃 카운트다운 (frame·background·select·printbg 단계에서만 동작. complete는 별도 인화 자동복귀 타이머, start·payment·camera 제외) |
| `useTauriMonitor` | `src/hooks/useTauriMonitor.ts` | Tauri 모니터 목록 + 서브 윈도우 열기/닫기 |
| `useSceneSync` | `src/hooks/useSceneSync.ts` | SSE 프레임 스트림 + BroadcastChannel 상태 동기화 |
| `useAdminDeviceSettings` | `src/hooks/useAdminDeviceSettings.ts` | (관리자) 선택 지점 기준 설정 로드 + 변경 필드만 지점에 저장 (§20) |
| `useAutoCaptureTimer` | `src/hooks/useAutoCaptureTimer.ts` | 촬영 자동 카운트다운 타이머 — 촬영 콜백을 ref로 참조해 배경/스티커 변경 리렌더에도 리셋 안 됨 (§5 Step 5) |

### usePhotoFlow 상세

- **30+ 상태 항목** 관리 (step, selectedFrame, selectedBackground, photos, stickers, ...)
- `sessionStorage`에 **단계·선택값만** JSON 직렬화 저장 (키: `photobooth_session_v3`, 수 KB). 사진·중간프레임은 제외
- `advanceFromCurrentStep()` → 단계별 유효성 검사 후 다음 단계로 이동
- 최종 합성·업로드·GIF는 **완료 화면(`CompleteSection.createComposite`/`uploadForQR`)** 이 담당 — 1컷 포함 모든 컷 동일 경로(§5 Step 6·7)

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
| POST | `/api/device/[deviceId]/settings` | 디바이스 설정 업데이트 (지점별 오버라이드). 값 `null`이면 그 키의 지점 오버라이드를 삭제해 전역 설정(없으면 코드 기본값)을 따름 — 결제·촬영·타이머 설정 화면에서 칸을 비우고 저장할 때 사용 |
| GET · PUT | `/api/device/[deviceId]/backgrounds` | 이 지점 선택 배경(순서대로, 최대 6) 조회·교체 (`{ imageIds }`) — 뱅크 모델(§5 Step 4) |
| GET · PUT | `/api/device/[deviceId]/frames` | 이 지점 선택 프레임(순서대로) 조회·교체 — 뱅크 모델 |
| GET · PUT | `/api/device/[deviceId]/stickers` | 이 지점 선택 스티커(순서대로, 최대 20) 조회·교체 — 뱅크 모델(§14) |
| GET | `/api/setting` | 전역 설정 조회 (기본값/폴백) |
| POST | `/api/setting` | 전역 설정 업데이트 (값 `null`이면 해당 키 삭제) |
| GET | `/api/devices` | (공개) 초기 장치 선택용 활성 장치 목록 — 인증 없이 `deviceId`·`name`·`hasPassword`만 |
| POST | `/api/devices/[deviceId]/verify` | (공개) 실행 잠금 검증. `{ password }` → `{ok:true}`(미설정 or 일치) / `{ok:false, required:true}`(불일치) / `{ok:false, required:false}`(장치 없음). 해시는 미노출 (§23) |

### 이미지 & 배경

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/image/list/[imageType]` | 이미지 목록 (1=촬영 배경, 2=프레임/인쇄 배경, 3=스티커, 5=배경화면·화면별 배경·촬영 오버레이, 6=로고, 7=버튼). `?device_id=X` 필터, `&linked=1`=해당 지점 연결분만 |
| GET | `/api/images/url` | 이미지 베이스 URL (Supabase Storage) |
| POST | `/api/admin/images/upload` | 이미지 업로드 (최대 50MB) — 서버 경유 업로드. `deviceIds` 지점 연결은 테마 이미지(5·6·7)에만 적용, 배경·프레임·스티커는 무시(지점 노출은 노출 목록 API로만) |
| POST | `/api/admin/images/presign` | Supabase Storage 직접 업로드용 서명 URL 발급 (미설정 시 `{mode:"local"}` 폴백) |
| POST | `/api/admin/images/register` | presign 업로드 완료 후 DB 이미지 레코드 등록 (`deviceIds`는 upload와 동일 규칙) |
| PATCH | `/api/admin/images/[id]` | 이미지 메타데이터 수정 (이름·타입·초점·이펙트 등). 배경·프레임·스티커는 `deviceIds`를 무시(노출 순서 보존)하고, 타입을 바꾸면 기존 지점 노출 연결을 끊는다 |
| DELETE | `/api/admin/images/[id]` | 이미지 삭제 (연결된 이펙트 영상 파일도 함께 정리) |
| POST · DELETE | `/api/admin/images/[id]/effect` | 배경(type 1)의 동작 트리거 **이펙트 영상** 업로드/교체·제거 (mp4·webm, §26) |

### 관리자

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/admin/login` | 관리자 로그인 (iron-session 봉인 세션 쿠키 발급, §23) |
| POST | `/api/admin/logout` | 관리자 로그아웃 (세션 쿠키 삭제) |
| GET | `/api/admin/devices` | 디바이스 목록 |
| POST | `/api/admin/devices` | 디바이스 생성 — ID는 영문·숫자·`-`·`_` 1~64자, 이름 128자·설명 255자 이하 (`validateDeviceInput`) |
| GET | `/api/admin/devices/[id]` | 디바이스 상세 |
| PUT · DELETE | `/api/admin/devices/[id]` | 디바이스 수정(이름·설명·활성·실행 비밀번호) / 삭제 — 결제 내역이 있는 지점은 삭제 거부(409, 비활성화 안내), 설정 삭제와 지점 삭제는 한 트랜잭션 |
| POST | `/api/admin/devices/clone` | 디바이스 설정 복제 (지점 설정값만 — 노출 이미지·테마 이미지·비밀번호는 복사 안 함). ID 규칙은 생성과 동일 |
| GET | `/api/admin/image-types` | 이미지 타입 목록 (기본 3종 upsert 보장, §23) |
| GET | `/api/admin/accounts` | 관리자 계정 목록 |
| POST | `/api/admin/accounts` | 관리자 계정 생성 (아이디는 앞뒤 공백 제거 후 중복 검사, 비밀번호 8자 이상 — `src/lib/accountRules.ts`) |
| PATCH | `/api/admin/accounts/[id]` | 계정 수정 (`name` 또는 `isActive`(boolean)). 자기 계정 비활성화는 거부 |
| DELETE | `/api/admin/accounts/[id]` | 계정 삭제 |
| POST | `/api/admin/accounts/[id]/change-password` | 계정 비밀번호 변경 |
| GET | `/api/admin/payments` | 결제 내역 조회 (페이지네이션, `status` 필터, `deviceId`=장치 ID·지점명 부분 일치). 응답 `paidTotal`=조회 조건 전체의 결제완료 합계 |

### 결제

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/payments/request` | PayApp 결제 요청 생성 |
| GET | `/api/payments/status/[sessionId]` | 결제 상태 폴링 |
| POST | `/api/payments/feedback` | PayApp 서버 콜백 수신 |

### 사진 처리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/print/upload-image` | 합성 사진 업로드 (24시간 만료 URL) |
| GET | `/api/print/cleanup` | 만료(24시간 경과) 사진 정리 — Supabase·로컬 모두. `CRON_SECRET` 있으면 Bearer 인증 |
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
| password | String? | 실행 시 이 장치를 선택하려면 맞춰야 하는 **실행 잠금 비밀번호**(bcrypt 해시). null/빈값=잠금 없음 (§23) |

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

**`Image`** - 배경/프레임 이미지 (테이블 `pic_image`)

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| ~~deviceId~~ | String? | **deprecated** — 지점 지정은 `ImageDevice` 조인 테이블 사용, 더 이상 읽지 않음 |
| imageType | Int | 1=촬영 배경, 2=프레임(인쇄 배경), 3=스티커, 5=배경화면(테마), 6=로고, 7=버튼 |
| name | String | 표시 이름 (최대 32자) |
| filename | String | 파일명 |
| width | Int? | 이미지 너비 (px) |
| height | Int? | 이미지 높이 (px) |
| left / top / right / bottom | Int? | 크롭/여백 좌표 (선택) |
| priority | Int | 전역 정렬 순서(desc). 지점별 노출 순서는 `ImageDevice.sortOrder`(뱅크)를 쓰며, 관리자 UI의 순서 편집 기능은 제거됨 |
| active | Boolean | 활성 여부 — 서비스 화면엔 active=true만 노출. 배경(type 1)은 최대 6개까지만 활성 |
| focalX / focalY | Float? | 초점 좌표 (0~1, 기본 0.5). cover 배치 시 중심 |
| effectFilename | String? | **배경(type 1) 전용** — 동작(제스처) 트리거 시 촬영 화면에 반영되는 이펙트 영상 파일명. null=없음 (§26) |
| effectDuration | Int? | 이펙트 영상 최대 재생 시간(초). dissolve/chromakey에만 적용(transition은 제스처 토글이라 무시). null이면 기본값(4초) |
| effectGesture | String? | 이펙트를 발동시키는 제스처(MediaPipe 카테고리, 예: Victory). null이면 기본값(Victory). 관리자 배경 편집에서 select (§26) |
| effectMode | String? | 재생 모드: `dissolve`(블렌드 오버레이)·`transition`(배경 토글 전환)·`chromakey`(키색 제거 오버레이). null=dissolve |
| effectBlendMode | String? | dissolve 모드 블렌드 방식(CSS mix-blend-mode: screen/lighten/overlay/hard-light/multiply/normal). null=screen |
| effectTransition | String? | transition 모드 전환 효과(`fade` 크로스페이드 / `cut` 즉시). null=fade |
| effectTransitionMs | Int? | transition 모드 크로스페이드 지속 시간(ms, 0~3000). null=기본값(600) |
| effectChromaColor | String? | chromakey 모드 키 색상 "R,G,B". null=기본 "0,255,0" |
| effectChromaSimilarity | Int? | chromakey 모드 감도(1~100). null=기본 50 |
| effectChromaSmoothness | Int? | chromakey 모드 경계 부드러움(0~100). null=기본 50 |
| createdAt | DateTime | 생성 시각 |

**`ImageDevice`** - 이미지 ↔ 디바이스 다대다 (테이블 `pic_image_device`)

| 필드 | 타입 | 설명 |
|------|------|------|
| imageId | Int (PK) | Image 외래키 |
| deviceId | String (PK) | Device 외래키 |
| sortOrder | Int | 지점별 노출 순서 (배경 뱅크 모델, §5 Step 4) |

> 연결 행이 **없으면** "모든 디바이스"에 적용. 배경(imageType 1)에서는 이 연결이 곧
> "이 지점 서비스 화면에 노출할 배경 선택"을 의미하며 `sortOrder`로 순서를 관리한다.

**`ImageType`** - 이미지 카테고리

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 1=배경, 2=프레임, 3=스티커, 5=배경화면(wallpaper), 6=로고(logo) |
| name | String | 카테고리 이름 (background/image/sticker/wallpaper/logo) |

> 과거 `print_background`(id 4)는 프레임(id 2)으로 통합됨 — 클라이언트 인쇄 배경 = 프레임(type 2).
> 테마 배경화면은 id 4 잔재와 충돌을 피해 **id 5(wallpaper)** 를 사용한다 (§25).

**`AdminAccount`** - 관리자 계정

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| username | String | 사용자명 (unique) |
| password | String | bcrypt 해시 |
| name | String? | 표시 이름 (선택) |
| isActive | Boolean | 활성 여부 |

**`PayappPayment`** - 결제 내역

| 필드 | 타입 | 설명 |
|------|------|------|
| id | Int (PK) | 자동 증가 |
| orderId | String | 주문 ID (unique) |
| deviceId | String | 기기 ID |
| amount | Int | 결제 금액 (원) |
| goodname | String | 상품명 |
| status | String | pending / paid / refunded |
| payState | String? | PayApp pay_state 코드 |
| mulNo | String? | PayApp 거래번호 |
| userid | String? | PayApp 판매자 ID (교차검증용) |
| var1 / var2 | String? | PayApp 커스텀 필드 (var1=orderId 회신용) |
| rawPayload | String? | PayApp 원시 콜백 JSON |
| paidAt | DateTime? | 결제 완료 시각 |
| cancelledAt | DateTime? | 취소 시각 |
| createdAt | DateTime | 생성 시각 |
| updatedAt | DateTime | 수정 시각 |

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
| `print_image(printer_name, image_data, copies)` | `Result<bool, String>` | base64 JPEG 출력 (.NET PrintDocument). `copies`(1~99, 기본 1)만큼 인쇄 — 결제 화면 선택 매수 |
| `mediapipe_is_installed` | `bool` | 필수 파일 **전체**(wasm 6개 + 모델 2개: 세그멘터·제스처)의 완전성 검사 (디버그 모드: 항상 true) |
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
8. 전역 단축키 등록 — `F11`(전체화면 토글), `Ctrl+Alt+F4`(서브 모니터 창 강제 종료).
   등록에 실패해도 앱 시작은 계속된다 (F11은 웹뷰 리스너가 폴백)

### 종료 동작

- **메인 창**(`main`)이 파괴될 때만 Node 자식 프로세스를 종료한다.
  서브 모니터 창(`camera-output`)을 닫거나 재생성해도 서버는 유지된다
  (`should_shutdown_server_on_destroy`, 단위 테스트 포함).
- 메인 창이 **닫힘 요청**(Alt+F4 등)을 받으면, 종료를 막지 않고 서브 모니터
  창(`camera-output`)도 함께 닫는다 → Alt+F4 한 번에 두 창이 모두 닫히고 앱이
  깔끔히 종료된다. (닫지 않으면 서브 창만 남아 앱이 종료되지 않는 좀비 상태가
  되는 것을 방지 — `should_close_subwindows_with`, `WindowEvent::CloseRequested`, 단위 테스트 포함.)

### 키보드 단축키

| 단축키 | 동작 | 구현 위치 |
|--------|------|---------|
| `F11` | 전체화면 ↔ 창 모드 토글 | 1차: Rust 전역 단축키 (`toggle_fullscreen`, lib.rs) / 폴백: `src/components/FullscreenToggle.tsx` (전역 레이아웃에 마운트) |
| `Ctrl+Alt+F4` | 서브 모니터 창(`camera-output`) 강제 종료 + 메인 창 복귀(show·focus) | Rust 전역 단축키 (lib.rs `with_handler`, `shortcut.key`로 F11과 분기) |
| `Ctrl+Shift+H` | **초기(모드 선택) 화면으로 복귀** — 서비스·관리자 화면 어디서든 | `src/components/HomeShortcut.tsx` (전역 레이아웃에 마운트) |

- 창은 borderless 1920×1080 전체화면으로 시작하므로, 창 모드 전환 시
  **테두리 복원 + 1280×800 축소 + 화면 중앙 배치**로 토글이 시각적으로 구분되게 한다
- 전체화면 복귀 시 테두리 제거 후 `setFullscreen(true)`
- 두 구현(Rust/웹뷰)은 동일한 동작을 수행하며, 전역 단축키가 등록되면
  OS가 키를 소비하므로 웹뷰 리스너는 실행되지 않는다 (이중 토글 없음)
- 브라우저 직접 실행: 동작 없음 (Tauri API 미존재)
- `Ctrl+Shift+H`는 실행 파일에서 한 번 고른 모드(서비스/관리자)를 **앱 재시작 없이 바꾸는
  탈출구**다. SPA 이동이 아니라 전체 새로고침(`location.assign("/")`)이라 촬영 중이던
  카메라 스트림·MediaPipe 리소스가 확실히 해제된다. 키보드가 없는 키오스크를 위해
  **서비스 대기 화면의 운영자 패널(⚙ 출력 설정)** 안에 같은 동작의 버튼을 두었고,
  관리자 화면은 기존 사이드바 **초기화면** 버튼이 같은 경로다.
- `Ctrl+Alt+F4`는 서브 모니터 창이 잘못된(메인) 모니터에 `always_on_top`·전체화면으로
  떠 화면을 덮어 Alt+Tab조차 안 먹는 상황의 **탈출구**다. 전역(OS) 단축키라 어떤 창이
  위에 있든 발동하며, 메인 창 웹뷰 keydown으로는 (메인이 포커스를 잃어) 이 상황을 못 벗어난다.
  등록 조합이 `Ctrl+Alt+F4`뿐이라 평범한 `Alt+F4`(앱 종료)와 충돌하지 않는다.

---

## 11. 카메라 시스템

### 카메라 접근

```typescript
navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
```

- **촬영 해상도**는 관리자 설정 `CAMERA_RESOLUTION`(§20) 티어로 결정 — `low`/`sd`/`hd`/`fhd`/`uhd`(4K), 모두 4:3(인화 슬롯 4:3과 맞춰 좌우 잘림 방지). `ideal` 제약이라 카메라가 미지원하면 가장 가까운 값으로 대체. 상수: `src/constants/camera.ts`(`CAMERA_RESOLUTIONS`).
- 서브 모니터 미러(`CameraStreamer`)는 성능을 위해 별도 저해상도(960×720) 유지.

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
배경 제거 적용 (mediapipe / chromakey / chromakey-yuv / off)
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

> 튜닝 근거·한계·개선 이력은 **`docs/CAMERA_QUALITY.md`**에 있다. 여기엔 "무엇이 있는지"만 적는다.

**모델** (2종, 디버그 토글로 전환 — §27)

- **정밀 `selfie_multiclass_256x256.tflite`**(16MB, 6클래스) — **기본값**. `confidenceMasks[0]` =
  **배경** 확신도 → 전경 = `1 - masks[0]`.
- **경량 `selfie_segmenter.tflite`**(249KB) — 추론은 빠르지만 배경 품질이 떨어져 실사용 부적합(실측).
  `confidenceMasks[0]` = **전경** 확신도.
- 두 모델은 **전경 극성이 반대**라 모델과 극성을 함께 전환한다
  (`localStorage:photobooth_seg_model`, 기본 `multiclass`).
- 둘 다 입력을 **256×256으로 고정 축소**해 추론한다 — 바깥에서 해상도를 올려도 내부에서 다시
  줄이므로 소용없고, 이것이 경계 품질의 상한이다(경계 계단의 근본 원인).
- WASM: `vision_wasm_internal.js` + `.wasm` (SIMD / non-SIMD 자동 선택)

**마스크 생성** — `src/lib/segmentMask.ts`. 촬영(`useCameraCapture`)·송출(`CameraStreamer`)·관리자
미리보기(`usePreviewCamera`) 세 경로가 이 코드를 공유하므로 설정 조정이 세 곳에 똑같이 반영된다.

1. **ROI 크롭 추론** — 직전 마스크의 전경 bbox 주변만 잘라 넣어 256 격자가 덮는 면적을 줄인다
   (= 경계 계단 폭 축소). 정사각/프레임비율로 맞추지 않고 변마다 여유를 붙여 자르므로, 인물이
   세로를 채우는 부스 구도에서 위아래는 끝까지 가고 **좌우만 좁아진다**. 이득이 없거나 설정을
   끄면 프레임 전체로 추론.
2. **알파 변환** — `softAlpha = clamp((fgConf - THRESH) / FEATHER, 0, 1)`
3. **공간 블러** — 256 격자 계단 제거. 블러는 캔버스 바깥을 투명으로 보므로, 어깨처럼 화면 끝에
   닿은 부위에 반투명 띠가 생기지 않도록 가장자리 1px을 복제(edge clamp)한 뒤 블러한다.
4. **경계 두께 + 시간축 평활** — 블러 뒤 알파에 픽셀 패스 한 번(추론마다 1회, 매 프레임 아님).
   두께는 `a^g` 감마 곡선 — 알파를 평행이동시키면 실루엣 **내부**까지 반투명해진다.
   평활은 직전 마스크와의 선형 보간이며, 되먹이는 값은 **두께 보정 전** 알파다(누적 방지).

**손 구제** — 위 2단계(알파 변환)에서 **손 주변 사각형 안에서만 컷오프를 낮춘다.** 손끝은 모델
확신도가 원래 가장 낮은 곳이라 임계값에 가장 먼저 잘려나가는데(V포즈에서 손가락 하나가 통째로
사라지는 현상), 임계값은 마스크 전체 일괄 적용이라 "손가락만" 살릴 방법이 없었다.
손 위치는 **이미 돌고 있는 제스처 인식기의 부산물**이다 — `GestureRecognizer`가 제스처와 함께
돌려주는 랜드마크 21점을 지금까지 버리고 있었으므로 **추가 추론 비용이 0**이다.
알파를 **올리기만** 하고(기존 실루엣을 깎지 않는다), 영역 경계에서는 원래 임계값으로 부드럽게
되돌아간다(네모난 자국 방지). 손이 안 잡히면 아무 일도 하지 않는다.

> 손 위치를 아는 경로에서만 동작한다 — 촬영 화면은 `useHandGestureCapture`의 부산물을, 관리자
> 미리보기는 랜드마크 전용 인식기를 따로 띄워 쓴다. **서브 모니터(`CameraStreamer`)는 제스처
> 인식기가 없어 구제가 적용되지 않는다**(카메라 단계가 아닌 화면이라 손동작을 쓸 일도 없다).

마스크 캔버스는 ROI 유무와 무관하게 항상 프레임 전체를 덮으므로, 소비하는 쪽(프리뷰
`destination-in`, `captureHiRes`)은 크롭을 몰라도 된다.

**설정 8종** — 전부 관리자 촬영 설정(§23)에서 조정하며 미리보기에서 실시간 확인 가능.

| 키 | 기본 | 뜻 |
|---|:---:|---|
| `CAPTURE_THRESHOLD` | 15 | THRESH(%). **확신도 기준** 전경 컷오프. 낮추면 손끝 유지↑·헤일로↑ |
| `CAPTURE_SMOOTHNESS` | 35 | FEATHER(%). 반투명 전환대 폭. 넓히면 고스팅↑ |
| `CAPTURE_MASK_BLUR` | 100 | 공간 블러 세기(0~200%). 격자 계단 제거. 0이면 끔 |
| `CAPTURE_EDGE_SHIFT` | 0 | **거리 기준** 경계 두께(-100~100). −면 침식, +면 팽창 |
| `CAPTURE_TEMPORAL` | 0 | 시간축 평활(0~100%). 경계 떨림↓·잔상↑ |
| `CAPTURE_ROI` | on | 인물 추적 크롭 |
| `CAPTURE_ROI_MARGIN` | 22 | 크롭 여유(0~100%). 좁힐수록 해상도↑·놓칠 위험↑ |
| `CAPTURE_HAND_RESCUE` | 50 | 손 구제(0~100%). 손 주변만 컷오프를 낮춰 손끝 잘림 방지 |
| `CAPTURE_PROCESS_SCALE` | auto | 처리 해상도(자동/100/50/25%). 자동은 4K에서만 25% |

> `THRESHOLD`와 `EDGE_SHIFT`는 둘 다 경계를 안팎으로 옮기지만 기준이 다르다 — 전자는 모델
> **확신도**를 자르는 지점이라 확신이 낮은 곳(손끝·머리카락)부터 사라지고, 후자는 **실제 거리**라
> 실루엣 전체에 고르게 작용한다. 손끝을 살리려면 THRESHOLD↓, 그때 생긴 테두리는 EDGE_SHIFT(−)로.

**추론 델리게이트(CPU/GPU)**: 세그멘터 생성 시 `baseOptions.delegate`로 선택. **기본 `GPU`(WebGL)**.
촬영 화면은 디버그 토글로 전환할 수 있고(§27) 값은 `localStorage:photobooth_seg_delegate`에
저장된다(명시적으로 `cpu`를 저장한 경우에만 CPU). 토글 변경 시 세그멘터가 자동 재생성된다.
관리자 미리보기도 GPU를 명시한다. **서브 모니터(`CameraStreamer.tsx`)만 아직 별도 세그멘터라
델리게이트 미지정 = CPU 고정.**

**성능: 메인 스레드(기본) ↔ Web Worker(디버그 토글)**. 기본은 메인 스레드에서 추론하고 스로틀
간격마다 마스크를 굽는다(그 사이 프레임은 직전 마스크를 GPU 합성으로 재사용, 표시 루프는 최대
60fps). 스로틀 간격은 디버그 패널에서 **10·20·50·100·150·200ms 중 선택**(기본 50,
`localStorage:photobooth_seg_interval`) — 낮출수록 잔상↓·메인 스레드 부하↑. 워커 경로에선 무시.

- **Web Worker 경로**(디버그 토글 ON, `localStorage:photobooth_seg_worker=on`,
  `src/workers/segmenter.worker.ts`): 무거운 `segmentForVideo` + 마스크
  readback(`getAsFloat32Array`)을 워커에서 돌려 표시 루프가 절대 안 막히게 한다. GPU
  델리게이트에서도 readback이 프레임당 ~90ms라 메인에서 매 프레임 돌리면 FPS가 10 안팎으로
  떨어지기 때문(측정). 워커로 옮기면 표시는 부드럽지만 마스크 갱신은 워커 왕복 속도로 제한돼
  움직일 때 경계가 영상보다 뒤처지는 desync가 보일 수 있다 — 그래서 **기본은 off**.
  - 흐름: 메인 → 워커로 프레임(`ImageBitmap`, ROI면 크롭)을 전송(워커 idle일 때만, busy 플래그로
    큐 적체 방지) → 워커가 알파 마스크 + 전경 bbox 반환 → 메인이 굽기(블러·두께·평활)를 마쳐
    `maskCanvasRef`에 두고 매 프레임 `destination-in`으로 합성(표시·촬영 캡처 공유).
    워커는 크롭을 해석하지 않고 받은 `roi`를 그대로 되돌려준다 — 왕복 중 ROI가 바뀌어도 어긋나지 않는다.
  - 워커 생성/초기화 실패(예: WebView2에서 워커 WebGL 미지원) 시 **메인 스레드로 자동 폴백**.
- 처리 해상도는 `CAPTURE_PROCESS_SCALE`을 따른다(기본 자동 = 원본의 절반, 4K는 1/4). 최종
  표시/캡처는 원본 해상도로 업스케일된다.
- 서브 모니터는 아직 **별도 메인 스레드 세그멘터**(200ms 고정 스로틀)를 쓴다 — 워커 분리는 촬영
  화면에만 적용된다. 마스크 굽기 코드는 공유하므로 화질 설정은 동일하게 반영된다.

### Chromakey (`bgRemovalMode: "chromakey"`)

- 설정(관리자 촬영 설정 페이지·미리보기에서 조정):
  - `CHROMAKEY_RGB`(키 색상, 기본 "0,255,0")
  - `CHROMAKEY_SIMILARITY`(감도, 1-100, 기본 50) · `CHROMAKEY_SMOOTHNESS`(경계 부드러움, 0-100, 기본 50)
  - `CHROMAKEY_SPILL`(스필 제거, 0-100, 기본 0) · `CHROMAKEY_CHOKE`(경계 침식, 0-100, 기본 0) · `CHROMAKEY_LUMA`(밝기 무시 키잉, on/off, 기본 off)
- 키잉 로직은 **공용 `src/lib/chromakey.applyChromaKey`**로 통합 — 촬영 프리뷰·고해상도 캡처·관리자 미리보기가 동일 픽셀 처리를 공유
  - **채널 우세도(chroma difference) 판정**: 키 색의 우세 채널(그린스크린=G, 블루스크린=B)이 나머지 두 채널의 최댓값보다 얼마나 큰지(`diff = dom - max(other1, other2)`)만 본다. RGB 유클리드 거리로 판정하면 카키색 옷이나 그늘진 피부처럼 "우연히 키 색과 가까운" 색까지 같은 반경에 들어와 함께 지워지지만, 채널 우세도는 방향성이 있어 실제 그린/블루스크린만 강하게 반응한다
  - **임계값**: `HARD = 255×(1 - 감도/100)`(`diff`가 이 값 이상이면 완전 투명), `band = (부드러움/100)×150`, `SOFT = HARD - band`(그 사이 부드럽게 페이드). 부드러움 0 → 경계 없이 딱 잘림
  - **밝기 무시 키잉**(`CHROMAKEY_LUMA=on`): 픽셀 밝기를 키 색 밝기에 맞춰 정규화한 뒤 채널 우세도를 다시 재, 그늘지거나 밝게 반사된 같은 색(불균일 조명 그린스크린)도 한 감도로 함께 제거
  - **스필 제거**(`CHROMAKEY_SPILL`): 남은 인물 픽셀에서 키 색 우세 채널(그린=G, 블루=B)을 나머지 두 채널 최댓값으로 눌러 테두리 초록/파랑 번짐 제거
  - **경계 침식**(`CHROMAKEY_CHOKE`): 알파 마스크를 분리형 min 필터로 안쪽으로 깎아 가장자리 프린지 제거(반경은 이미지 폭에 비례)
  - spill·choke=0, luma=off면 감도/부드러움만 쓰던 기존 동작과 픽셀 단위로 동일

### Chromakey — OBS 방식 (`bgRemovalMode: "chromakey-yuv"`)

- 위 채널 우세도 방식과 **완전히 독립된 별도 알고리즘·별도 설정 키 세트**(`CHROMAKEY_YUV_*`). 이 모드를 추가해도 기존 `chromakey` 모드 선택 시 동작에는 전혀 영향 없음
- 로직은 **신규 파일 `src/lib/chromakeyYuv.applyChromaKeyYuv`**(`chromakey.ts`는 수정하지 않음) — OBS 등 방송 소프트웨어의 크로마키 필터(유사성/매끄러움/스필 제거 + 투명도/대비/명암/감마)와 비슷한 조작감을 제공하는 자체 구현이며, 바이트 단위 재현이 아니다(OBS 소스 비공개)
- 설정(관리자 촬영 설정 페이지·미리보기에서 조정):
  - `CHROMAKEY_YUV_RGB`(키 색상, 기본 "0,255,0")
  - `CHROMAKEY_YUV_SIMILARITY`(감도, 1-100, 기본 30) · `CHROMAKEY_YUV_SMOOTHNESS`(경계 부드러움, 0-100, 기본 10)
    - 기본값이 `chromakey` 모드(50/50)보다 낮은 이유: 판정 단위가 UV 거리라 초록 키에서 무채색까지의 거리가 **약 136**뿐이다. 감도 50/부드러움 50이면 페더 구간이 100~200이 되어 피부(147)·머리(141)·무채색(136)이 전부 페더에 걸려 인물이 alpha 90~120의 반투명으로 찍힌다. 기본값 30/10은 완전제거 ≤60, 페더 60~80으로 실제 그린스크린 변이(그늘 ~36, 짙은 그늘 ~52)를 덮으면서 무채색까지 56의 여유를 남긴다
    - 같은 이유로 감도를 **68 이상**으로 올리면 무채색·피부까지 threshold 안에 들어와 화면 전체가 지워진다
  - `CHROMAKEY_YUV_SPILL`(스필 제거, 0-100, 기본 0) · `CHROMAKEY_YUV_OPACITY`(결과 전체 투명도 배율, 0-100, 기본 100)
  - `CHROMAKEY_YUV_CONTRAST` · `CHROMAKEY_YUV_BRIGHTNESS` · `CHROMAKEY_YUV_GAMMA`(대비/명암/감마, -100~100, 기본 0)
- **판정 방식**: RGB를 BT.601 YUV로 변환해 **색차(U,V)만 비교**하고 밝기(Y)는 무시한다 — 그늘지거나 밝게 반사된 같은 키 색도 한 감도로 함께 잡힌다(`chromakey` 모드의 `CHROMAKEY_LUMA=on`과 비슷한 효과가 기본 내장돼 있으며, 이 모드엔 별도 토글이 없다)
  - `dist` = 픽셀·키 색의 UV 유클리드 거리. `threshold = (감도/100)×200`, `band = (부드러움/100)×200`. `dist ≤ threshold` → 완전 투명, `threshold < dist < threshold+band` → 선형 페이드, 그 이상은 원본 alpha 유지
- **스필 제거**: 남은(alpha>0) 픽셀의 UV 벡터를 키 색 방향으로 투영해, 그 성분만 `스필/100` 비율로 원점 쪽으로 당긴 뒤 RGB로 역변환(밝기 Y는 그대로 유지) — 초록/파랑 번짐만 줄고 밝기는 바뀌지 않는다
- **색보정**(결과 프레임 전체에 적용, 0=변화 없음): 표준 대비 보정 계수(`(259×(c+255))/(255×(259-c))`, `c`는 대비값을 -255~255로 사상), 가산 밝기(`brightness/100×127`), 감마 커브(`255×(c/255)^(2^(-감마/100))`)를 RGB에 순서대로 적용한 뒤, 계산된 alpha에 `투명도/100`을 최종으로 곱한다
- 경계 침식(choke)·밝기 무시 토글은 이 모드에 없음 — OBS 필터 UI에도 없는 옵션이라 1:1 대응이 없으며, 필요해지면 추후 추가

### 없음 (`bgRemovalMode: "off"`)

- 배경 제거 없이 영상 그대로 표시

### 관리자 미리보기 (`BackgroundRemovalPreviewDialog`)

- 관리자 촬영 설정 페이지의 "카메라로 미리보기" 버튼으로 실행. 카메라를 켜서 현재
  `CHROMAKEY_MODE`에 맞는 처리(AI·크로마키·크로마키 OBS 방식 3종)를 실시간으로 보여주며, 다이얼로그 내
  컬러피커·슬라이더와 모드별 컨트롤(크로마키: 감도·부드러움·**스필 제거·경계 침식**·**밝기 무시 키잉 토글** /
  크로마키 OBS 방식: 감도·부드러움·스필 제거·**투명도·대비·명암·감마**)로 값을 조정하면 미리보기와
  뒤쪽 설정 폼에 동시 반영되어 바로 저장 가능
- 제거되는 영역은 체커보드 패턴으로 표시
- **크로마키 스포이드**: "스포이드" 버튼 → 미리보기 클릭 지점의 **원본 카메라 색**을 현재 모드의 키
  색상(`CHROMAKEY_RGB` 또는 `CHROMAKEY_YUV_RGB`)으로 추출(표시 미러 보정, 제거된 영역을 찍어도 원본 색). 한 번 추출 후 자동 해제
- 크로마키 키잉은 `CameraSection.tsx`와 동일한 공용 함수(`lib/chromakey.applyChromaKey` 또는
  OBS 방식은 `lib/chromakeyYuv.applyChromaKeyYuv`)를 재사용해 실제 서비스 화면과 결과가 일치함

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
- **사진 배치는 cover(슬롯 비율에 맞춰 center-crop)** — 사진의 보이는 비율 = 슬롯 비율(`MODE_{ID}_WIDTH:HEIGHT`). 슬롯이 4:3이 아니면 4:3 카메라 사진이 상하/좌우로 잘린다
- **프레임 업로드 시 자동 가로화**: 세로(높이>너비, EXIF 회전 반영) 프레임 이미지는 시계방향 90° 회전해
  가로로 저장한다(`src/lib/frameOrientation.ts`, PNG는 PNG·JPG는 quality 95). 두 업로드 경로 모두 적용 —
  서버 경유 `POST /api/admin/images/upload`는 저장 전에, 브라우저 직접 업로드(presign → Storage PUT →
  `POST /api/admin/images/register`)는 register 단계에서 Storage 파일을 내려받아 회전 후 같은 파일명으로 덮어쓴다.
  이미 올라가 있는 세로 프레임은 재업로드해야 적용된다
- **프레임(인쇄 배경) 이미지 회전**: 프레임 디자인은 가로 기준이며, 세로 용지 모드(`orientation:"portrait"` — 2x1·2x4·4x1)에서는 합성·미리보기(`FramedPreview`) 모두 프레임 이미지를 **90° 회전**해 용지 방향에 맞춘다(슬롯 좌표는 이미 용지 방향 기준이라 프레임 이미지만 회전)

### 중간 프레임 (Intermediate Frames)

- 촬영 카운트다운 중 **~180ms 간격**으로 중간 프레임을 `intermediateFrames[photoIndex][]`에 저장
  (GIF 재생 10fps와 매칭, 800px 다운스케일 JPEG, 최근 24장만 유지 — 메모리·파일 크기 제한)
- `CompleteSection`에서 `/api/gif/create-layout` 호출 시 사용
- GIF 애니메이션: 촬영 과정이 자연스럽게 보임 (10fps, 24프레임 시 ~2.4초 루프)

---

## 14. 스티커 시스템

### 스티커 소스 — 지점별 이미지 뱅크

- 스티커는 **업로드 이미지**(ImageType `id 3`, **PNG·JPG만**)이며, 배경·프레임과 동일한
  **뱅크 UI**로 관리한다. 관리자 이미지 관리에서 지점별로 노출할 스티커를 선택
  (`ImageDevice` + `sortOrder`)하면, 촬영 화면 우측 패널에 그 지점 스티커 썸네일이 나열된다.
- 촬영 화면은 `/api/device/[deviceId]/stickers/`로 **선택·정렬된 목록**을 로드
  (`MAX_ACTIVE_STICKERS`=20). 이모지 스티커는 지원하지 않는다(이미지 스티커만).

### 데이터 구조

```typescript
interface Sticker {
  id: string;
  src: string;     // 스티커 이미지 URL (뱅크에서 추가)
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
| 우측 패널 썸네일 탭 | 스티커 추가 |

---

## 15. 서브 모니터 스트리밍

### 아키텍처

```
[카메라 단계 외 모든 스텝 (대기 화면 포함)]
CameraStreamer (헤드리스, 메인 윈도우) — 항상 마운트
    ↓ enabled=true: 앱 진입 즉시 getUserMedia로 카메라 상시 점유 (웜업)
    ↓ sendFrames=syncEnabled: 서브 모니터 출력이 켜진 경우에만
    ↓   배경 합성 후 JPEG (chromakey / chromakey-yuv / mediapipe / raw)
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
| `"chromakey-yuv"` | 없음 | 원본 카메라 |
| `"chromakey-yuv"` | 있음 | 크로마키(OBS 방식) 배경 제거 + 선택 배경 합성 |
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

- 닫는 경로: (1) 동기화 OFF 토글 → `close_camera_window`, (2) 메인 창 닫힘(Alt+F4) 시
  동반 종료(§10 종료 동작), (3) `Ctrl+Alt+F4` 전역 단축키(§10 키보드 단축키).
  이 창은 `decorations(false)`라 자체 닫기 UI가 없고 포커스도 받지 않으므로, 위 세 경로로만 닫힌다.

---

## 16. 인쇄 시스템

### 디지털 공유 (`/api/print/upload-image`)

- 입력: base64 JPEG
- 파일명: `{YYYYMMDD}_{UUID8}.jpg`
- 저장 순서:
  1. Supabase Storage `pic-prints` 버킷 (우선)
  2. 로컬 `/static/prints/` (폴백)
- 반환: URL + 24시간(1일) 만료 날짜

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
   - `PrinterSettings.Copies = copies` — 결제 화면 선택 매수만큼 출력
   - .NET 프린터 API 호출
3. 임시 파일 정리

> 브라우저 폴백(비 Tauri)에서는 무음 인쇄 환경에서 `window.print()`를 매수만큼 반복 호출한다.

---

## 17. 결제 시스템 (PayApp)

> 결제 금액은 **`PAYMENT_AMOUNT`(1장당 가격) × 결제 화면에서 고른 매수(1/2/4장 고정)**로 계산된다(§5 Step 2).
> 선택 매수는 인화 단계에서 실제 출력 매수로 쓰인다(§16). `PAYMENT_AMOUNT`는 지점별로 다르게 설정 가능(§20).

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

### 결제 연동 설정

관리자 **결제 설정**(`/admin/payment`)의 PayApp 연동 항목으로 지점별 설정한다. `POST /api/payments/request`는
**지점 설정(DeviceSetting) → 전역 설정(Setting) → 환경변수** 순으로 값을 찾는다(`src/lib/payapp.ts`).
같은 이름의 환경변수는 관리자에서 비워 둔 항목의 기본값이다.

```
PAYAPP_USERID          # PayApp 판매자 ID
PAYAPP_GOODNAME        # 상품명 (기본 "AR-pic 촬영")
PAYAPP_RECVPHONE       # 수신 전화번호
PAYAPP_FEEDBACK_URL    # 콜백 URL (/api/payments/feedback)
PAYAPP_RETURN_URL      # 결제 완료 후 리다이렉트 URL
PAYAPP_OPENPAYTYPE     # 결제 수단 제한(콤마 구분, 예: card,kakaopay). 비우면 전체
```

- `PAYAPP_*` 설정은 인증 없이 열린 설정 조회 API(`/api/setting`, `/api/device/[id]/settings`)에서 **관리자 세션일 때만** 내려간다.
- 피드백 위변조 검증용 `PAYAPP_LINKKEY`/`PAYAPP_LINKVAL`은 비밀값이라 **환경변수 전용**이다.
- 피드백의 `userid`는 결제요청 때 실제로 사용해 저장한 판매자 ID(`payment.userid`)와 비교한다(지점별 판매자 ID 지원).
- 상점명(shopname)은 PayApp JS 결제창 전용 파라미터라 REST 결제요청에 쓰이지 않아 설정 항목이 없다.

---

## 18. MediaPipe 다운로드 및 캐시

### 다운로드 파일 목록 (v0.10.35, 총 8개)

| 파일 | 출처 | 크기(약) |
|------|------|---------|
| `wasm/vision_wasm_internal.js` | jsDelivr | ~800KB |
| `wasm/vision_wasm_internal.wasm` | jsDelivr | ~7MB |
| `wasm/vision_wasm_module_internal.js` | jsDelivr | ~800KB |
| `wasm/vision_wasm_module_internal.wasm` | jsDelivr | ~7MB |
| `wasm/vision_wasm_nosimd_internal.js` | jsDelivr | ~800KB |
| `wasm/vision_wasm_nosimd_internal.wasm` | jsDelivr | ~7MB |
| `model/selfie_multiclass_256x256.tflite` | Google Storage | ~20MB |
| `model/gesture_recognizer.task` | Google Storage | ~8MB (손바닥 촬영, §26) |

### 캐시 전략

```
앱 최초 실행
    ↓ mediapipe_is_installed() → false
    ↓ MediapipeLoader.tsx: 다운로드 UI 표시
    ↓ download_mediapipe() Rust 명령어
    ↓ 8개 파일 순차 다운로드 (파일별 {이름}.download 임시 파일 → 성공 시 rename)
    ↓ %LOCALAPPDATA%\ar-pic\mediapipe\ 에 저장
    ↓ server\ 디렉토리에 복사
    ↓ 임베디드 Node 서버(node.exe) 재시작 후 포트 응답 대기

이후 실행
    ↓ prepare_server_dir(): server\ 쪽 파일이 불완전하면 캐시에서 재복사
    ↓ mediapipe_is_installed() → 필수 8개 파일 전체 존재 시에만 true
    ↓ 다운로드 UI 스킵
```

**서버 재시작이 필요한 이유**: Next.js 서버는 기동 시점에 `public/` 디렉터리 목록을
메모리에 캐시해두고 이후 요청을 그 목록으로만 판별한다 (`node_modules/next/dist/server/lib/router-utils/filesystem.js`의
`setupFsCheck`). 최초 실행 시 서버가 이미 mediapipe 파일 없이 기동된 상태에서 다운로드가
끝나 파일만 디스크에 추가해봤자, 이미 떠 있는 서버 프로세스는 그 파일의 존재를 영영 인식하지
못해 404를 반환한다 — 실제로 이 때문에 "AI 배경제거 모델" 사전 점검 항목이 앱을 껐다 켜기
전까지 계속 경고로 남는 버그가 있었다. `download_mediapipe`가 파일 복사 직후 Node 서버를
직접 kill 후 재기동해 이 문제를 해결한다 (`src-tauri/src/lib.rs`의 `spawn_node_server`/`wait_for_server_port`).

**부분 다운로드 복구**: 다운로드가 중간에 중단되어도 (1) 임시 파일 rename
방식이라 불완전한 파일이 최종 경로에 남지 않고, (2) 설치 검사가 전체 파일
기준이라 다음 실행 시 다운로드 UI가 다시 표시되어 이어받는다
(`download_file`은 이미 존재하는 파일을 스킵).

**디버그 모드**: `mediapipe_is_installed()` 항상 `true` 반환 (다운로드 스킵)

---

## 19. 오프라인 지원 (Service Worker / PWA)

> ⚠️ 이 서비스워커는 **배포(HTTPS) 호스트에서만** 동작한다. Tauri 키오스크(localhost)에서는
> `layout.tsx`가 SW를 등록 해제하므로, SW의 오프라인 캐시는 사실상 **웹 배포본 전용**이다.

### 캐시 전략 (`public/sw.js`, `v3`)

| 리소스 유형 | 전략 | 캐시 이름 |
|------------|------|---------|
| HTML 네비게이션·RSC, 일반 API 응답 | **네트워크-first → 오프라인 시 캐시 폴백** | `arpic-dynamic-v3` |
| 불변 빌드 애셋 (`/_next/static/*`, `/static/mediapipe/*`) | Cache-first | `arpic-static-v3` |
| `/admin`, `/api/admin/*`, `/api/payments/*` | **네트워크 전용 (SW 미개입, 캐시 금지)** | — |

- **페이지를 네트워크-first로 서빙**한다: 온라인이면 항상 최신 번들/화면을 받아 재배포 후
  stale 화면·인증 깨짐이 발생하지 않는다. (과거 cache-first가 옛 번들·리다이렉트된 페이지를
  서빙해 관리자 로그인 후 무한 깜빡임을 유발한 버그를 근본 해결)
- **인증/결제 경로는 SW가 개입하지 않는다** — 캐시된 로그인/리다이렉트 응답이 남지 않는다.
- 리다이렉트된 응답·비정상 응답·비GET·타출처 요청은 캐시하지 않는다.

### 사전 캐시 항목

인증 불필요 페이지만 오프라인 폴백용으로 담는다: `/`, `/service`, `/output`, `/manifest.json`.
개별 `cache.add` + catch 라 일부가 404여도 설치가 실패하지 않는다. (런타임 다운로드되는
mediapipe 파일은 웹 빌드에 없으므로 프리캐시하지 않고, 존재할 때 요청 시점에 캐시된다)

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

**관리자 설정 편집은 "선택한 지점" 기준**: 결제·촬영·타이머·인화·테마 설정 페이지는
상단 헤더에서 선택한 지점의 실효값(전역←지점 병합)을 보여주고, **변경한 필드만 해당
지점(DeviceSetting)에 저장**한다(`useAdminDeviceSettings`). 전역 설정은 새 지점의
기본값/폴백으로만 남는다. 지점 미선택 시 안내를 표시한다.

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
| `CHROMAKEY_MODE` | "mediapipe" | 배경 제거 모드 (mediapipe/chromakey/chromakey-yuv/off) |
| `CHROMAKEY_RGB` | "0,255,0" | 크로마키 색상 |
| `CHROMAKEY_SIMILARITY` | "50" | 크로마키 감도(색상 허용 거리, 1-100). 높을수록 키 색과 더 먼 색까지 제거. 그 외 크로마키 키(`CHROMAKEY_SMOOTHNESS`·`CHROMAKEY_SPILL`·`CHROMAKEY_CHOKE`·`CHROMAKEY_LUMA`)와 크로마키 OBS 방식 키(`CHROMAKEY_YUV_*`)는 §12 |
| `PAYMENT_ENABLED` | "0" | 결제 활성화 |
| `PAYMENT_AMOUNT` | "5000" | **1장당 가격**(원). 결제 화면 매수는 1/2/4장 고정, 총액 = 가격 × 매수 |
| `PAYMENT_TERMINAL_MODE` | "manual" | 결제 모드 |
| `IDLE_TIMEOUT_SECONDS` | "30" | 자동 진행 타임아웃 |
| `CAMERA_AUTO_TIMER` | "60" | 자동 촬영 타이머 (초) |
| `CAMERA_RESOLUTION` | "fhd" | 카메라 촬영 해상도 티어 — `low`(320×240)/`sd`(640×480)/`hd`(960×720)/`fhd`(1440×1080)/`uhd`(4K 2880×2160). 모두 4:3 (§11) |
| `PICTURE_WIDTH` / `PICTURE_HEIGHT` | "10" / "15" | 인화지 크기 (cm) |
| `PRINTER_NAME` | "" | 출력 프린터 (비우면 기본 프린터) |
| `MODE_2_2_WIDTH` | — | 2×2 모드 사진 슬롯 너비 (cm) |
| `MODE_2_2_HEIGHT` | — | 2×2 모드 사진 슬롯 높이 (cm) |
| `THEME_TEXT_COLOR` | "#ffffff" | 서비스 화면 글자색 (테마 관리, §25). 지점별로 저장 가능 |
| `THEME_PRIMARY_COLOR` | "#6c6fb4" | 강조(primary) 색상 — 선택 강조·주요 버튼 (테마 관리, §25). 지점별 |
| `THEME_BG_COLOR` | "#2a2a2a" | 서비스 화면 단색 배경 — **대기화면 외 모든 단계** (테마 관리, §25). 지점별 |
| `THEME_BTN_GLOW_ENABLED` | "1" | 버튼 탭 글로우 on/off ("0"이면 끔) |
| `THEME_BTN_GLOW_COLOR` | "#6c6fb4" | 버튼 탭 글로우 색 |
| `THEME_BTN_GLOW_SIZE` | "28" | 버튼 탭 글로우 번짐 크기(px) |
| `THEME_BTN_IMAGE_ONLY_{CAPTURE\|NEXT\|PAYMENT}` | (미설정=켬) | 버튼 이미지만 표시 — 단색 배경·그림자 제거, "0"이면 끔 (§25) |
| `THEME_BTN_HIDE_TEXT_{CAPTURE\|NEXT\|PAYMENT}` | (미설정=끔) | 버튼 이미지 사용 시 텍스트 숨김, "1"이면 켬 (§25) |

> 위 표의 기본값은 **코드 하드코딩 폴백**(`useDeviceSetup.ts`, 설정 키가 없을 때 값) 기준이다.
> `prisma/seed.ts`는 초기 DB에 일부 다른 값을 심는다 — 예: `PAYMENT_ENABLED="1"`(활성),
> `PAYMENT_AMOUNT="5000"`, `CAPTURE_MODES="1x1,2x1,2x2"`. 따라서 갓 시드된 DB의 실효
> 기본값은 표(폴백)와 다를 수 있다.

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

관리자 결제 설정에서 비워 둔 항목의 기본값(§결제 연동 설정).

```env
PAYAPP_USERID=[계정ID]
PAYAPP_GOODNAME=AR-pic 촬영
PAYAPP_RECVPHONE=[전화번호]
PAYAPP_FEEDBACK_URL=https://[도메인]/api/payments/feedback
PAYAPP_RETURN_URL=https://[도메인]/payment/return
PAYAPP_OPENPAYTYPE=
PAYAPP_LINKKEY=[연동KEY]
PAYAPP_LINKVAL=[연동VALUE]
```

### 기타

```env
CRON_SECRET=[웹훅 시크릿]
SESSION_PASSWORD=[관리자 세션 봉인 키 — 32자 이상 임의 문자열]   # iron-session, 미설정 시 관리자 로그인/인증 실패(fail-loud). §23
COOKIE_SECURE=[true일 때만 세션 쿠키에 Secure 부여 — HTTPS 서빙 시. Tauri 로컬 HTTP에선 미설정]
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
    │    └─ [6] src-tauri/server/ → src-tauri/server.zip (임시 .ps1 + Compress-Archive)
    │            ⚠ 임시 .ps1은 UTF-8 BOM 포함 필수 — 없으면 Windows PowerShell이
    │              시스템 ANSI 코드페이지로 읽어 비ASCII 사용자 경로(한글 등)가 깨져
    │              Compress-Archive가 널 경로로 실패한다 (scripts/prepare-tauri.mjs 참고)
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
| 대시보드 | `/admin` | 요약 화면 |
| 계정 관리 | `/admin/accounts` | 관리자 계정 추가·삭제·비밀번호 변경(8자 이상), 활성/비활성 전환(상태 배지 클릭, 자기 계정 제외 — 비활성 계정은 로그인 불가) (`AdminAccount` 테이블) |
| 디바이스 관리 | `/admin/devices`, `/devices/new`, `/devices/[id]` | 생성, 편집(운영 상태 활성/비활성 포함 — 비활성 지점은 키오스크 시작 화면 목록·진입 검증에서 제외), 복제, 삭제(결제 내역 있으면 불가) |
| 이미지 관리 | `/admin/images`, `/images/upload` | 배경/프레임/스티커 탭 — 모두 지점별 노출 목록(뱅크) UI로 노출 선택·순서 관리. 편집창에서 이름·타입·포컬(프레임)·이펙트(배경, 영상 업로드 후 세부 설정 표시)·삭제. 업로드(프레임·스티커는 PNG·JPG만)는 뱅크에만 추가되고 지점 노출은 목록에서 지정 |
| 테마 관리 | `/admin/theme-setting` | 지점별 배경화면(첫 화면·공통·**화면별**)·로고·**촬영 안내 오버레이**·**버튼 이미지**(고정 크기 안내·이미지만 표시·텍스트 숨김), 글자색·강조(primary)색, **버튼 탭 글로우**(on/off·색·세기) 설정 (§25) |
| 인화 설정 | `/admin/print-setting` | 인화지 크기, 모드별 사진 크기·간격·4방향 여백, 배경 이미지, 프린터 선택. 설정값 실시간 미리보기 + 용지 초과 경고 |
| 촬영 설정 | `/admin/capture-setting` | 카운트다운, 촬영 횟수, 배경 제거 모드(AI/크로마키/크로마키 OBS 방식/off), 크로마키 색상(컬러피커), AI 배경제거 세부 설정 9종(경계 침식·부드러움·블러·두께·떨림 억제, 손 구제, 인물 추적 크롭·여유, 처리 해상도) — 각 항목에 추천값 표시, 카메라 실시간 미리보기 (§12 참고) |
| 타이머 설정 | `/admin/timer-setting` | 유휴 타임아웃, 촬영 자동 타이머, 인화 자동 복귀 타이머 |
| 결제 설정 | `/admin/payment` | 결제 사용, 1장당 가격, 결제 방식, PayApp 연동(판매자 ID·상품명·수신 전화번호·피드백/리턴 URL·결제 수단) — 지점 설정이 전역·환경변수보다 우선 |
| 결제 내역 | `/admin/payment-history` | 거래 이력 조회 |

- 이미지 타입(배경=1, 프레임=2, 스티커=3)은 `/api/admin/image-types` 조회 시
  기본 3종이 upsert로 보장된다 (시드 이전 DB에서도 스티커 업로드 가능).
- 인화 설정의 여백 입력은 상/하 또는 좌/우를 동시에 설정할 수 없다
  (한쪽 입력 시 반대쪽 비활성화, 비우면 자동 중앙 정렬 — §13 참고).

### 인증 (관리자 세션 — iron-session)

- `POST /api/admin/login` → bcrypt 비밀번호 검증 → **iron-session으로 봉인(암호화·서명)한 세션 쿠키** 발급(`admin_session`, httpOnly, 24h).
  예전엔 쿠키 값이 관리자 id 원문이라 위조 가능했으나, 이제 `SESSION_PASSWORD`(§21) 없이는 유효 세션 생성 불가.
- **`proxy.ts`**(Next 16에서 middleware가 proxy로 개명)가 `/admin/*`에서 봉인 세션을 **열어 검증**(존재만 확인 아님) → 위조 쿠키는 미인증 처리. `requireAdmin`/보호 레이아웃도 봉인 세션 기반(`src/lib/session.ts`, `adminAuth.ts`).
- 로그인 성공 시 소프트 라우팅 대신 **하드 내비게이션**(`window.location.assign`)으로 이동 — 소프트 라우팅이 방금 설정한 쿠키를 proxy가 못 봐 로그인 화면에 머무는 문제 방지.

### 장치 실행 잠금 (Device Password)

- 관리자 장치 편집에서 장치마다 **실행 비밀번호**(bcrypt 해시, `Device.password`) 설정/제거 가능. 목록·상세·응답에 해시는 미노출(hasPassword만).
- 실행 시 홈(`/`) **장치 선택 → "시작"** 에서 `POST /api/devices/[deviceId]/verify`로 검증(§8). 미설정 장치는 통과, 설정 장치는 일치해야 진입.
- 초기 상태는 모든 장치 **잠금 없음**(password=null). 관리자가 설정하기 전까지 프롬프트 없이 실행.

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

## 25. 테마 관리 (배경화면 / 로고 / 색상) — 지점별

관리자 **테마 관리** 페이지(`/admin/theme-setting`)에서 **상단에서 선택한 지점**의 서비스
화면 배경화면·로고·촬영 안내 오버레이·버튼 이미지와 글자색·강조(primary) 색상을 설정한다. 지점마다 다르게 적용되며,
관리자 UI에는 적용되지 않고 `/service`에만 적용된다. 지점 전환 시 그 지점 테마가 로드된다.

### 배경화면 (wallpaper, type 5) / 로고 (logo, type 6)

- 기존 이미지 업로드/목록/삭제 API 재사용. **업로드 시 선택 지점에 연결**(`deviceIds: [지점]`)해
  **지점 전용**으로 저장하고, **한 장만 유지**(새 업로드가 성공한 뒤 기존 것 삭제 — 실패 시 기존 이미지 보존).
- 조회는 **지점 연결분만**(`/api/image/list/{5|6}/?device_id=X&linked=1`) — 목록 API의 `linked=1`
  파라미터는 "전체 디바이스용 제외, 해당 지점 연결분만"을 의미한다.
- 배경화면은 같은 imageType 5 안에서 **`name`으로 슬롯**을 구분한다(`src/constants/images.ts`):
  - 첫(대기) 화면 `wallpaper`(가로)·`wallpaper_portrait`(세로) — 기존 단일 배경화면(`wallpaper`)이 첫 화면 가로 슬롯이라 하위호환.
  - **나머지 화면(공통)** `wallpaper_sub`(가로)·`wallpaper_sub_portrait`(세로).
  - **화면별** `wp_{step}`(가로)·`wp_{step}_pt`(세로) — step: `payment`·`frame`·`background`·`camera`·
    `select`·`printbg`·`complete` (`WALLPAPER_PAGE_STEPS`, `wallpaperPageName()`). `Image.name`이
    VarChar(32)라 짧은 접두어를 쓴다.
- `useDeviceSetup`이 이 지점의 wallpaper/logo를 `wallpaperUrl`·`wallpaperPortraitUrl`·
  `wallpaperSubUrl`·`wallpaperSubPortraitUrl`·`pageWallpaperUrls`(화면별, name 키 맵)/`logoUrl`로 노출.
  서비스는 **화면 방향에 맞는 슬롯**을 고르고(해당 방향이 없으면 반대 방향으로 폴백) cover로 깐다.
  - 첫 화면: 첫 화면용 → 없으면 단색.
  - 나머지 단계(CSS 캐스케이드처럼): **화면별 → 공통(sub) → 단색 `THEME_BG_COLOR`**(기본 `#2a2a2a`).
    모든 화면을 통일하려면 화면별 슬롯을 비워 두면 된다. 관리자에선 단계 탭으로 고르며, 개별 배경이
    지정된 탭에 초록 점이 표시된다(`PageWallpaperCard`).
  **로고는 대기 화면을 제외한 모든 단계**의
  좌측 상단에 표시(촬영 단계 포함). 미설정 시 기본 로고는 `AR-pic` 텍스트.

### 촬영 화면 안내 오버레이 (type 5, `overlay_camera`)

- 촬영 화면 카메라 미리보기(4:3) 위에 겹쳐 보이는 안내 이미지(예: "손바닥을 펴면 촬영돼요").
  `useDeviceSetup`의 `cameraOverlayUrl` → `CameraSection`의 `overlayImageUrl`.
- **화면 표시 전용** — 합성 캔버스 밖의 `<img>`라 촬영본에는 담기지 않는다. 카운트다운이 시작되면
  숨겨 카운트 숫자와 겹치지 않게 하고, 스티커 드래그 레이어(z-10)보다 아래라 조작을 막지 않는다.
- 권장: 1600×1200px(4:3) 투명 PNG(`object-contain`).

### 버튼 이미지 (button, type 7)

- 대형 강조 버튼(촬영하기·다음으로·결제하기)별 배경 이미지. **가로/세로 화면용을 따로** 올린다 —
  name `button_capture`·`button_next`·`button_payment`(가로용, 예전 단일 업로드와 호환)와 뒤에 `_pt`를 붙인
  세로용(`buttonImageName(role, portrait)`). **한쪽만 올리면 그 이미지를 양쪽 화면에 사용**(배경화면 가로/세로와
  같은 폴백). 지점 연결·슬롯당 한 장 유지는 배경화면과 동일. 버튼별 텍스트 색은 `THEME_BTN_TEXT_COLOR_{CAPTURE|NEXT|PAYMENT}`.
- **이미지가 있는 버튼은 고정 크기** — `BUTTON_IMAGE_SIZE`(가로 화면 **544×116px**, 세로 화면
  **736×160px**, 기존 단색 버튼 실측값과 동일해 이미지 유무로 레이아웃이 흔들리지 않음). 관리자 버튼
  카드의 가로/세로 슬롯에 각 크기를 안내한다.
- 이미지는 버튼 크기에 **꽉 채워** 표시(`background-size: 100% 100%`) — 방향별로 맞춰 만들면 원본 비율 그대로,
  한쪽 이미지를 양쪽에 쓰면 두 크기의 비율 차(약 2%)만큼만 늘어난다(cover처럼 잘리거나 contain처럼 빈 띠가 생기지 않음).
- 버튼별 표시 옵션(`ButtonImageOptions`, `parseButtonImageOptions()`):
  - `THEME_BTN_IMAGE_ONLY_{ROLE}` — **이미지만 표시**. 단색 배경·그림자·라운드·hover 광택을 없애
    투명 PNG가 그대로 보인다. **미설정 시 켬**("0"이면 끔 → 단색 버튼 위에 이미지를 채움).
  - `THEME_BTN_HIDE_TEXT_{ROLE}` — **버튼 텍스트 숨김**(이미지에 글자가 포함된 경우). "1"일 때만 켬.
- 구현: service 루트(`.service-theme`)에 `data-btn-img-{role}`·`data-btn-imgonly-{role}`·
  `data-btn-hidetext-{role}` 속성과 `--btn-img-w/h` 변수를 내리고, `globals.css`의 언레이어드 규칙이
  `.btn-role-{role}` 버튼에 적용된다(버튼을 그리는 각 Section은 옵션을 몰라도 됨). 옵션은 관리자
  하단 **설정 저장**으로 반영(이미지는 업로드 즉시 반영).

### 글자색 / 강조(primary) 색상

- `THEME_TEXT_COLOR`(기본 `#ffffff`) / `THEME_PRIMARY_COLOR`(기본 `#6c6fb4`) 설정 — **지점별
  저장**(전역←지점 병합, §20). primary는 선택 강조(카드 테두리·체크)와 주요 버튼에 쓰인다.
- service 루트에 `service-theme` 클래스 + `--theme-text`·`--theme-primary` CSS 변수를 내리고,
  `globals.css`의 `.service-theme .text-white`(및 `/90`~`/30` 투명도 변형, `color-mix`로 톤 유지)
  규칙이 **본문 흰색 텍스트**를 테마색으로 치환한다 (규칙이 레이어 밖이라 Tailwind 유틸보다 우선).
- **제외 대상(대비 안전)**: 자체 배경색을 가진 버튼 — 흰 배경·어두운 글자의 `.service-button`,
  색 버튼의 인라인 흰 글자는 그대로 둔다.

### 단색 배경 / 버튼 탭 글로우

- `THEME_BG_COLOR`(기본 `#2a2a2a`) — 배경화면 이미지를 올리지 않은 화면의 단색 배경(§20).
- 버튼 탭 글로우: `THEME_BTN_GLOW_ENABLED`/`_COLOR`/`_SIZE`. service 루트에
  `--btn-glow-color`·`--btn-glow-size`를 내리고, `globals.css`의 `.service-button:active`
  글로우와 탭 직후 `.btn-glow-ripple` 펄스가 이 값을 쓴다. `_ENABLED="0"`이면 글로우 없음.

### DB 준비

- ImageType `id 5`(wallpaper)·`id 6`(logo)와 `THEME_TEXT_COLOR`·`THEME_PRIMARY_COLOR`
  기본값은 `prisma/seed.ts`에 포함.
- 운영 DB에는 전체 seed(가드 `SEED_FORCE`) 대신 멱등 스크립트 사용:
  `npm run db:add-theme` (`prisma/add-theme-wallpaper.ts`) — 이미지 타입 5·6 + 두 색상 설정만 안전하게 추가.

---

## 26. 손바닥 제스처 촬영

촬영 단계(`CameraSection`)에서 카메라에 **손바닥을 펼쳐 보이면**(Open_Palm) "촬영하기"
버튼을 누른 것과 동일하게(`handleManualCapture`) 촬영이 시작된다.

- **인식기**: MediaPipe `GestureRecognizer`(배경제거용 `ImageSegmenter`와 동일한
  `@mediapipe/tasks-vision` 패키지·WASM 파일셋 재사용). 모델은 `model/gesture_recognizer.task`(§18).
- **배경 제거 모드와 무관하게 항상 동작**하며, 인식기 초기화 실패 시 제스처 촬영만 비활성
  (버튼 촬영은 정상).
- **판정 로직**(별도 rAF 루프):
  - 추론은 200ms 간격으로 스로틀 (세그멘터와 동시 구동 부하 완화).
  - `Open_Palm` 신뢰도 ≥ 0.6이 **HOLD_MS(500ms) 이상 유지**되면 발동 (순간 오탐 방지).
  - **엣지 트리거**: 한 번 촬영하면 손을 내렸다(비-손바닥 프레임) 다시 펴야 재발동.
    촬영 중(countdown)에는 `capturePhoto` 내부 가드가 재트리거를 막는다.
- **튜닝 상수**(`CameraSection.tsx` 감지 루프): `HOLD_MS`, `MIN_SCORE`, `GESTURE_INTERVAL_MS`.
- **성능**: `mediapipe` 배경 모드에서는 세그멘터+제스처 추론이 함께 돌아 부하가 증가하므로
  프레임 드롭 시 `GESTURE_INTERVAL_MS`를 올린다.

### 제스처 → 배경 이펙트 영상

- 같은 감지 루프에서 **배경별로 지정한 제스처**(`Image.effectGesture`, 기본 Victory)를 손바닥(촬영)과 별개로 인식한다(독립 arming).
- 현재 선택된 배경에 이펙트 영상(`Image.effectFilename`, §9)이 설정돼 있으면, 그 제스처 홀드 시 **재생 모드**(`Image.effectMode`)에 따라 반영한다. 한 번 발동 후 손을 내렸다 다시 취해야 재발동(독립 arming).
- **레이어 순서는 항상 배경 → 이펙트 → 사람(카메라)** — 이펙트는 사람 뒤에서 합성된다. 3종 모두 합성 캔버스(`processFrame`) 안에서 그려지므로 **촬영본·송출 프레임에도 반영**된다. 표시/사라짐은 알파 이징(≈250ms) 페이드.
- **재생 모드(3종)** — 관리자 배경 편집에서 선택(`EFFECT_MODES`):
  - **dissolve**(기본): 배경 위에 이펙트 영상을 캔버스 `globalCompositeOperation`(`effectBlendMode`, 기본 screen; `normal`=source-over)로 블렌드해 1회 재생. `effectDuration`(초) 경과 또는 영상 종료 시 정지. `<video>`는 숨김 프레임 소스로만 쓰고 표시는 `drawEffectLayer`가 담당.
  - **transition**: 트리거 시 배경이 이펙트 영상으로 전환되고, **다시 트리거하면 원배경으로 복귀**(제스처 토글, `effectDuration` 무시). 전환 효과 `effectTransition`(`fade` 크로스페이드 / `cut` 즉시), 페이드 시간 `effectTransitionMs`. 배경 소스 자체를 바꾼다(`drawBackground`의 크로스페이드 합성).
  - **chromakey**: 키 색상(`effectChromaColor`)을 제거한 프레임을 오프스크린 캔버스에 굽고 배경 위·사람 아래에 그린다. 감도·부드러움(`effectChromaSimilarity`/`effectChromaSmoothness`)은 메인 크로마키(§12 Chromakey)와 동일한 `applyChromaKey`(채널 우세도 판정)를 그대로 재사용.
- 관리자: 이미지 관리 → 배경 편집(EditDialog)에서 이펙트 영상 업로드/제거 + **트리거 제스처(select)** + **재생 방식(모드)** + 모드별 파라미터 지정
  (`POST/DELETE /api/admin/images/[id]/effect`로 파일, PATCH로 제스처·시간·모드·모드별 값 저장, §8).
- 제스처 옵션은 `EFFECT_TRIGGER_GESTURES`(Victory·Thumb_Up·Thumb_Down·Pointing_Up·ILoveYou·Closed_Fist — 손바닥은 촬영 트리거라 제외), 기본 `DEFAULT_EFFECT_GESTURE`(`src/constants/images.ts`).

---

## 27. 디버그 모드 (서비스 화면)

손님에겐 보이지 않는 운영자용 디버그 토글. 상태는 `sessionStorage`로 단계 전환에도 유지.

- **토글**: 좌상단 로고 **5회 연속 탭**(2초 내) 또는 **`Ctrl+Shift+D`**. 대기화면엔 로고가 없어 키보드 사용.
- **진단 패널**(`DebugOverlay`): 좌하단에 deviceId·단계·프레임/슬롯·선택 사진·배경/인쇄배경·배경제거 모드·카메라 해상도·촬영 설정·서브모니터 등 표시(민감정보 제외). **축소/펼치기·끄기** 버튼.
- **그리드 시각화**(`DebugGridOverlay`): `getComputedStyle`로 `grid-template-rows`를 실측해 각 **행=초록 박스**(r1·r2 라벨), **셀(그리드 아이템)=빨간 박스**를 절대배치 오버레이로 그린다. Tailwind `.grid`와 인라인 `grid-template`(촬영 화면) 모두 대상. `pointer-events-none`이라 터치를 막지 않음(완료 화면은 flex라 그릴 그리드 없음).
- **배경제거 성능 패널**(촬영 화면, `bgRemovalMode:"mediapipe"`일 때): 미리보기 좌상단에 **표시 FPS·세그멘터 상태**와 **처리 방식**을 실시간 표시(0.5초 갱신). 처리 방식이 **Web Worker**면 `추론 왕복(worker) ms`·`마스크 갱신 /s`를, **메인 스레드(폴백)**면 `추론(segmentForVideo) ms`·`마스크 생성 ms`를 보여준다(§12). 계측 누적은 항상 돌지만 디버그도 개발도 아닌 손님 세션에선 갱신 리렌더를 건너뛴다. 같은 패널에 3개 토글 — **GPU 가속**(CPU/WASM ↔ GPU/WebGL), **경량 모델**(경량 selfie ↔ 정밀 멀티클래스), **Web Worker**(메인 스레드 ↔ 워커 분리) — 이 있어 속도·품질을 A/B 비교할 수 있다(§12). 기본값: GPU on · 정밀 모델 · Worker off. 구현은 `src/components/service/camera/`의 `SegmentationDebugPanel.tsx` + `useSegmentationDebugSettings.ts`(값·localStorage 영속화).
- **FPS 배지(개발 전용)**: 개발 모드(`process.env.NODE_ENV !== "production"` = `next dev`/localhost)에서 디버그가 꺼져 있을 때 좌상단에 **FPS만** 작게 표시(디버그를 켜면 위 전체 패널로 대체). `IS_DEV` 상수로 게이트하므로 **배포된 키오스크(production 빌드, `127.0.0.1:3001`)에서는 절대 뜨지 않는다**(호스트명이 아니라 빌드 모드로 판별 — 키오스크도 localhost류 주소라 호스트명 판별은 손님 화면 노출 위험).
- 구현: `src/components/service/DebugContext.tsx`(컨텍스트+`useSecretTap`), `DebugOverlay.tsx`, `DebugGridOverlay.tsx`.

---

## 부록: 주요 파일 경로 참조

| 역할 | 파일 경로 |
|------|---------|
| 타입 정의 | `src/types/index.ts` |
| 메인 서비스 페이지 | `src/app/service/page.tsx` |
| 서브 모니터 페이지 | `src/app/output/page.tsx` |
| 카메라 컴포넌트(오케스트레이션) | `src/components/service/CameraSection.tsx` |
| 촬영 합성 루프·고해상도 캡처 | `src/components/service/camera/useCameraCapture.ts` |
| 세그멘터 초기화·워커 연결 | `src/components/service/camera/useMediapipeSegmentation.ts` |
| 마스크 후처리(블러·두께·평활·ROI) | `src/lib/segmentMask.ts` |
| 세그멘테이션 워커 | `src/workers/segmenter.worker.ts` |
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
