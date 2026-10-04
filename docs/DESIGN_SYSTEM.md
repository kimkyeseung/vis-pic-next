# 디자인 시스템 (Design System)

폰트 크기·색상 등 디자인 값을 **한 곳(`src/app/globals.css`의 `@theme` 블록)** 에서 관리한다.
Tailwind CSS v4의 토큰 기반 방식이라 별도 `tailwind.config.js`는 없다.

---

## 1. 어디를 고치나

`src/app/globals.css` 최상단 **`@theme { … }`** 블록. 이 값만 바꾸면 앱 전체에 반영된다.

```css
@theme {
  --type-scale: 1.1;          /* 전체 글자 크기 배율 */
  --text-2xl: calc(1.5rem * var(--type-scale));
  --color-brand: #6c6fb4;     /* 강조색 */
  --color-surface: #2a2a2a;   /* 배경 */
  --color-ink: #ffffff;       /* 글자 */
  ...
}
```

---

## 2. 글자 크기

- **전체를 한 번에 키우기/줄이기** → `--type-scale` 하나만 조절 (1 = 기본, 1.1 = 10% 크게).
  모든 `text-xs … text-9xl`이 이 배율을 곱해 계산되므로 앱 전체 글자가 비례해서 바뀐다.
- **특정 단계만** → 그 크기 토큰만 조절 (예: `--text-4xl` 값 변경) 하거나, 컴포넌트에서
  Tailwind 클래스를 바꾼다 (`text-2xl` → `text-4xl`).
- 여백(`p-*`, `gap-*`)은 건드리지 않으므로, 글자만 커지고 레이아웃 간격은 그대로다.
  (레이아웃이 넘치면 `--type-scale`을 낮춘다. 키오스크는 1920×1080 고정)

## 3. 색상

토큰을 정의하면 Tailwind가 유틸리티를 자동 생성한다:

| 토큰 | 용도 | 생성되는 유틸리티 예 |
|------|------|------------------|
| `--color-brand` | 강조/주요 색 | `bg-brand` `text-brand` `border-brand` |
| `--color-brand-strong` | 진한 강조 | `bg-brand-strong` |
| `--color-surface` | 기본 배경 | `bg-surface` |
| `--color-surface-2` | 더 어두운 면 | `bg-surface-2` |
| `--color-ink` | 기본 글자 | `text-ink` |
| `--color-ink-muted` | 흐린 글자 | `text-ink-muted` |
| `--color-line` | 구분선/테두리 | `border-line` |
| `--color-success` / `--color-danger` / `--color-warning` | 상태색 | `text-success` 등 |

> Tailwind 기본 색(`gray-800` 등)도 그대로 쓸 수 있다. 토큰은 **추가**되는 것이다.

## 4. 런타임 테마(지점별)와의 관계

서비스 화면(`/service`)은 **관리자 테마 설정**(지점별 글자색·강조색)이 토큰보다 **우선**한다.

- 관리자 → 테마 관리에서 저장한 값이 `--theme-text` / `--theme-primary` CSS 변수로 주입된다.
- CSS는 `var(--theme-primary, var(--color-brand))` 형태 — **지점 설정이 있으면 그 값, 없으면 토큰 기본값**.

즉 우선순위: **지점 테마(런타임) > 디자인 토큰(기본값)**. 디자인 토큰은 "기본 팔레트",
지점 테마는 "지점별 덮어쓰기"다. 관리자 화면(`/admin`)에는 지점 테마가 적용되지 않고 토큰만 쓴다.

주입되는 런타임 변수: `--theme-text`(글자색)·`--theme-primary`(강조색) 외에, 배경은 대기화면과
그 외 단계에 각각 지정한 wallpaper(cover, 나머지 단계는 화면별 → 공통 순)·미설정 화면은 `THEME_BG_COLOR` 단색,
버튼 탭 글로우는 `--btn-glow-color`/`--btn-glow-size`로 제어한다. 버튼 이미지는 `--theme-btn-{role}-image`와
고정 크기 `--btn-img-w/h`, 그리고 루트의 `data-btn-img|hidetext-{role}` 속성으로 표시 방식이 바뀐다(이미지가 있으면 항상 이미지만 표시)
(모두 관리자 **테마 관리**에서 지점별 설정 — SPEC §25).

## 5. 기타 토큰

| 토큰 | 유틸리티 |
|------|---------|
| `--font-sans` | `font-sans` (Pretendard 스택) |
| `--radius-card` | `rounded-card` |
| `--radius-btn` | `rounded-btn` |

## 6. 컴포넌트에서 쓰는 법 (권장)

앞으로 새 마크업은 raw 값 대신 시맨틱 유틸리티를 쓰면 일관성이 유지된다.

```tsx
// 이전: <div className="bg-[#2a2a2a] text-white">
// 이후:
<div className="bg-surface text-ink">…</div>
<button className="bg-brand text-ink rounded-btn">다음</button>
```

기존 컴포넌트(`src/components/service/*.tsx`)는 그대로 두어도 `--type-scale`·색 토큰이
반영된다(대부분 `text-*`/`text-white`를 쓰므로). 필요할 때 점진적으로 시맨틱 유틸리티로 옮기면 된다.

## 7. em 기반 큰 버튼

`globals.css`의 `.touch-button`(2em)·`.nav-button`(1.4em)은 `em` 단위라 `--type-scale`의
영향을 받지 않는다. 이 버튼들 크기는 해당 클래스에서 직접 조절한다.
`.nav-next-lg`("다음" 강조 버튼)는 primary 색상만 담당하는 클래스이고, **크기는
`sectionLayout.ts`의 `SERVICE_BIG_BUTTON_CLASS`**(Tailwind 유틸)로 정한다 — 촬영하기 버튼
(`CameraSection`)과 **같은 상수를 공유**해 두 버튼 크기가 항상 일치한다. 다음/촬영하기
버튼을 키우거나 줄이려면 이 상수 한 곳만 고치면 된다.

> 서비스 화면 **외곽 여백**(각 섹션 상/하 패딩·네비 버튼 코너 오프셋)은 토큰이 아니라
> 컴포넌트의 Tailwind 클래스로 관리한다 — 섹션 `pt-24 pb-52`, `ServiceNav` `bottom-16 left-16`
> (세로 모드 `pt-16 pb-40`, `bottom-10` 등).
