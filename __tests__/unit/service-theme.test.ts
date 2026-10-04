import { describe, it, expect } from "vitest";
import { buildServiceTheme, pickOriented, type ServiceThemeInput } from "@/lib/serviceTheme";
import { parseButtonImageOptions } from "@/lib/deviceConfig";

const base = (over: Partial<ServiceThemeInput> = {}): ServiceThemeInput => ({
  step: "frame",
  portrait: false,
  textColor: "#ffffff",
  primaryColor: "#6c6fb4",
  bgColor: "#2a2a2a",
  glow: { enabled: true, color: "#6c6fb4", size: 28 },
  buttonTextColors: { capture: "#111111", next: undefined, payment: undefined },
  buttonOptions: parseButtonImageOptions({}),
  buttonImages: { capture: {}, next: {}, payment: {} },
  firstWallpaper: {},
  subWallpaper: {},
  pageWallpapers: {},
  ...over,
});
const css = (style: object) => style as Record<string, string | undefined>;

describe("pickOriented — 가로/세로 이미지 선택", () => {
  it("방향에 맞는 쪽을 고르고, 없으면 반대쪽으로 폴백", () => {
    expect(pickOriented({ landscape: "L", portrait: "P" }, true)).toBe("P");
    expect(pickOriented({ landscape: "L" }, true)).toBe("L");
    expect(pickOriented({ portrait: "P" }, false)).toBe("P");
    expect(pickOriented({}, false)).toBeNull();
  });
});

describe("buildServiceTheme — 서비스·관리자 미리보기 공용 테마 계산", () => {
  it("첫 화면은 첫 화면 배경화면, 나머지 단계는 화면별 → 공통 → 단색 순", () => {
    const wp = { firstWallpaper: { landscape: "first.png" }, subWallpaper: { landscape: "sub.png" }, pageWallpapers: { wp_frame: "frame.png" } };
    expect(css(buildServiceTheme(base({ ...wp, step: "start" })).style).backgroundImage).toBe("url(first.png)");
    expect(css(buildServiceTheme(base({ ...wp, step: "frame" })).style).backgroundImage).toBe("url(frame.png)");
    expect(css(buildServiceTheme(base({ ...wp, step: "select" })).style).backgroundImage).toBe("url(sub.png)");
    const none = css(buildServiceTheme(base({ step: "select" })).style);
    expect(none.backgroundImage).toBeUndefined();
    expect(none.backgroundColor).toBe("#2a2a2a");
  });

  it("버튼 이미지가 한쪽만 있어도 양쪽 화면에 쓰이고, 버튼 크기는 화면 방향을 따른다", () => {
    const input = base({ buttonImages: { capture: { landscape: "cap.png" }, next: {}, payment: {} } });
    const portrait = buildServiceTheme({ ...input, portrait: true });
    expect(css(portrait.style)["--theme-btn-capture-image"]).toBe("url(cap.png)");
    expect(css(portrait.style)["--btn-img-w"]).toBe("736px");
    expect(css(buildServiceTheme(input).style)["--btn-img-w"]).toBe("544px");
    expect(css(portrait.style)["--theme-btn-next-image"]).toBeUndefined();
  });

  it("이미지가 있는 버튼만 data-btn-img(항상 이미지만 표시)를 켜고, 옵션에 따라 hidetext를 붙인다", () => {
    const opts = parseButtonImageOptions({ THEME_BTN_HIDE_TEXT_CAPTURE: "1" });
    const { dataAttrs } = buildServiceTheme(base({
      buttonOptions: opts,
      buttonImages: { capture: { portrait: "p.png" }, next: { landscape: "n.png" }, payment: {} },
    }));
    expect(dataAttrs).toEqual({
      "data-btn-img-capture": "",
      "data-btn-hidetext-capture": "",
      "data-btn-img-next": "",
    });
  });

  it("글로우가 꺼지면 글로우 변수를 넣지 않고, 미설정 버튼 글자색도 넣지 않는다", () => {
    const style = css(buildServiceTheme(base({ glow: { enabled: false, color: "#fff", size: 10 } })).style);
    expect(style["--btn-glow-color"]).toBeUndefined();
    expect(style["--theme-btn-capture-text"]).toBe("#111111");
    expect(style["--theme-btn-next-text"]).toBeUndefined();
  });
});
