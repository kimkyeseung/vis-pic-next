/**
 * 버튼 탭 시 외곽으로 퍼졌다 사라지는 글로우 펄스 — 서비스 화면(service/page.tsx)과
 * 관리자 테마 글로우 미리보기(ButtonGlowPreview)가 함께 쓴다.
 *
 * 글로우 색/세기는 버튼에 상속된 CSS 변수(--btn-glow-color/--btn-glow-size)에서 읽는다
 * (테마 설정에서 글로우를 끄면 변수가 주입되지 않아 아무것도 하지 않는다).
 * 버튼이 화면 전환으로 사라져도 끝까지 재생되도록 버튼과 독립된 요소를 만든다.
 */
export function spawnButtonGlow(btn: HTMLElement): void {
  const cs = getComputedStyle(btn);
  const glowColor = cs.getPropertyValue("--btn-glow-color").trim();
  const glowSize = cs.getPropertyValue("--btn-glow-size").trim();
  // 글로우 비활성(변수 미주입) 시 펄스도 없음
  if (!glowColor || !glowSize || glowSize === "0px") return;
  const rect = btn.getBoundingClientRect();
  // 테마 버튼 이미지가 있는 버튼은 사각 링 대신 **버튼 PNG 모양**으로 번지는 글로우를 붙인다 —
  // 글로우 색으로 칠한 요소를 버튼 이미지로 마스킹(투명 영역 제외)하고 번지며 사라지게 한다.
  // 서비스 루트(.service-theme) 안에 z-index:-1로 붙여 버튼 뒤(배경화면 위)에서 번지므로 이미지를 가리지 않고,
  // 루트는 단계가 바뀌어도 유지돼 화면 전환 후에도 끝까지 재생된다. 루트는 transform: scale()된 스테이지라
  // 좌표를 스테이지 px로 환산한다. 스타일·애니메이션은 CSS 파일에 두지 않고 인라인 + Web Animations로
  // 넣는다(CSS가 로드·갱신되지 않아도 효과가 사라지지 않게).
  const root = btn.closest(".service-theme") as HTMLElement | null;
  const bgImage = cs.backgroundImage;
  if (root && bgImage && bgImage.startsWith("url(")) {
    const rootRect = root.getBoundingClientRect();
    const scale = rootRect.width / root.offsetWidth || 1;
    const size = parseFloat(glowSize) || 24;
    // filter는 mask보다 먼저 적용되므로, 같은 요소에 blur와 mask를 함께 걸면 번진 부분이 PNG 모양으로 다시
    // 잘려 블러가 사라진다. 그래서 바깥 요소(shape)가 위치·blur·확대·투명도를 맡고, 안쪽 요소(fill)가 마스크를 맡는다.
    const shape = document.createElement("div");
    Object.assign(shape.style, {
      position: "absolute",
      pointerEvents: "none",
      zIndex: "-1",
      left: `${(rect.left - rootRect.left) / scale}px`,
      top: `${(rect.top - rootRect.top) / scale}px`,
      width: `${rect.width / scale}px`,
      height: `${rect.height / scale}px`,
    });
    const fill = document.createElement("div");
    Object.assign(fill.style, { width: "100%", height: "100%", backgroundColor: glowColor });
    for (const [k, v] of [["mask-image", bgImage], ["mask-size", "100% 100%"], ["mask-repeat", "no-repeat"]]) {
      fill.style.setProperty(k, v);
      fill.style.setProperty(`-webkit-${k}`, v);
    }
    shape.appendChild(fill);
    root.appendChild(shape);
    // 단색 버튼의 링(.btn-glow-ripple: blur=size, 번짐 2px→22px, 불투명도 .85→0, 0.55s)과 같은 느낌이 되도록
    // 맞춘다. box-shadow의 blur 반경 B는 filter: blur()의 표준편차 B/2에 해당하고, 번짐(spread)은 가로·세로로
    // 같은 거리만큼 커지도록 scaleX/scaleY를 따로 준다.
    const w = rect.width / scale;
    const h = rect.height / scale;
    const grow = (spread: number) => `scale(${1 + (2 * spread) / w}, ${1 + (2 * spread) / h})`;
    const anim = shape.animate(
      [
        { filter: `blur(${size / 2}px)`, transform: grow(2), opacity: 0.85 },
        { filter: `blur(${size / 2}px)`, transform: grow(22), opacity: 0 },
      ],
      { duration: 550, easing: "ease-out", fill: "forwards" },
    );
    const remove = () => shape.remove();
    anim.onfinish = remove;
    window.setTimeout(remove, 900);
    return;
  }
  const ring = document.createElement("div");
  ring.className = "btn-glow-ripple";
  ring.style.left = `${rect.left}px`;
  ring.style.top = `${rect.top}px`;
  ring.style.width = `${rect.width}px`;
  ring.style.height = `${rect.height}px`;
  ring.style.borderRadius = cs.borderRadius;
  ring.style.setProperty("--btn-glow-color", glowColor);
  ring.style.setProperty("--btn-glow-size", glowSize);
  document.body.appendChild(ring);
  const done = () => ring.remove();
  ring.addEventListener("animationend", done, { once: true });
  window.setTimeout(done, 900);
}
