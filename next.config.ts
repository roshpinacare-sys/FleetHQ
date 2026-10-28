import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // P0: TypeScript errors fail the build again — typecheck is a gate, not a suggestion.
  reactStrictMode: false,
  // 预览洁净法：开发指示徽章（"Compiling…"）遮盖页脚与观察条 — 关闭。
  devIndicators: false,
};

export default nextConfig;
