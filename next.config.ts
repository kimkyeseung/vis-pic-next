import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Static export only for production (Tauri build)
  // Dev mode uses server mode for API routes
  ...(isProd && { output: "export" }),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
