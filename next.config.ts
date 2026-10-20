import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // 预览洁净法：开发指示徽章（"Compiling…"）遮盖页脚与观察条 — 关闭。
  devIndicators: false,
};

export default nextConfig;
