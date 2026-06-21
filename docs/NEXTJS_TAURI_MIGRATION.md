# Next.js + Tauri 마이그레이션 계획

## 개요

FastAPI + Jinja2 + pywebview/PyInstaller 기반 프로젝트를 Next.js + Tauri로 마이그레이션합니다.

### 기존 스택
- Backend: FastAPI, SQLAlchemy, Jinja2
- Desktop: pywebview + PyInstaller (번들링 문제 있음)
- Database: SQLite / PostgreSQL (Supabase)

### 새 스택
- Frontend: Next.js 16+ (App Router, React, TypeScript)
- Desktop: Tauri 2.0 (Rust 기반, 안정적 번들링)
- Backend: Next.js API Routes (standalone server)
- Database: SQLite (Prisma 5)

### 새 프로젝트 위치
`C:\Users\chick\Documents\vis-pic-next`

---

## Phase 1: 프로젝트 셋업 ✅

- [x] Next.js 프로젝트 생성 (TypeScript, Tailwind CSS)
- [x] Tauri 초기화 및 설정
- [x] Rust + Visual Studio C++ Build Tools 설치
- [x] Tauri 빌드 성공 (MSI, NSIS)

---

## Phase 2: 데이터베이스 및 API ✅

- [x] Prisma 5 + SQLite 설정
- [x] 모델: ImageType, Image, Setting, Device, DeviceSetting, AdminAccount, Session
- [x] API Routes 구현
- [x] DB 시드 데이터

---

## Phase 3: 서비스 화면 ✅

- [x] 시작 화면 (터치하여 시작)
- [x] 결제 화면 (로딩 애니메이션)
- [x] 프레임 선택 (1x1, 1x2, 2x2)
- [x] 배경 선택 (그라데이션)
- [x] 카메라/촬영 (카운트다운)
- [x] 사진 선택
- [x] 완료 화면

---

## Phase 4: 관리자 화면 ✅

- [x] 로그인 페이지 (admin/admin)
- [x] 대시보드
- [x] 장치 관리 (CRUD)
- [x] 이미지 관리
- [x] 이미지 업로드
- [x] 설정 관리
- [x] 프린터/카메라 설정 (Tauri 전용)

---

## Phase 5: Tauri 통합 ✅

- [x] Tauri Commands (Rust)
  - [x] `get_printers` - 프린터 목록
  - [x] `print_image` - 이미지 인쇄
  - [x] `get_cameras` - 카메라 목록
  - [x] `save_settings` / `load_settings` - 설정 저장
- [x] Standalone Next.js 서버 빌드
- [x] 임베디드 서버 시작/종료 관리

---

## Phase 6: 테스트 및 마무리 ✅

- [x] 전체 촬영 플로우 테스트 (API 검증 완료)
- [x] 관리자 기능 테스트 (로그인, CRUD 모두 검증)
- [x] 인쇄 기능 코드 검증 (base64→임시파일→인쇄 수정)
- [x] Tauri 빌드 확인 (MSI + NSIS 생성 성공)
- [x] 번들 크기 최적화 (binaryTargets 제한)
- [x] 문서화 (docs/DEPLOYMENT.md)

### 추가 완료 항목
- [x] Supabase PostgreSQL 마이그레이션 (SQLite → PostgreSQL)
- [x] 기존 DB 스키마(pic_*) 호환
- [x] PayApp 결제 API (request, feedback, status)
- [x] bcrypt 비밀번호 해싱
- [x] Supabase Storage 통합 (듀얼 라이트)
- [x] 관리자 설정 페이지 확장 (80개+ 항목)

---

## 커밋 내역

```
29bb080 feat: configure standalone build and embedded server for Tauri
85a244e feat: add image upload and Tauri printer integration (Phase 5)
3a36d0a feat: add admin dashboard and device management (Phase 4)
b3f1a79 feat: add Prisma database and API routes (Phase 2)
e85894d feat: add Tauri integration and service flow UI
66c6f35 Initial commit from Create Next App
```

---

## 실행 방법

### 개발 모드
```bash
cd C:\Users\chick\Documents\vis-pic-next
npm run dev
# → http://localhost:3000
```

### Tauri 개발 모드
```bash
npm run tauri:dev
```

### 프로덕션 빌드
```bash
npm run build
npm run tauri:build
# → src-tauri/target/release/bundle/
```

### 데이터베이스 초기화
```bash
npm run db:push
npm run db:seed
```

---

## 디렉토리 구조

```
vis-pic-next/
├── src/
│   ├── app/
│   │   ├── admin/              # 관리자 화면
│   │   │   ├── devices/
│   │   │   ├── images/
│   │   │   ├── settings/
│   │   │   ├── printer/
│   │   │   ├── login/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── api/                # API Routes
│   │   ├── service/            # 서비스 화면
│   │   ├── globals.css
│   │   └── page.tsx
│   └── lib/
│       └── db.ts
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Tauri commands
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── public/
│   └── static/images/
└── package.json
```

---

**마지막 업데이트**: 2026-06-21
