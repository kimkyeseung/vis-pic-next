# vis-pic → vis-pic-next 기능 누락 구현 가이드

> 원본 FastAPI 프로젝트(`vis-pic`)에서 Next.js 프로젝트(`vis-pic-next`)로 이전 시 누락된 기능 11개의 구현 방법을 다른 AI가 작업할 수 있도록 상세히 기술합니다.

---

## 1. 레이아웃 GIF 생성 API

### 현재 상태

새 프로젝트에는 `POST /api/gif/create/` (단순 GIF)만 있다. 이 API는 base64 이미지 배열을 받아 순서대로 재생하는 GIF를 만든다.

원본에는 `POST /api/gif/create-layout` 가 추가로 있어, 인화 레이아웃(2x2 등) 형태에서 **각 촬영 위치가 독립적으로 움직이는** GIF를 만든다.

### 단순 GIF vs 레이아웃 GIF 차이

```
[단순 GIF]                    [레이아웃 GIF]
프레임1: 사진A                 프레임1: ┌──┬──┐
프레임2: 사진B                          │A0│B0│
프레임3: 사진C                          ├──┼──┤
→ 사진이 통째로 바뀜                    │C0│D0│
                                        └──┴──┘
                              프레임2: ┌──┬──┐
                                       │A1│B1│
                                       ├──┼──┤
                                       │C1│D1│
                                       └──┴──┘
                              → 인화 레이아웃 위에 각 칸이 독립적으로 움직임
```

### 구현해야 할 것

**파일:** `src/app/api/gif/create-layout/route.ts` (신규 생성)

**요청 Body:**

```typescript
interface LayoutGifRequest {
  intermediate_pictures: Record<string, string[]>;
  // { "position_0": ["data:image/jpeg;base64,...", ...], "position_1": [...] }
  layout_cols: number;       // 열 수 (예: 2)
  layout_rows: number;       // 행 수 (예: 2)
  photo_width: number;       // 각 사진 너비 (px)
  photo_height: number;      // 각 사진 높이 (px)
  h_gap: number;             // 가로 간격 (px)
  v_gap: number;             // 세로 간격 (px)
  duration: number;          // 프레임당 ms (기본 500)
  background_color: string;  // HEX (예: "#ffffff")
  background_image: string | null; // 인화 배경 이미지 URL
  canvas_width: number;      // 전체 GIF 너비
  canvas_height: number;     // 전체 GIF 높이
  start_x: number;           // 첫 사진 시작 X
  start_y: number;           // 첫 사진 시작 Y
}
```

**처리 알고리즘:**

```
1. 전체 프레임 수 결정
   max_frames = 모든 위치 중 가장 많은 프레임을 가진 위치의 프레임 수

2. 위치별 이미지 준비
   각 position의 각 프레임: base64 디코딩 → sharp로 photo_width × photo_height 리사이즈

3. 배경 준비
   background_image가 있으면: 로컬 파일 로드 → canvas 크기로 리사이즈
   없으면: background_color를 RGB로 파싱

4. 프레임 합성 (frame_idx = 0 ~ max_frames-1)
   각 프레임마다:
   - 배경 이미지 또는 단색으로 canvas_width × canvas_height 이미지 생성
   - row × col 순회하며 각 위치에 해당 프레임의 이미지 배치
     x = start_x + col × (photo_width + h_gap)
     y = start_y + row × (photo_height + v_gap)
   - 해당 위치에 프레임이 부족하면 마지막 프레임 반복 사용
     img_idx = min(frame_idx, frames.length - 1)

5. GIF 인코딩
   기존 /api/gif/create와 동일한 gif-encoder-2 사용
   단, sharp의 composite() 메서드로 배경 위에 사진들을 합성한 후 프레임 추가

6. 저장 및 응답
   기존과 동일 (Supabase + 로컬 dual-write, 3일 만료)
```

**sharp composite 예시:**

```typescript
// 각 프레임 합성
for (let frameIdx = 0; frameIdx < maxFrames; frameIdx++) {
  // 배경 이미지를 base로 시작
  let compositeInputs: sharp.OverlayOptions[] = [];

  for (let row = 0; row < data.layout_rows; row++) {
    for (let col = 0; col < data.layout_cols; col++) {
      const posIdx = row * data.layout_cols + col;
      const posKey = `position_${posIdx}`;
      const frames = positionBuffers[posKey];
      if (!frames || frames.length === 0) continue;

      const imgIdx = Math.min(frameIdx, frames.length - 1);
      const x = data.start_x + col * (data.photo_width + data.h_gap);
      const y = data.start_y + row * (data.photo_height + data.v_gap);

      compositeInputs.push({
        input: frames[imgIdx],
        left: Math.round(x),
        top: Math.round(y),
      });
    }
  }

  const frameBuffer = await sharp(backgroundBuffer)
    .composite(compositeInputs)
    .ensureAlpha()
    .raw()
    .toBuffer();

  encoder.addFrame(frameBuffer);
}
```

**프론트엔드 호출 변경 (`CompleteSection.tsx`):**

현재 `uploadForQR()` 함수에서 중간 프레임을 단순히 펼쳐서(`flatMap`) `/api/gif/create/`를 호출한다. 이것을 중간 프레임이 있을 때 레이아웃 정보와 함께 `/api/gif/create-layout/`을 호출하도록 분기해야 한다.

```typescript
// 현재 (CompleteSection.tsx:60-78)
const allFrames = selectedIndices
  .flatMap((i) => intermediateFrames[i] || [])
  .filter(Boolean);
// → 모든 프레임이 일렬로 합쳐져서 단순 GIF가 됨

// 변경: 위치별 프레임을 보존하여 레이아웃 GIF 호출
const intermediatePictures: Record<string, string[]> = {};
selectedIndices.forEach((photoIdx, slotIdx) => {
  const frames = intermediateFrames[photoIdx];
  if (frames && frames.length > 0) {
    intermediatePictures[`position_${slotIdx}`] = frames;
  }
});

if (Object.keys(intermediatePictures).length > 0) {
  // 레이아웃 GIF: 인화 설정 기반 크기 계산 필요 (→ 항목 2와 연관)
  const gifRes = await fetch("/api/gif/create-layout/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intermediate_pictures: intermediatePictures,
      layout_cols: frame.cols,
      layout_rows: frame.rows,
      photo_width: /* 인화 설정에서 계산 */,
      photo_height: /* 인화 설정에서 계산 */,
      // ...
    }),
  });
} else {
  // 기존 단순 GIF fallback
}
```

**응답 형식 (기존 `/api/gif/create`와 동일):**

```json
{
  "success": true,
  "gif_id": "a1b2c3d4",
  "gif_url": "/static/prints/20260625_a1b2c3d4.gif",
  "frame_count": 5,
  "expiry_date": "2026년 06월 28일",
  "expiry_days": 3
}
```

---

## 2. 인화 합성 시 관리자 설정 반영

### 현재 상태

`CompleteSection.tsx`의 `createComposite()` 함수에서 인화 이미지를 합성할 때 다음 값들이 **하드코딩**되어 있다:

```typescript
// CompleteSection.tsx:101-112
const basePx = 1800;
const paperRatio = 3 / 2;      // ← 하드코딩 (관리자가 설정한 용지 크기를 무시)
const padding = 20;             // ← 하드코딩 (관리자가 설정한 간격/여백을 무시)
const photoRatio = 4 / 3;      // ← 하드코딩
```

원본에서는 관리자가 설정한 `PICTURE_WIDTH`, `PICTURE_HEIGHT`, `MODE_2_2_WIDTH`, `MODE_2_2_HGAP`, `MODE_2_2_MARGIN_TOP` 등의 값이 정확히 반영된다.

### 구현해야 할 것

**1단계: DeviceConfig에 인화 설정 추가**

`src/types/index.ts`의 `DeviceConfig`에 인화 관련 필드를 추가한다:

```typescript
export interface DeviceConfig {
  // 기존 필드...
  deviceId: string;
  deviceName: string;
  // ...

  // 추가: 인화 설정
  pictureWidth: number;   // cm (기본 10)
  pictureHeight: number;  // cm (기본 15)
  printBackground: string; // 인화 배경 이미지 URL
  // 프레임 모드별 설정은 settings 객체에서 동적으로 읽음
  settings: Record<string, string>; // 전체 설정 키-값
}
```

**2단계: 서비스 페이지에서 설정 로딩**

`src/app/service/page.tsx`의 `loadDeviceConfig()`에서 이미 `/api/device/{deviceId}/settings`를 호출하고 있다. 응답의 `settings` 객체를 `DeviceConfig`에 포함시켜 `CompleteSection`까지 전달한다.

**3단계: CompleteSection에서 설정 사용**

```typescript
// CompleteSection.tsx — createComposite() 수정

const createComposite = async () => {
  const frame = FRAME_INFO[selectedFrame];
  if (!frame) return;

  const cmToPx = 37.8;
  const baseLongSide = 1800;

  // 관리자 설정에서 용지 크기 읽기
  const paperWidthCm = parseFloat(settings.PICTURE_WIDTH || "10");
  const paperHeightCm = parseFloat(settings.PICTURE_HEIGHT || "15");
  const paperRatio = paperWidthCm / paperHeightCm;

  // 긴 변 1800px 기준 캔버스 크기
  let canvasWidth: number, canvasHeight: number;
  if (paperRatio >= 1) {
    canvasWidth = baseLongSide;
    canvasHeight = Math.round(baseLongSide / paperRatio);
  } else {
    canvasHeight = baseLongSide;
    canvasWidth = Math.round(baseLongSide * paperRatio);
  }
  const scale = canvasWidth / (paperWidthCm * cmToPx);

  // 프레임 모드별 사진 크기/간격/여백
  const modePrefix = `MODE_${frame.cols}_${frame.rows}_`;
  const photoWidthCm = parseFloat(settings[modePrefix + "WIDTH"] || "4");
  const photoHeightCm = parseFloat(settings[modePrefix + "HEIGHT"] || "6");
  const hGapCm = parseFloat(settings[modePrefix + "HGAP"] || "0.2");
  const vGapCm = parseFloat(settings[modePrefix + "VGAP"] || "0.2");

  const photoWidthPx = photoWidthCm * cmToPx * scale;
  const photoHeightPx = photoHeightCm * cmToPx * scale;
  const hGapPx = hGapCm * cmToPx * scale;
  const vGapPx = vGapCm * cmToPx * scale;

  // 여백 계산
  const marginTop = settings[modePrefix + "MARGIN_TOP"] || "";
  const marginLeft = settings[modePrefix + "MARGIN_LEFT"] || "";
  // ... (원본 service5.html:860-874와 동일한 로직)

  // 사진 배치 좌표 계산
  const totalWidth = frame.cols * photoWidthPx + (frame.cols - 1) * hGapPx;
  const totalHeight = frame.rows * photoHeightPx + (frame.rows - 1) * vGapPx;
  let startX = (canvasWidth - totalWidth) / 2;  // 기본 중앙 정렬
  let startY = (canvasHeight - totalHeight) / 2;

  if (marginLeft !== "") startX = parseFloat(marginLeft) * cmToPx * scale;
  if (marginTop !== "") startY = parseFloat(marginTop) * cmToPx * scale;

  // ... 이하 캔버스에 배경 + 사진 렌더링
};
```

**원본 참고:** `templates/service/service5.html:812-910` (`createHighResolutionImage` 함수)

---

## 3. 페이지 새로고침 시 촬영 데이터 보존

### 현재 상태

새 프로젝트는 모든 촬영 데이터를 React state로 관리한다 (`src/app/service/page.tsx:35-44`). 브라우저 새로고침 시 데이터가 소실된다.

원본은 서버 메모리에 세션 데이터를 저장하여 (`temp_storage` 딕셔너리) 페이지 전환에도 데이터가 유지되었다.

### 구현 방법 (2가지 중 택 1)

**방법 A: sessionStorage 활용 (권장 — 서버 API 불필요)**

SPA 구조에서는 페이지 전환이 없으므로, 브라우저 새로고침 대비만 하면 된다:

```typescript
// src/app/service/page.tsx

// 저장
useEffect(() => {
  if (photos.length > 0) {
    sessionStorage.setItem("photobooth_photos", JSON.stringify(photos));
    sessionStorage.setItem("photobooth_intermediateFrames", JSON.stringify(intermediateFrames));
  }
}, [photos, intermediateFrames]);

// 복원
useEffect(() => {
  const saved = sessionStorage.getItem("photobooth_photos");
  if (saved) {
    setPhotos(JSON.parse(saved));
    const frames = sessionStorage.getItem("photobooth_intermediateFrames");
    if (frames) setIntermediateFrames(JSON.parse(frames));
  }
}, []);

// 완료 시 정리
const resetAll = () => {
  sessionStorage.removeItem("photobooth_photos");
  sessionStorage.removeItem("photobooth_intermediateFrames");
  // ... 기존 state 초기화
};
```

주의: base64 이미지 배열은 크기가 크므로, 사진 수가 많으면 sessionStorage 용량 한계(5~10MB)에 걸릴 수 있다. 그 경우 IndexedDB 사용을 검토한다.

**방법 B: 서버 세션 API 구현 (원본과 동일)**

`src/app/api/session/store/route.ts` 등을 만들어 서버에 임시 저장한다. 단, Next.js는 서버리스이므로 인메모리 저장소 대신 Redis나 DB를 사용해야 한다. SPA 구조에서는 방법 A가 더 자연스럽다.

---

## 4. PWA / Service Worker / 오프라인 모드

### 현재 상태

새 프로젝트에 Service Worker, manifest, 오프라인 지원이 전혀 없다.

### 구현해야 할 것

**4-1. manifest.json 생성**

`public/manifest.json`:

```json
{
  "name": "AR-pic 포토부스",
  "short_name": "AR-pic",
  "description": "AR-pic 포토부스 서비스 - 오프라인 지원",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#2a2a2a",
  "theme_color": "#2a2a2a",
  "icons": [
    { "src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "lang": "ko-KR"
}
```

**4-2. manifest 링크 추가**

`src/app/layout.tsx`의 `<head>`에:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#2a2a2a" />
```

**4-3. Service Worker 생성**

`public/sw.js`:

```javascript
const CACHE_VERSION = "v1";
const STATIC_CACHE = `arpic-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = "arpic-dynamic";

const STATIC_ASSETS = [
  "/",
  "/service/",
  "/manifest.json",
  // CSS, 폰트, 아이콘 등 추가
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("arpic-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API는 네트워크 우선
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 정적 자원은 캐시 우선
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
        return response;
      })
    )
  );
});
```

**4-4. Service Worker 등록**

`src/app/layout.tsx` 또는 별도 컴포넌트에서:

```typescript
useEffect(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
  }
}, []);
```

**4-5. 오프라인 상태 API**

`src/app/api/offline/status/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ code: 200, offline: false, sync_online: true });
}
```

**4-6. CompleteSection에서 오프라인 분기**

```typescript
// QR 생성 전에 오프라인 체크
const isOnline = navigator.onLine;
if (!isOnline) {
  // QR 숨기고 "로컬에 저장됨" 메시지 표시
} else {
  // QR 생성
}
```

---

## 5. 장치 복제(Clone) API

### 현재 상태

장치 CRUD만 있고 복제 기능이 없다.

### 구현해야 할 것

**파일:** `src/app/api/admin/devices/clone/route.ts` (신규 생성)

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sourceDeviceId, newDeviceId, newName, newDescription } = body;

  if (!sourceDeviceId || !newDeviceId || !newName) {
    return NextResponse.json(
      { error: "sourceDeviceId, newDeviceId, newName are required" },
      { status: 400 }
    );
  }

  // 원본 장치 확인
  const source = await prisma.device.findUnique({
    where: { deviceId: sourceDeviceId },
    include: { settings: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Source device not found" }, { status: 404 });
  }

  // 중복 체크
  const existing = await prisma.device.findUnique({
    where: { deviceId: newDeviceId },
  });
  if (existing) {
    return NextResponse.json({ error: "Device ID already exists" }, { status: 409 });
  }

  // 트랜잭션: 장치 생성 + 설정 복제
  const result = await prisma.$transaction(async (tx) => {
    const newDevice = await tx.device.create({
      data: {
        deviceId: newDeviceId,
        name: newName,
        description: newDescription || null,
        isActive: true,
      },
    });

    if (source.settings.length > 0) {
      await tx.deviceSetting.createMany({
        data: source.settings.map((s) => ({
          deviceId: newDeviceId,
          name: s.name,
          value: s.value,
          description: s.description,
        })),
      });
    }

    return newDevice;
  });

  return NextResponse.json({ success: true, device: result });
}
```

**프론트엔드:** `src/app/admin/devices/page.tsx`에 복제 버튼 추가. 클릭 시 모달로 새 장치 ID/이름 입력 → `POST /api/admin/devices/clone/` 호출.

**원본 참고:** `view/admin.py:984-1027`

---

## 6. 평문 비밀번호 자동 마이그레이션

### 현재 상태

`src/app/api/admin/login/route.ts`에서 `bcrypt.compare()`만 사용하므로, 기존 평문 비밀번호 계정은 로그인이 불가능하다.

### 구현해야 할 것

`src/app/api/admin/login/route.ts`를 수정한다:

```typescript
import bcrypt from "bcryptjs";

function isHashedPassword(password: string): boolean {
  return /^\$2[aby]\$/.test(password);
}

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const admin = await prisma.adminAccount.findUnique({
    where: { username },
  });

  if (!admin || !admin.isActive) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  let isValid = false;

  if (isHashedPassword(admin.password)) {
    // bcrypt 해시된 비밀번호 검증
    isValid = await bcrypt.compare(password, admin.password);
  } else {
    // 평문 비밀번호 검증 → 로그인 성공 시 자동 해시 마이그레이션
    if (admin.password === password) {
      isValid = true;
      const hashed = await bcrypt.hash(password, 10);
      await prisma.adminAccount.update({
        where: { id: admin.id },
        data: { password: hashed },
      });
    }
  }

  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // 세션 쿠키 설정 (기존 코드 유지)
  const cookieStore = await cookies();
  cookieStore.set("admin_session", admin.id.toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });

  return NextResponse.json({
    success: true,
    admin: { id: admin.id, username: admin.username, name: admin.name },
  });
}
```

**원본 참고:** `view/admin.py:201-221`, `core/common.py:9-31`

---

## 7. GIF 메타데이터 조회 API

### 현재 상태

GIF 생성 후 메타데이터(생성 시간, 만료 시간, 남은 일수)를 조회하는 API가 없다.

### 구현해야 할 것

**방법 A: 파일명 기반 (DB 불필요, 권장)**

`src/app/api/gif/[gifId]/route.ts` (신규 생성):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { access } from "fs/promises";
import path from "path";

const EXPIRY_DAYS = 3;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gifId: string }> }
) {
  const { gifId } = await params;

  // 파일 존재 여부 확인 (Supabase 또는 로컬)
  // gifId는 "a1b2c3d4" 형태, 파일명은 "YYYYMMDD_a1b2c3d4.gif"
  // 로컬에서 glob으로 찾거나, Supabase에서 list로 찾음

  const printsDir = path.join(process.cwd(), "public", "static", "prints");
  const localFiles = await import("fs/promises")
    .then((fs) => fs.readdir(printsDir))
    .catch(() => [] as string[]);

  const matchedFile = localFiles.find((f) => f.includes(gifId) && f.endsWith(".gif"));

  if (!matchedFile) {
    return NextResponse.json({ error: "GIF not found" }, { status: 404 });
  }

  // 파일명에서 날짜 추출
  const dateMatch = matchedFile.match(/^(\d{4})(\d{2})(\d{2})_/);
  if (!dateMatch) {
    return NextResponse.json({ error: "Invalid filename format" }, { status: 404 });
  }

  const createdAt = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
  const expiryTime = new Date(createdAt);
  expiryTime.setDate(expiryTime.getDate() + EXPIRY_DAYS);
  const remainingDays = Math.max(0, Math.ceil((expiryTime.getTime() - Date.now()) / 86400000));

  return NextResponse.json({
    success: true,
    gif_id: gifId,
    gif_url: `/static/prints/${matchedFile}`,
    created_at: createdAt.toLocaleDateString("ko-KR"),
    expiry_date: expiryTime.toLocaleDateString("ko-KR"),
    remaining_days: remainingDays,
  });
}
```

**원본 참고:** `view/session.py:669-690`

---

## 8. 인쇄 이미지 조회 API

### 현재 상태

원본에는 `GET /api/print/image/{filename}`으로 저장된 인쇄 이미지를 직접 반환하는 엔드포인트가 있다. 새 프로젝트에서는 `public/static/prints/` 경로에 저장되므로 Next.js 정적 파일 서빙으로 접근 가능하다(`/static/prints/filename`).

### 구현 필요 여부

Supabase Storage URL로 저장된 경우는 이미 public URL이 반환되므로 별도 API가 필요 없다. 로컬 저장인 경우도 `public/` 하위이므로 정적 서빙된다.

**결론: 추가 구현 불필요.** 다만 Supabase와 로컬 모두에 파일이 없는 경우의 404 처리가 필요하면 아래처럼 구현할 수 있다:

```typescript
// src/app/api/print/image/[filename]/route.ts (선택적)
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const filepath = path.join(process.cwd(), "public", "static", "prints", filename);

  try {
    const buffer = await readFile(filepath);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".gif" ? "image/gif" :
      ext === ".png" ? "image/png" :
      "image/jpeg";

    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
```

---

## 9. Health Check 엔드포인트

### 구현해야 할 것

`src/app/api/health/route.ts` (신규 생성):

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
```

`src/app/api/ping/route.ts` (신규 생성):

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ code: 200, msg: "Success" });
}
```

**원본 참고:** `main.py:67-70` (`/health`), `main.py:174-176` (`/ping`)

---

## 10. 자동 파일 정리 (Scheduled Cleanup)

### 현재 상태

`GET /api/print/cleanup` 엔드포인트는 있지만, 수동 호출해야만 작동한다. 원본에서는 백그라운드 스레드가 1시간마다 자동으로 만료 파일을 삭제했다.

### 구현 방법 (3가지 중 택 1)

**방법 A: Vercel Cron Job (Vercel 배포 시 권장)**

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/print/cleanup",
      "schedule": "0 * * * *"
    }
  ]
}
```

기존 `GET /api/print/cleanup` 엔드포인트를 그대로 1시간마다 호출한다. 추가 코드 없이 설정만 하면 된다.

CRON_SECRET 환경변수로 외부 호출을 차단해야 한다:

```typescript
// src/app/api/print/cleanup/route.ts 수정
export async function GET(request: NextRequest) {
  // Vercel cron 보안 검증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ... 기존 정리 로직
}
```

**방법 B: 업로드 시점에 정리 (서버리스 환경)**

`/api/print/upload-image` 또는 `/api/gif/create` 호출 시 만료 파일을 함께 정리한다:

```typescript
// src/app/api/print/upload-image/route.ts 끝부분에 추가
// 비동기로 정리 실행 (응답을 지연시키지 않음)
fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/print/cleanup`).catch(() => {});
```

**방법 C: Tauri 데스크톱에서 타이머 (로컬 실행 시)**

Tauri 앱 시작 시 JavaScript 타이머로 1시간마다 cleanup API를 호출한다.

**원본 참고:** `view/session.py:54-82` (백그라운드 스레드), `view/session.py:935-975` (파일명 기반 정리)

---

## 11. GIF 해상도 상향

### 현재 상태

```typescript
// src/app/api/gif/create/route.ts:11
const MAX_GIF_WIDTH = 400;
```

원본에서는 단순 GIF가 800px, 레이아웃 GIF는 인화 크기 기반 1200~1800px이다.

### 구현해야 할 것

**단순 GIF:** `MAX_GIF_WIDTH`를 `800`으로 변경한다.

```typescript
const MAX_GIF_WIDTH = 800;
```

**레이아웃 GIF:** 항목 1에서 새로 만드는 `/api/gif/create-layout` API는 프론트엔드에서 전달하는 `canvas_width` × `canvas_height` 값을 그대로 사용하므로 별도 제한 없이 고해상도가 적용된다. 프론트엔드가 인화 설정 기반으로 1200~1800px을 계산하여 전달한다 (항목 2 참고).

**주의:** GIF 해상도가 높아지면 파일 크기가 급증한다. gif-encoder-2의 `setQuality()` 값을 조정하여 파일 크기를 관리한다 (현재 10, 낮을수록 품질↑ 속도↓).

---

## 우선순위 권장

| 순위 | 항목 | 이유 |
|------|------|------|
| **1** | 2. 인화 설정 반영 | 관리자가 설정한 레이아웃이 무시되면 인쇄물이 틀어짐 |
| **2** | 1. 레이아웃 GIF | 사용자 경험의 핵심 차별점 (움짤 품질) |
| **3** | 11. GIF 해상도 | 단순 상수 변경으로 즉시 개선 |
| **4** | 6. 비밀번호 마이그레이션 | 기존 계정 로그인 불가 문제 |
| **5** | 5. 장치 복제 | 관리자 편의 기능 |
| **6** | 10. 자동 파일 정리 | 디스크/스토리지 관리 |
| **7** | 9. Health Check | 운영 모니터링 |
| **8** | 4. PWA/오프라인 | 네트워크 불안정 환경 대비 |
| **9** | 3. 세션 데이터 보존 | SPA에서는 드물게 발생 |
| **10** | 7. GIF 메타데이터 API | 현재 사용처 없음 |
| **11** | 8. 인쇄 이미지 조회 | 정적 서빙으로 대체 가능 |
