# 2026-06-28 트러블슈팅 기록

## 1. 환경변수 정리

### 문제
`.env` 파일에 코드에서 사용하지 않는 변수가 다수 포함되어 있고, 실제 필요한 변수가 누락되어 있었음.

### 누락된 변수
- `NEXT_PUBLIC_SUPABASE_URL` — `storage.ts`, `prints.ts`에서 사용
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — `storage.ts`, `prints.ts`에서 사용
- `CRON_SECRET` — `api/print/cleanup/route.ts`에서 사용

### 제거한 변수 (코드 미참조)
- `SESSION_SECRET_KEY`, `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- `PAYAPP_LINKKEY`, `PAYAPP_LINKVAL`
- `DB_DRIVER`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_CHARSET` (레거시 MySQL)
- `SUPABASE_DATABASE_URL`, `DB_TABLE_PREFIX` (Python용)

### 조치
- `.env`에 누락 변수 추가, 미사용 변수 제거
- `.env.example` 동기화

---

## 2. localhost:3000 -> /ko/ 리디렉션

### 증상
`localhost:3000` 접속 시 `/ko/`로 계속 리디렉션됨.

### 원인
- 프로젝트에 i18n 설정이나 `[locale]` 라우트 없음
- 이전에 i18n 설정이 있었을 때 브라우저가 **301 영구 리디렉션을 캐시**한 것
- Service Worker 캐시도 관여 가능

### 해결
- 시크릿 모드에서는 정상 동작 확인 -> 브라우저 캐시 문제 확정
- 브라우저 캐시 삭제 (`chrome://settings/clearBrowserData`)
- Service Worker unregister

---

## 3. Service Worker 관련 문제들

### 증상
1. 관리자 로그인이 첫 시도에 실패하고 두 번째에 성공
2. 페이지 깜빡임/무한 새로고침
3. 카메라 화면에서 이전 세션 상태 복원

### 원인
`public/sw.js`가 cache-first 전략을 사용하여:
- 이전 응답(리디렉션 등)이 캐시되어 잘못된 응답 반환
- 로그인 후 쿠키가 반영되지 않은 캐시된 페이지로 이동

### 해결
`src/app/layout.tsx`에서 개발 환경(localhost)일 때 SW를 등록하는 대신 자동 해제하도록 변경:
```js
if(location.hostname==="localhost"){
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(s => s.unregister()))
} else {
  navigator.serviceWorker.register("/sw.js")
}
```

---

## 4. 배경 이미지 400 에러

### 증상
서비스 화면에서 배경 이미지(background01~06.png) 로드 시 400 에러.

### 원인
DB `Image` 테이블에는 `background01.png` 등의 파일명이 저장되어 있지만, Supabase Storage `pic-images` 버킷에는 UUID 형태의 파일명만 존재했음. 파일명 불일치.

### 해결
로컬 `public/static/images/` 디렉토리에 원본 파일이 있는 것을 확인하고, Supabase Storage에 DB 파일명과 동일한 이름으로 업로드:
```bash
curl -X POST "${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "x-upsert: true" \
  --data-binary "@${DIR}/${filename}"
```

### 업로드한 파일
- background01~06.png (배경 이미지)
- viswave_logo.png (로고)

### 미해결
인화 배경 이미지(a1a279853690.png 등 5개)는 로컬에도 버킷에도 원본이 없어 업로드 불가. `c0b918ad32bf.png`은 버킷에 존재하지만 79바이트(빈/깨진 파일).

---

## 5. 완성 화면 검은 이미지

### 증상
촬영 완료 후 CompleteSection의 합성 이미지가 전체 검은색.

### 원인
DB `Setting` 테이블의 `PRINT_BACKGROUND` 값이 `c0b918ad32bf.png`으로 설정되어 있었음. 이 파일은 Supabase 버킷에 79바이트짜리 깨진 이미지. `createComposite()`에서:

1. `PRINT_BACKGROUND` 설정값이 존재하므로 이 이미지를 배경으로 로드 시도
2. 79바이트 PNG가 정상 로드됨 (`bgDrawn = true`)
3. 실제로는 1x1 투명 픽셀이라 캔버스에 아무것도 그려지지 않음
4. `canvas.toDataURL("image/jpeg")` 시 투명 영역이 검은색으로 변환

### 해결
DB에서 `PRINT_BACKGROUND` 값을 빈 문자열로 업데이트:
```sql
UPDATE "Setting" SET value = '' WHERE name = 'PRINT_BACKGROUND';
```
이후 사용자가 선택한 배경(`selectedBackground`)이 사용됨.

### 참고: 합성 이미지 생성 흐름 (CompleteSection.createComposite)
1. 캔버스 생성 (1800px 기준)
2. 배경 그리기: `PRINT_BACKGROUND` > 사용자 선택 배경 > FALLBACK 그라데이션
3. 슬롯 위치 계산: 관리자 설정(cm 기반) > 패딩 기반 폴백
4. 각 슬롯에 사진 그리기 (loadImage -> clip -> drawImage)
5. JPEG 내보내기 및 QR 코드용 업로드

---

## 6. MediaPipe 배경 제거 (세그멘테이션) 조사

### 배경
배경과 인물 사이의 자글자글한 아티팩트를 개선하기 위해 세그멘테이션 마스크에 threshold 처리를 시도.

### 시도한 것들

#### 시도 1: Threshold + Smooth Edge
```js
const lo = 0.3;   // 이하 -> 완전 투명
const hi = 0.65;  // 이상 -> 완전 불투명
const a = v <= lo ? 0 : v >= hi ? 1 : (v - lo) / range;
data[i * 4 + 3] = Math.round(a * 255);
```
결과: 인물이 완전히 사라짐.

#### 시도 2: 마스크 반전 (`1 - mask[i]`)
디버그 로그에서 center=0.000으로 나와 마스크가 반전되어 있다고 판단하여 `1 - mask[i]` 적용.
결과: 인물 실루엣이 투명해지고 배경만 남음 (반전이 아니었음).

#### 시도 3: 타임스탬프 가드
`performance.now()`가 중복되어 `segmentForVideo` 에러가 발생한다고 판단하여 타임스탬프 체크 추가.
결과: 실제 에러가 아닌 TensorFlow Lite INFO 메시지였음. 효과 없음.

### 결론
- **원본 코드 `mask[i] * 255`가 정상 동작하는 코드**
- 디버그 로그에서 center=0.000이 나온 것은 마스크 배열의 중간 인덱스가 실제 이미지 중앙과 다르거나, 최초 프레임에서 인물이 아직 감지되지 않았기 때문
- MediaPipe selfie_segmenter_landscape 모델: mask 값이 높을수록 인물, 낮을수록 배경
- `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`는 에러가 아닌 정보 메시지 (Next.js dev overlay가 잘못 표시)
- 모든 시도를 원복하고 원래 코드로 복원함

### 향후 참고사항
- 세그멘테이션 마스크를 수정할 때는 반드시 실제 프레임에서 마스크 값의 전체 분포를 확인할 것
- `selfie_segmenter_landscape` 모델의 mask 방향(높은 값=인물)을 전제로 코드가 작성되어 있음
- 개발 환경에서 MediaPipe WASM 로그가 콘솔 에러로 표시되지만 실제 에러가 아님

---

## 최종 반영된 변경사항

### 커밋됨 (2414653)
1. `.env.example` — 미사용 변수 제거, 누락 변수 추가
2. `src/app/layout.tsx` — 개발 환경에서 SW 자동 해제

### DB 변경
1. `PRINT_BACKGROUND` 설정값 비움 (빈 문자열)

### Supabase Storage 업로드
1. background01~06.png, viswave_logo.png를 `pic-images` 버킷에 업로드

### 원복됨 (변경 시도 후 되돌림)
- `CameraSection.tsx` — 세그멘테이션 마스크 threshold 코드
- `CompleteSection.tsx` — 디버그 로깅
- `canvas.ts` — loadImage crossOrigin 조건부 처리
- `types/index.ts` — DeviceConfig에 segmentThreshold/segmentSmoothness 추가
- `service/page.tsx` — threshold 설정 로드
- `admin/settings/page.tsx` — 설정 라벨 변경
