import { describe, it, expect } from "vitest";
import { resolveImageSrc } from "@/lib/imageUrl";

describe("resolveImageSrc", () => {
  const base = "https://cdn.example.com/images";

  it("순수 파일명은 baseUrl 뒤에 붙인다", () => {
    expect(resolveImageSrc("photo.jpg", base)).toBe("https://cdn.example.com/images/photo.jpg");
  });

  it("완전한 http(s) URL은 그대로", () => {
    expect(resolveImageSrc("https://other.com/a.png", base)).toBe("https://other.com/a.png");
    expect(resolveImageSrc("http://other.com/a.png", base)).toBe("http://other.com/a.png");
  });

  it("data URI·blob은 그대로 (미리보기 목업 대응, split로 깨지지 않음)", () => {
    const dataUri = "data:image/jpeg;base64,/9j/4AAQ==";
    expect(resolveImageSrc(dataUri, base)).toBe(dataUri);
    expect(resolveImageSrc("blob:http://x/abc", base)).toBe("blob:http://x/abc");
  });

  it("절대경로(/…)는 그대로", () => {
    expect(resolveImageSrc("/static/a.png", base)).toBe("/static/a.png");
  });

  it("실수로 붙은 경로 프리픽스는 basename만 취한다", () => {
    expect(resolveImageSrc("static/images/a.jpg", base)).toBe("https://cdn.example.com/images/a.jpg");
  });

  it("빈 값은 빈 문자열", () => {
    expect(resolveImageSrc("", base)).toBe("");
  });
});
