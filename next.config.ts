import type { NextConfig } from "next";

import { adoptLegacyEnvironment } from "./scripts/legacy-names.mjs";

// Settings written as SERVER_GUY_* before the rename still apply here, where
// Next has already loaded `.env` files, and in every process started from it.
adoptLegacyEnvironment();

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
