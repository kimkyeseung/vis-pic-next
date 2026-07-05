import type { NextConfig } from "next";

// 빌드 시점(KST)이 번들에 상수로 인라인된다. dev 모드에서는 dev 서버 시작 시각.
const buildDate = new Date().toLocaleString("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },
  output: "standalone",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  outputFileTracingIncludes: {
    "/api/gif/create": ["./node_modules/gif-encoder-2/**/*"],
    "/api/gif/create-layout": ["./node_modules/gif-encoder-2/**/*"],
  },
};

export default nextConfig;
