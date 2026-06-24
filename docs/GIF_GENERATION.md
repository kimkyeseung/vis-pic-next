# GIF(움짤) 생성 로직 상세 문서

---

## 1. 전체 흐름 요약

GIF 생성은 **프론트엔드(촬영 중 프레임 수집)** → **프론트엔드(API 호출 분기)** → **백엔드(이미지 합성 및 GIF 인코딩)** 3단계로 이루어집니다.

```
[service3.html] 촬영 화면
  │
  │  촬영 카운트다운 중 1초마다 capture_intermediate_picture() 호출
  │  → 배경 + 사람을 합성한 캡처 프레임을 위치별로 수집
  │  → intermediate_pictures = { "position_0": [frame0, frame1, ...], "position_1": [...] }
  │
  │  촬영 완료 시 POST /api/session/store
  │  → intermediate_pictures를 서버 메모리에 임시 저장
  ↓
[service4.html] 사진 선택 화면
  │
  │  POST /api/session/store-selected → 선택된 합성 이미지 저장
  ↓
[service5.html] 인쇄/QR 화면
  │
  │  GET /api/session/load → intermediate_pictures 복원
  │
  ├── intermediate_pictures가 있으면
  │     → POST /api/gif/create-layout  (레이아웃 GIF)
  │
  └── intermediate_pictures가 없으면
        → POST /api/gif/create  (단순 GIF, removed_background_pictures 사용)
```

---

## 2. 프레임 수집 — 촬영 화면 (`templates/service/service3.html`)

### 2.1 중간 프레임이란?

촬영 카운트다운(예: 5초) 동안 **1초마다** 현재 화면(배경 + 배경 제거된 사람)을 캡처한 이미지입니다. 최종 촬영 사진과 별개로, GIF 애니메이션의 프레임으로 사용됩니다.

### 2.2 수집 타이밍 (`service3.html:1189-1214`)

```javascript
function run_countdown() {
    let count = CAPTURE_SECONDS;  // 예: 5

    // 카운트다운 시작할 때 첫 중간 사진 캡처
    capture_intermediate_picture();       // ← 0초 시점

    countdown = setInterval(() => {
        count--;
        if (count >= 0) {
            capture_intermediate_picture();  // ← 매 1초마다
        } else {
            clearInterval(countdown);
            capture_removed_background();    // ← 최종 촬영
        }
    }, 1000);
}
```

예를 들어 `CAPTURE_SECONDS = 5`이면 중간 프레임은 최대 **6장** (0초, 1초, 2초, 3초, 4초, 5초 시점) 캡처됩니다.

### 2.3 캡처 로직 (`capture_intermediate_picture()`, service3.html:1058-1186)

각 호출마다 다음을 수행합니다:

```
1. 인화 설정에서 사진 비율 계산
   → MODE_{cols}_{rows}_WIDTH / MODE_{cols}_{rows}_HEIGHT
   → 예: 4cm / 6cm = 0.667 (세로가 긴 비율)

2. GIF용 캡처 해상도 결정
   → 비율 >= 1 이면: 1280 x (1280/비율)
   → 비율 < 1 이면: (1280*비율) x 1280
   → 즉, 긴 변이 1280px

3. 임시 캔버스에 합성
   ┌─────────────────────────┐
   │  ① 배경 레이어          │  이미지 배경 or 비디오 배경 or 흰색
   │  (cover 크롭으로 채움)   │
   ├─────────────────────────┤
   │  ② 사람 레이어          │  배경 제거된 사람 (output-canvas)
   │  (cover 크롭으로 합성)   │  또는 크로마키 (output-canvas-chromakey)
   └─────────────────────────┘

4. canvas.toDataURL('image/jpeg', 0.95) → base64 문자열

5. intermediate_pictures[position_키].push(dataUrl)
```

### 2.4 데이터 구조

```javascript
intermediate_pictures = {
    "position_0": [           // 첫 번째 촬영 위치
        "data:image/jpeg;base64,...",  // 0초 프레임
        "data:image/jpeg;base64,...",  // 1초 프레임
        "data:image/jpeg;base64,...",  // 2초 프레임
        ...
    ],
    "position_1": [           // 두 번째 촬영 위치 (2x2 모드 등)
        "data:image/jpeg;base64,...",
        ...
    ]
}
```

- **키**: `position_{인덱스}` — 인화 레이아웃에서의 슬롯 위치 (좌→우, 상→하 순서)
- **값**: base64 JPEG 이미지 배열 — 1초 간격으로 캡처된 프레임들
- 2x2 모드이면 `position_0` ~ `position_3`, 1x1 모드이면 `position_0`만 존재

### 2.5 세션 저장

촬영이 모두 끝나면 `POST /api/session/store`로 서버에 전송됩니다:

```javascript
// service3.html:1312-1322
fetch('/api/session/store', {
    method: 'POST',
    body: JSON.stringify({
        removed_background_pictures: removed_background_pictures,
        selected_background: backgroundSrc,
        selected_foreground: frontImgEl ? frontImgEl.src : '',
        intermediate_pictures: intermediate_pictures   // ← GIF 소스
    })
});
```

---

## 3. API 호출 분기 — 인쇄 화면 (`templates/service/service5.html`)

`service5.html`의 `createAndShowQRCodes()` 함수에서 GIF 생성 API를 호출합니다. **두 가지 경로**가 있습니다:

### 분기 조건 (`service5.html:1039-1127`)

```
온라인이고 intermediate_pictures가 있고 animationData가 있으면
  → /api/gif/create-layout  (레이아웃 GIF — 위치별 독립 애니메이션)

온라인이고 위 조건 불충족이고 removed_background_pictures가 있으면
  → /api/gif/create  (단순 GIF — 배경 제거 사진들을 순서대로 재생)

오프라인이면
  → GIF 생성 건너뜀
```

### 경로 A: 레이아웃 GIF (`/api/gif/create-layout`)

프론트엔드에서 인화 레이아웃 크기를 계산하여 서버에 전달합니다:

```javascript
// service5.html:1077-1092
const gifPayload = {
    intermediate_pictures: intermediatePictures,  // 위치별 프레임 배열
    layout_cols: cols,          // 예: 2 (2x2 모드)
    layout_rows: rows,          // 예: 2
    photo_width: hqPhotoWidth,  // 각 사진 너비 (px) — 인화 설정 기반 고해상도
    photo_height: hqPhotoHeight,// 각 사진 높이 (px)
    h_gap: hqHGap,              // 가로 간격 (px)
    v_gap: hqVGap,              // 세로 간격 (px)
    duration: 500,              // 프레임당 500ms
    background_color: "#ffffff",
    background_image: printSettings.PRINT_BACKGROUND || null,
    canvas_width: hqCanvasWidth,   // 전체 GIF 너비 (인화 용지 크기 기반)
    canvas_height: hqCanvasHeight, // 전체 GIF 높이
    start_x: Math.round(hqStartX),// 첫 사진 시작 X
    start_y: Math.round(hqStartY) // 첫 사진 시작 Y
};
```

크기 계산 기준:
- 인화 용지 `PICTURE_WIDTH` x `PICTURE_HEIGHT` (cm) 비율 유지
- 긴 변 1800px 기준으로 스케일 (`hqScale = 1800px ÷ (용지cm × 37.8)`)
- 각 사진 크기, 간격, 여백도 같은 스케일 적용

### 경로 B: 단순 GIF (`/api/gif/create`)

중간 프레임이 없을 때 배경 제거된 사진들로 GIF를 만듭니다:

```javascript
// service5.html:1112-1118
fetch('/api/gif/create', {
    body: JSON.stringify({
        images: sessionData.removed_background_pictures,  // base64 배열
        duration: 1000   // 프레임당 1000ms (1초)
    })
});
```

---

## 4. 백엔드 GIF 생성 — 단순 GIF (`view/session.py:530-666`)

### API: `POST /api/gif/create`

입력으로 base64 이미지 배열을 받아 하나의 GIF 파일로 만듭니다.

### 처리 순서

```
입력: ["data:image/jpeg;base64,...", "data:image/jpeg;base64,...", ...]
  │
  ▼
① 이미지 변환 (각 프레임마다)
  ├── base64 디코드 → bytes
  ├── PIL Image.open()
  ├── RGBA → 흰색 배경에 합성하여 RGB로 변환
  └── 긴 변이 800px 초과 시 비율 유지 축소 (LANCZOS)
  │
  ▼
② 글로벌 팔레트 생성
  ├── 프레임 3개 중 1개씩 샘플링
  ├── 샘플 프레임을 1/4 크기로 축소 (속도 최적화)
  ├── 축소된 샘플들을 가로로 이어붙여 하나의 이미지로 합침
  └── 합친 이미지에서 256색 MEDIANCUT 팔레트 추출
  │
  ▼
③ 각 프레임에 팔레트 적용
  ├── 글로벌 팔레트 기준으로 quantize (256색)
  └── Floyd-Steinberg 디더링 적용 (색상 전환 부드럽게)
  │
  ▼
④ GIF 파일 저장
  ├── 첫 프레임.save(나머지 프레임, duration, loop=0)
  ├── optimize=False (글로벌 팔레트 사용 시)
  └── 저장 경로: static/gif/YYYYMMDD_{uuid8자}.gif
  │
  ▼
⑤ 메타데이터 등록
  └── gif_metadata[gif_id] = { created_at, expiry_time(+3일), filename }
```

### 글로벌 팔레트가 필요한 이유

GIF는 프레임당 최대 256색만 사용할 수 있습니다. 각 프레임이 독립적으로 256색을 선택하면 프레임 간 색상이 달라져 깜빡임이 발생합니다. **글로벌 팔레트**는 모든 프레임이 동일한 256색을 공유하여 색상 일관성을 유지합니다.

```
[프레임별 팔레트 — 문제]          [글로벌 팔레트 — 해결]
프레임1: 빨강계열 128색 + 파랑 128   모든 프레임: 동일한 256색
프레임2: 빨강계열 100색 + 파랑 156   → 프레임 간 색상 깜빡임 없음
→ 같은 피부색이 프레임마다 다르게 보임
```

### 샘플링 최적화

전체 프레임을 분석하면 느리므로, 3개 중 1개만 1/4 크기로 축소하여 팔레트를 추출합니다:

```python
sample_size = max(1, len(pil_images) // 3)   # 3프레임당 1개 샘플
for i, frame in enumerate(pil_images):
    if i % sample_size == 0:
        small = frame.resize((frame.width // 4, frame.height // 4), ...)
        all_pixels.append(small)
```

---

## 5. 백엔드 GIF 생성 — 레이아웃 GIF (`view/session.py:710-924`)

### API: `POST /api/gif/create-layout`

인화 레이아웃 형태로 각 위치의 사진이 독립적으로 애니메이션되는 GIF를 만듭니다.

### 단순 GIF와의 차이

| | 단순 GIF (`/api/gif/create`) | 레이아웃 GIF (`/api/gif/create-layout`) |
|---|---|---|
| **입력** | base64 이미지 배열 | 위치별 프레임 딕셔너리 |
| **결과물 형태** | 사진 1장이 프레임마다 바뀜 | 인화 용지 모양으로 여러 사진이 각각 움직임 |
| **최대 해상도** | 800px (축소) | 제한 없음 (프론트엔드에서 결정, 보통 1200~1800px) |
| **프레임 속도** | 1000ms (1초) | 500ms (0.5초) |
| **사용 조건** | intermediate_pictures 없을 때 | intermediate_pictures 있을 때 |

### 처리 순서

```
입력: {
    intermediate_pictures: { "position_0": [...], "position_1": [...] },
    layout_cols: 2, layout_rows: 2,
    photo_width: 340, photo_height: 510,
    canvas_width: 1200, canvas_height: 1800,
    ...
}
  │
  ▼
① 위치별 이미지 변환
  ├── 각 위치(position_0, position_1, ...)의 각 프레임:
  │     base64 → PIL Image → RGB 변환 → 지정 크기(photo_width x photo_height)로 리사이즈
  └── 결과: position_images = { "position_0": [PIL, PIL, ...], "position_1": [PIL, PIL, ...] }
  │
  ▼
② 전체 프레임 수 결정
  └── max_frames = 가장 많은 프레임을 가진 위치의 프레임 수
  │
  ▼
③ 배경 준비
  ├── background_image가 있으면: 로컬 파일에서 로드 → 캔버스 크기로 리사이즈
  └── 없으면: background_color(HEX)를 RGB로 파싱
  │
  ▼
④ 레이아웃 프레임 합성 (frame_idx = 0 ~ max_frames-1 반복)

  각 프레임마다:
  ┌────────────────────────────────────────────┐
  │  배경 (이미지 또는 단색)                      │
  │                                            │
  │  ┌──────────┐  gap  ┌──────────┐          │
  │  │position_0│       │position_1│          │
  │  │frame[idx]│       │frame[idx]│          │
  │  └──────────┘       └──────────┘          │
  │       gap                gap               │
  │  ┌──────────┐  gap  ┌──────────┐          │
  │  │position_2│       │position_3│          │
  │  │frame[idx]│       │frame[idx]│          │
  │  └──────────┘       └──────────┘          │
  │                                            │
  └────────────────────────────────────────────┘

  위치 좌표 계산:
    x = start_x + col × (photo_width + h_gap)
    y = start_y + row × (photo_height + v_gap)

  프레임 인덱스 처리:
    - 해당 위치의 프레임이 부족하면 → 마지막 프레임을 반복 사용
    - img_idx = min(frame_idx, len(img_list) - 1)
  │
  ▼
⑤ 글로벌 팔레트 생성 + 프레임 적용 (단순 GIF와 동일한 방식)
  │
  ▼
⑥ GIF 파일 저장 + 메타데이터 등록 (단순 GIF와 동일)
```

### 레이아웃 GIF의 애니메이션 예시 (2x2 모드, 3프레임)

```
프레임 0                    프레임 1                    프레임 2
┌─────┬─────┐             ┌─────┬─────┐             ┌─────┬─────┐
│ A-0 │ B-0 │             │ A-1 │ B-1 │             │ A-2 │ B-2 │
│     │     │      →      │     │     │      →      │     │     │
├─────┼─────┤             ├─────┼─────┤             ├─────┼─────┤
│ C-0 │ D-0 │             │ C-1 │ D-1 │             │ C-2 │ D-2 │
│     │     │             │     │     │             │     │     │
└─────┴─────┘             └─────┴─────┘             └─────┴─────┘

A = position_0의 프레임들 (1초 간격으로 캡처된 포즈 변화)
B = position_1의 프레임들
C = position_2의 프레임들
D = position_3의 프레임들

→ 각 칸이 독립적으로 움직이는 느낌의 GIF
```

---

## 6. 파일 저장과 만료

### 저장 경로

```python
GIF_DIR = Path("static/gif")           # view/session.py:48
PRINT_IMAGE_DIR = Path("static/prints") # view/session.py:928
```

### 파일명 규칙

```
YYYYMMDD_{uuid8자}.gif
예: 20260624_a1b2c3d4.gif
```

날짜가 파일명에 포함되어 있어, 메타데이터 없이도 만료 판정이 가능합니다.

### 만료 삭제 (3일)

```python
GIF_EXPIRY_DAYS = 3   # view/session.py:52
```

**삭제 방법 2가지가 중복 동작합니다:**

| 방식 | 대상 | 판정 기준 | 실행 주기 |
|------|------|----------|----------|
| 백그라운드 스레드 (`cleanup_expired_gifs`, line 54) | `gif_metadata` 딕셔너리의 항목 | `expiry_time` 타임스탬프 | 1시간마다 |
| 파일명 기반 정리 (`cleanup_expired_files`, line 935) | `static/gif/*.gif` + `static/prints/*` | 파일명의 날짜 (`YYYYMMDD`) | 서버 시작 시 + 수동 API 호출 |

백그라운드 스레드는 서버 재시작 시 `gif_metadata`가 초기화되어 빈 딕셔너리가 됩니다. 이 경우 파일명 기반 정리가 실제 삭제를 담당합니다.

---

## 7. 관련 파일 목록

| 파일 | 역할 | 핵심 라인 |
|------|------|----------|
| `templates/service/service3.html` | 중간 프레임 수집 | `capture_intermediate_picture()` (1058-1186) |
| `templates/service/service5.html` | GIF API 호출 분기 | `createAndShowQRCodes()` (1038-1127) |
| `view/session.py` | GIF 생성 백엔드 전체 | `create_gif()` (530-666), `create_layout_gif()` (710-924) |
| `view/session.py` | 파일 만료 삭제 | `cleanup_expired_gifs()` (54-78), `cleanup_expired_files()` (935-975) |

---

## 8. 의존성

- **PIL/Pillow**: 이미지 처리, 팔레트 변환, GIF 인코딩 (`from PIL import Image`)
- **qrcodejs**: GIF URL을 QR로 표시 (프론트엔드, `static/vendor/js/qrcode.min.js`)
- Python 표준 라이브러리: `base64`, `io`, `uuid`, `threading`, `datetime`
