import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
