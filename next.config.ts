import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The reference screenshots are product surfaces; keep the dev badge out.
  devIndicators: false,
  // Bundle Pi AI's public imports with the web routes: loading its external
  // entry adds measurable first-opening cost. The full coding SDK stays native.
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "better-sqlite3",
    "node-pty",
    "ws",
  ],
};

export default nextConfig;
