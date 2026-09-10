import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // The reference screenshots are product surfaces; keep the dev badge out.
  devIndicators: false,
  serverExternalPackages: [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
    "better-sqlite3",
  ],
  // PROTOTYPE (claude/architecture-directions): the architecture directions
  // read the live record from the main checkout's dev server with GET
  // requests only, so this worktree never needs credentials or host access.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const origin = process.env.SG_LIVE_ORIGIN ?? "http://127.0.0.1:3270";
    return [{ source: "/live-record/:path*", destination: `${origin}/api/:path*` }];
  },
};

export default nextConfig;
