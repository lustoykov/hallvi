import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The reference screenshots are product surfaces; keep the dev badge out.
  devIndicators: false,
  serverExternalPackages: [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
    "better-sqlite3",
    "node-pty",
    "ws",
  ],
};

export default nextConfig;
