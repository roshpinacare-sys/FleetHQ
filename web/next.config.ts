import type { NextConfig } from "next";

// Directory-style URLs (href="hub/" etc.) resolve to index.html on GitHub
// Pages, but Next.js static serving does not. These rewrites give the local
// preview the same behavior the production site has.
const consoleDirs = [
  "about",
  "deck",
  "hub",
  "hub/api",
  "hub/explainer",
  "onepager",
  "pitch",
  "receipts",
];

const dirIndexRewrites = consoleDirs.flatMap((d) => [
  { source: `/console/${d}`, destination: `/console/${d}/index.html` },
  { source: `/console/${d}/`, destination: `/console/${d}/index.html` },
]);

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return { beforeFiles: [], afterFiles: dirIndexRewrites, fallback: [] };
  },
};

export default nextConfig;
