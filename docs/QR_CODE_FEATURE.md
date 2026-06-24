# QR 코드 다운로드 기능 상세 문서

> 촬영 완료 후 사용자에게 사진/GIF를 QR코드로 제공하는 기능의 전체 구현 문서입니다.

---

## 1. 기능 개요

포토부스에서 사진 촬영 → 편집 → 선택이 완료되면, 최종 인화 화면(`service5.html`)에서 **QR코드 2개**가 화면에 나란히 표시됩니다:

| QR 코드 | 아이콘 | 라벨 | 다운로드 대상 | 파일 형식 |
|---------|--------|------|-------------|----------|
| **① 사진 QR** | 📷 | 사진 다운로드 | 고해상도 인화 이미지 (1800px) | `.jpg` |
| **② 움짤 QR** | 🎬 | GIF 다운로드 | 촬영 중간 프레임으로 만든 애니메이션 | `.gif` |

사용자는 스마트폰으로 각 QR코드를 스캔하여 **사진과 움짤(GIF)을 별도로** 다운로드합니다.

### 처리 순서

1. 고해상도 인화 이미지를 캔버스로 합성 → 서버에 업로드 → **사진 QR용 URL 확보**
2. 촬영 중간 프레임들을 서버에 전송 → 서버에서 GIF 생성 → **움짤 QR용 URL 확보**
3. 두 URL을 각각 QR코드로 렌더링하여 화면에 표시

### Fallback 동작

- **움짤(GIF) 생성 실패 시**: 움짤 QR에도 사진 URL이 표시됨 (두 QR이 같은 URL)
- **오프라인 상태**: QR코드 2개 모두 숨기고 "로컬에 저장됨" 메시지 표시

파일은 **3일 후 자동 삭제**됩니다.

---

## 2. 서비스 화면 흐름 (페이지 전환)

```
service1.html (시작/대기)
    ↓
service2.html (결제)
    ↓
service3.html (촬영)
    ├── 촬영 완료 시 POST /api/session/store 호출
    │   → 배경 제거 사진, 선택된 배경/전경, 중간 프레임을 서버에 임시 저장
    ↓
service4.html (사진 선택/편집)
    ├── 완료 시 POST /api/session/store-selected 호출
    │   → 선택된 합성 이미지들을 서버에 임시 저장
    ├── location.href = `/service/${deviceId}/5?frame=` + selectedFrame
    ↓
service5.html (인쇄 + QR코드 표시)  ← **이 문서의 핵심**
    ├── GET /api/session/load-selected → 선택된 합성 이미지 로드
    ├── GET /api/session/load → 세션 데이터(배경 제거 사진, 중간 프레임 등) 로드
    ├── POST /api/print/upload-image → 고해상도 사진 업로드 → QR 사진 URL
    ├── POST /api/gif/create-layout 또는 /api/gif/create → GIF 생성 → QR GIF URL
    └── 클라이언트에서 QR코드 생성 후 화면에 표시
```

### 라우트 등록 위치

- `view/admin.py:422` — `GET /service/{device_id}/{page_no}` 장치별 서비스 페이지
- `view/admin.py:77` — `_service_template_name()` 함수가 `page_no`를 `service/service{page_no}.html` 템플릿에 매핑
- 설정값은 `DeviceSetting` 테이블에서 `device_id`별로 조회 후 Jinja `{{ settings | tojson }}`으로 전달

---

## 3. 백엔드 API 상세

### 3.1 세션 임시 저장 (`view/session.py`)

모든 세션 데이터는 **서버 메모리**에 저장됩니다 (서버 재시작 시 초기화).

```python
# view/session.py:38
temp_storage = {}  # { session_id: { ...data... } }
```

#### `POST /api/session/store` (line 356)

촬영 화면(service3)에서 호출. 촬영 결과물을 서버에 임시 저장합니다.

**요청 Body** (`SessionData` 모델, line 90):
```json
{
  "removed_background_pictures": ["data:image/jpeg;base64,...", ...],
  "selected_background": "data:image/jpeg;base64,...",
  "selected_foreground": "data:image/png;base64,...",
  "intermediate_pictures": {
    "position_0": ["data:image/jpeg;base64,...", "data:image/jpeg;base64,..."],
    "position_1": ["data:image/jpeg;base64,...", "data:image/jpeg;base64,..."]
  }
}
```

- `removed_background_pictures`: 배경 제거된 사진 리스트 (base64)
- `selected_background`: 선택된 배경 이미지 (base64)
- `selected_foreground`: 선택된 전경/스티커 이미지 (base64)
- `intermediate_pictures`: 위치별 1초마다 찍은 중간 프레임 (GIF 애니메이션용)

**응답:**
```json
{
  "success": true,
  "session_id": "uuid-string",
  "image_count": 4
}
```

#### `POST /api/session/store-selected` (line 402)

사진 선택 화면(service4)에서 호출. 사용자가 선택한 최종 합성 이미지를 저장합니다.

**요청 Body** (`ImageListData` 모델, line 87):
```json
{
  "images": ["data:image/jpeg;base64,...", ...]
}
```

**응답:**
```json
{
  "success": true,
  "session_id": "uuid-string",
  "image_count": 2
}
```

#### `GET /api/session/load` (line 381)

세션 데이터를 로드합니다. service5에서 QR 생성 시 호출됩니다.

**응답:**
```json
{
  "success": true,
  "removed_background_pictures": [...],
  "selected_background": "...",
  "selected_foreground": "...",
  "intermediate_pictures": { "position_0": [...], ... }
}
```

#### `GET /api/session/load-selected` (line 424)

선택된 합성 이미지를 로드합니다.

**응답:**
```json
{
  "success": true,
  "selected_pictures": ["data:image/jpeg;base64,...", ...]
}
```

#### `DELETE /api/session/clear` (line 444)

세션 데이터를 삭제합니다.

---

### 3.2 인화 이미지 업로드 (`view/session.py`)

#### `POST /api/print/upload-image` (line 997)

QR코드 다운로드를 위한 고해상도 인화 이미지를 서버에 저장합니다.

**저장 디렉토리:** `static/prints/` (line 928)

**요청 Body** (`PrintImageUploadData` 모델, line 992):
```json
{
  "image_data": "data:image/jpeg;base64,...",
  "image_type": "photo"
}
```

- `image_type`: `"photo"` → `.jpg`, `"gif"` → `.gif`, `"video"` → `.webm`

**파일명 형식:** `YYYYMMDD_{uuid8자}.{확장자}`
- 예: `20260624_a1b2c3d4.jpg`
- 날짜 접두사로 만료 판별

**응답:**
```json
{
  "success": true,
  "image_id": "a1b2c3d4",
  "image_url": "/static/prints/20260624_a1b2c3d4.jpg",
  "expiry_date": "2026년 06월 27일",
  "expiry_days": 3
}
```

**핵심 로직:**
```python
# line 1012-1022
date_str = datetime.now().strftime("%Y%m%d")
image_id = str(uuid.uuid4())[:8]
filename = f"{date_str}_{image_id}.jpg"
file_path = PRINT_IMAGE_DIR / filename

with open(file_path, 'wb') as f:
    f.write(image_bytes)

image_url = f"/static/prints/{filename}"
```

#### `POST /api/print/save-image` (line 461)

인쇄용 이미지를 저장하고 base64로 다시 반환합니다 (프린터 전송용). QR코드 기능과 직접 관련 없음.

**저장 디렉토리:** `temp_images/`

---

### 3.3 GIF 생성 (`view/session.py`)

#### `POST /api/gif/create` (line 530)

단순 GIF: base64 이미지 리스트를 받아 애니메이션 GIF를 생성합니다.

**저장 디렉토리:** `static/gif/` (line 48)

**요청 Body** (`GifCreateData` 모델, line 525):
```json
{
  "images": ["data:image/jpeg;base64,...", ...],
  "duration": 1000
}
```

- `duration`: 프레임당 지속 시간 (ms), 기본값 1000

**GIF 생성 로직:**
1. base64 → PIL Image 변환 (RGBA → RGB)
2. 최대 800px로 리사이즈
3. 글로벌 팔레트 생성 (256색, MEDIANCUT)
4. Floyd-Steinberg 디더링 적용
5. GIF 저장 (무한 반복)

**응답:**
```json
{
  "success": true,
  "gif_id": "a1b2c3d4",
  "gif_url": "/static/gif/20260624_a1b2c3d4.gif",
  "image_count": 4,
  "expiry_date": "2026년 06월 27일 14:30",
  "expiry_days": 3
}
```

#### `POST /api/gif/create-layout` (line 710)

레이아웃 GIF: 인화 레이아웃에 맞춰 각 위치별로 따로따로 움직이는 GIF를 생성합니다. `intermediate_pictures`가 있을 때 사용됩니다.

**요청 Body** (`LayoutGifCreateData` 모델, line 693):
```json
{
  "intermediate_pictures": {
    "position_0": ["data:image/jpeg;base64,...", ...],
    "position_1": ["data:image/jpeg;base64,...", ...]
  },
  "layout_cols": 2,
  "layout_rows": 2,
  "photo_width": 340,
  "photo_height": 510,
  "h_gap": 8,
  "v_gap": 8,
  "duration": 500,
  "background_color": "#ffffff",
  "background_image": "/static/images/print_bg.png",
  "canvas_width": 1200,
  "canvas_height": 1800,
  "start_x": 50,
  "start_y": 50
}
```

**레이아웃 GIF 생성 로직:**
1. 위치별 base64 → PIL Image 변환 후 지정 크기로 리사이즈
2. 가장 많은 프레임을 가진 위치 기준으로 전체 프레임 수 결정
3. 각 프레임마다: 배경 이미지(또는 단색) 위에 각 위치의 해당 프레임 이미지 배치
4. 글로벌 팔레트 + 디더링으로 GIF 저장

**응답:**
```json
{
  "success": true,
  "gif_id": "a1b2c3d4",
  "gif_url": "/static/gif/20260624_a1b2c3d4.gif",
  "frame_count": 5,
  "size": "1200x1800",
  "expiry_date": "2026년 06월 27일 14:30",
  "expiry_days": 3
}
```

#### `GET /api/gif/{gif_id}` (line 669)

GIF 메타데이터 조회 API.

**응답:**
```json
{
  "success": true,
  "gif_id": "a1b2c3d4",
  "gif_url": "/static/gif/a1b2c3d4.gif",
  "created_at": "2026년 06월 24일 14:30",
  "expiry_date": "2026년 06월 27일 14:30",
  "remaining_days": 3
}
```

---

### 3.4 오프라인 상태 확인

#### `GET /api/offline/status` (main.py:184)

```python
@app.get("/api/offline/status")
def offline_status():
    return {"code": 200, "offline": False, "sync_online": True}
```

현재 항상 `offline: False`를 반환합니다. PWA 오프라인 모드에서는 네트워크 에러가 발생하면 클라이언트가 오프라인으로 판정합니다.

---

### 3.5 파일 자동 삭제

#### 백그라운드 스레드 (`view/session.py:54-82`)

```python
def cleanup_expired_gifs():
    while True:
        # gif_metadata 딕셔너리에서 expiry_time 지난 항목 삭제
        # 1시간마다 체크
        time.sleep(3600)

cleanup_thread = threading.Thread(target=cleanup_expired_gifs, daemon=True)
cleanup_thread.start()
```

#### 파일명 기반 정리 (`view/session.py:935-975`)

```python
def cleanup_expired_files():
    # static/gif/*.gif 와 static/prints/* 에서
    # 파일명의 날짜(YYYYMMDD)가 3일 이상 지난 파일 삭제
```

- 서버 시작 시 자동 실행 (line 979)
- `GET /api/cleanup-expired` (line 982)로 수동 호출 가능

#### 삭제 주기 상수

```python
GIF_EXPIRY_DAYS = 3  # view/session.py:52
```

---

## 4. 프론트엔드 상세 (`templates/service/service5.html`)

### 4.1 QR 코드 라이브러리

```html
<!-- line 441 -->
<script src="/static/vendor/js/qrcode.min.js"></script>
```

**라이브러리:** [qrcodejs](https://github.com/davidshimjs/qrcodejs) — 클라이언트 사이드 QR코드 생성. 서버 사이드 QR 생성은 없습니다.

### 4.2 페이지 로드 시 실행 흐름

```javascript
// line 1332-1341
window.addEventListener("DOMContentLoaded", async () => {
    const response = await fetch('/api/session/load-selected');
    const result = await response.json();
    if (result.success) {
        selected_pictures = result.selected_pictures || [];
        await createAndShowQRCodes();  // ← QR 코드 생성 메인 함수
    }
});

// 인쇄 진행 애니메이션은 별도로 실행 (line 1328)
setTimeout(updateProgress, 1500);
```

인쇄 진행 애니메이션과 QR코드 생성은 **병렬로** 실행됩니다.

### 4.3 `createAndShowQRCodes()` 함수 (line 968-1155)

메인 QR 코드 생성 함수의 전체 흐름:

```
1. checkOfflineStatus()
   → GET /api/offline/status
   → isOfflineMode 플래그 설정

2. GET /api/session/load
   → sessionData (배경 제거 사진, 중간 프레임 등)

3. createPrintLayoutPreview(sessionData)
   → 미리보기 캔버스에 인화 레이아웃 렌더링

4. 고해상도 이미지 크기 계산
   → 인화 용지 비율 유지, 긴 변 1800px
   → paperRatio >= 1 이면 width=1800, 아니면 height=1800

5. createHighResolutionImage(sessionData, width, height, scale)
   → 캔버스에 배경 + 사진 합성
   → canvas.toDataURL('image/jpeg', 0.95) 반환

6. POST /api/print/upload-image
   → { image_data: hqPhotoDataUrl, image_type: 'photo' }
   → 응답의 image_url에 serverUrl을 붙여 photoUrl 생성

7. GIF 생성 (오프라인이면 건너뜀)
   - intermediate_pictures가 있으면:
     POST /api/gif/create-layout (레이아웃 GIF)
   - 없으면:
     POST /api/gif/create (단순 GIF)
   → 응답의 gif_url에 serverUrl을 붙여 gifUrl 생성

8. QR 코드 생성 (오프라인이면 건너뜀)
   → generateQRCode('photoQrCode', photoUrl)
   → generateQRCode('videoQrCode', gifUrl || photoUrl)

9. updateUIForOfflineMode()
   → 온라인: QR 섹션 표시 + 만료 배지
   → 오프라인: "로컬에 저장됨" 메시지 표시
```

### 4.4 QR 코드에 인코딩되는 URL 구성

```javascript
// line 936-938
function getExternalServerUrl() {
    return printSettings.EXTERNAL_SERVER_URL || window.location.origin;
}

// 사진 URL (line 1029)
photoUrl = serverUrl + uploadResult.image_url;
// 예: https://example.com/static/prints/20260624_a1b2c3d4.jpg

// GIF URL (line 1104)
gifUrl = serverUrl + gifResult.gif_url;
// 예: https://example.com/static/gif/20260624_a1b2c3d4.gif
```

- `EXTERNAL_SERVER_URL`은 장치별 `DeviceSetting`에서 관리됩니다
- 미설정 시 `window.location.origin` (현재 서버 주소)을 사용합니다
- 포토부스 기기가 로컬 네트워크에서 실행되므로, 외부 접근을 위해 공인 도메인/IP가 필요합니다

### 4.5 `generateQRCode()` 함수 (line 1157-1187)

```javascript
async function generateQRCode(elementId, url) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    if (!qrCodeReady) {
        await waitForQRCode();  // 라이브러리 로드 대기 (최대 5초)
    }

    new QRCode(container, {
        text: url,                              // 다운로드 URL
        width: 100,                             // 100x100 px
        height: 100,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M     // Medium 오류 보정
    });
}
```

### 4.6 QR 코드가 없을 때의 Fallback

```javascript
// line 1132-1143
if (!isOfflineMode) {
    if (photoUrl) {
        await generateQRCode('photoQrCode', photoUrl);
    }
    if (gifUrl) {
        await generateQRCode('videoQrCode', gifUrl);
    } else if (photoUrl) {
        // GIF가 없으면 사진 URL로 대체
        await generateQRCode('videoQrCode', photoUrl);
    }
} else {
    console.log('오프라인 상태: 로컬에 저장됨');
}
```

- GIF가 생성되지 않으면 GIF QR에도 사진 URL을 표시합니다
- 오프라인이면 QR 코드를 전혀 생성하지 않습니다

### 4.7 HTML 구조 (line 397-428)

```html
<!-- QR 코드 섹션 (온라인에서만 표시) -->
<div class="qr-section" id="qrSection">
    <div class="qr-card">
        <div class="qr-icon">📷</div>
        <div class="qr-label">사진 다운로드</div>
        <div class="qr-code-box" id="photoQrCode"></div>
        <div class="qr-sublabel">QR 스캔</div>
    </div>
    <div class="qr-card">
        <div class="qr-icon">🎬</div>
        <div class="qr-label">GIF 다운로드</div>
        <div class="qr-code-box" id="videoQrCode"></div>
        <div class="qr-sublabel">QR 스캔</div>
    </div>
</div>

<!-- 오프라인 저장 메시지 (오프라인에서만 표시) -->
<div class="offline-saved-section" id="offlineSavedSection">
    <div class="offline-saved-icon">💾</div>
    <div class="offline-saved-title">로컬에 저장됨</div>
    <div class="offline-saved-subtitle">
        오프라인 상태에서는 사진이 기기에 저장됩니다.<br>
        네트워크 연결 시 QR 코드로 다운로드할 수 있습니다.
    </div>
</div>

<!-- 자동삭제 배지 (온라인에서만 표시) -->
<div class="expiry-badge" id="expiryBadge">
    <span>⏰</span>
    <span><strong id="expiryDate">3일</strong> 후 자동삭제</span>
</div>
```

### 4.8 온라인/오프라인 UI 전환 (line 942-966)

```javascript
function updateUIForOfflineMode(offlineFilename = '') {
    if (isOfflineMode) {
        qrSection.classList.add('hidden');
        offlineSection.classList.add('visible');
        expiryBadge.classList.add('hidden');
        // 오프라인 파일 경로 표시
    } else {
        qrSection.classList.remove('hidden');
        offlineSection.classList.remove('visible');
        expiryBadge.classList.remove('hidden');
    }
}
```

### 4.9 고해상도 이미지 생성 (`createHighResolutionImage`, line 812-910)

QR 다운로드용 이미지를 캔버스에 합성합니다:

1. 인화 용지 크기 비율 유지, 긴 변 1800px로 설정
2. 배경 이미지(`PRINT_BACKGROUND`) 또는 흰색 배경 렌더링
3. 프레임 모드(`1x1`, `2x2` 등)에 따라 그리드 배치
4. 각 슬롯에 선택된 사진을 cover 방식으로 크롭하여 배치
5. `canvas.toDataURL('image/jpeg', 0.95)` 반환

사용되는 설정 키들:
- `PICTURE_WIDTH`, `PICTURE_HEIGHT`: 인화 용지 크기 (cm)
- `MODE_{cols}_{rows}_WIDTH`, `MODE_{cols}_{rows}_HEIGHT`: 각 사진 크기 (cm)
- `MODE_{cols}_{rows}_HGAP`, `MODE_{cols}_{rows}_VGAP`: 사진 간격 (cm)
- `MODE_{cols}_{rows}_MARGIN_TOP/BOTTOM/LEFT/RIGHT`: 여백 (cm)
- `PRINT_BACKGROUND`: 인화 배경 이미지 URL

---

## 5. 파일 구조 요약

| 구성 요소 | 파일 경로 | 역할 |
|-----------|-----------|------|
| **QR 라이브러리** | `static/vendor/js/qrcode.min.js` | qrcodejs 클라이언트 사이드 QR 생성 |
| **인쇄/QR 화면** | `templates/service/service5.html` | QR 표시, 고해상도 이미지 생성, 인쇄 |
| **촬영 화면** | `templates/service/service3.html` | 촬영 후 세션 저장 |
| **사진 선택** | `templates/service/service4.html` | 합성 사진 선택 후 세션 저장 |
| **세션/GIF API** | `view/session.py` | 세션 저장, 이미지 업로드, GIF 생성, 파일 정리 |
| **라우트 등록** | `view/admin.py` | 서비스 페이지 라우트, 설정 전달 |
| **오프라인 API** | `main.py` | `/api/offline/status` |
| **사진 저장** | `static/prints/` | 인화 이미지 저장 디렉토리 |
| **GIF 저장** | `static/gif/` | GIF 저장 디렉토리 |
| **인쇄 임시** | `temp_images/` | 인쇄용 임시 이미지 (QR과 무관) |

---

## 6. 설정 키 (DeviceSetting)

| 설정 키 | 용도 | 예시 값 |
|---------|------|---------|
| `EXTERNAL_SERVER_URL` | QR 코드에 인코딩할 외부 접근 URL | `https://photo.example.com` |
| `PICTURE_WIDTH` | 인화 용지 가로 (cm) | `10` |
| `PICTURE_HEIGHT` | 인화 용지 세로 (cm) | `15` |
| `PRINT_BACKGROUND` | 인화 배경 이미지 URL | `/static/images/bg.png` |
| `MODE_2_2_WIDTH` | 2x2 모드 사진 가로 (cm) | `4` |
| `MODE_2_2_HEIGHT` | 2x2 모드 사진 세로 (cm) | `6` |
| `MODE_2_2_HGAP` | 2x2 모드 가로 간격 (cm) | `0.2` |
| `MODE_2_2_VGAP` | 2x2 모드 세로 간격 (cm) | `0.2` |
| `MODE_2_2_MARGIN_TOP` | 2x2 모드 상단 여백 (cm) | `0.5` |

---

## 7. 데이터 흐름 다이어그램

```
[사용자 스마트폰]
      │ QR 스캔
      ▼
[GET https://server/static/prints/20260624_xxx.jpg]
[GET https://server/static/gif/20260624_xxx.gif]
      │
      ▼
[FastAPI Static Files] → 파일 직접 서빙
      │
      │ (3일 후)
      ▼
[cleanup_expired_files()] → 파일 삭제


[포토부스 기기 브라우저 (service5.html)]
      │
      ├── 1. GET /api/session/load-selected
      │       → selected_pictures (base64 이미지 배열)
      │
      ├── 2. GET /api/session/load
      │       → intermediate_pictures, removed_background_pictures
      │
      ├── 3. JS: createHighResolutionImage()
      │       → Canvas로 1800px 고해상도 이미지 합성
      │       → base64 dataURL 반환
      │
      ├── 4. POST /api/print/upload-image
      │       ← { image_url: "/static/prints/20260624_xxx.jpg" }
      │
      ├── 5. POST /api/gif/create-layout
      │       ← { gif_url: "/static/gif/20260624_xxx.gif" }
      │
      ├── 6. JS: photoUrl = EXTERNAL_SERVER_URL + image_url
      │         gifUrl = EXTERNAL_SERVER_URL + gif_url
      │
      └── 7. JS: new QRCode(container, { text: photoUrl })
              new QRCode(container, { text: gifUrl })
```

---

## 8. 주의사항 / 알려진 제약

1. **세션 저장소가 메모리**: `temp_storage`는 Python 딕셔너리이므로 서버 재시작 시 세션 데이터가 소멸됩니다. 운영 환경에서는 Redis 등으로 교체가 권장됩니다.

2. **GIF 메타데이터도 메모리**: `gif_metadata`와 `print_image_metadata` 딕셔너리도 서버 재시작 시 초기화됩니다. 다만 파일명 기반 정리(`cleanup_expired_files`)가 있어 파일은 날짜로 정리됩니다.

3. **EXTERNAL_SERVER_URL 필수**: 포토부스 기기가 로컬 네트워크에서 동작하는 경우, QR코드가 외부에서 접근 가능하려면 공인 도메인/포트포워딩이 필요합니다. 이 설정이 없으면 `window.location.origin`(예: `http://192.168.0.10:8000`)이 사용되어 같은 네트워크에서만 접근 가능합니다.

4. **파일 크기**: 고해상도 이미지는 1800px, GIF는 최대 800px로 리사이즈되지만, 멀티프레임 GIF는 파일 크기가 클 수 있습니다.

5. **QR 코드는 클라이언트 전용**: 서버에서 QR 코드 이미지를 생성하지 않습니다. qrcodejs 라이브러리가 브라우저에서 캔버스로 렌더링합니다.

6. **GIF Fallback**: `intermediate_pictures`가 없으면 `removed_background_pictures`로 단순 GIF를 생성합니다. 둘 다 없으면 GIF QR에 사진 URL이 표시됩니다.

7. **인쇄와 QR 병렬 실행**: `updateProgress()`(인쇄 애니메이션)와 `createAndShowQRCodes()`는 동시에 실행됩니다. 인쇄 완료와 QR 생성 완료 시점이 다를 수 있습니다.
