import { defineConfig } from "vitest/config";

if (process.env.SERVER_GUY_LIVE_JUDGE !== "1") {
  throw new Error("LLM judging uses your subscription. Opt in with SERVER_GUY_LIVE_JUDGE=1 and select one saved case.");
}
export default defineConfig({ test: { include: ["tests/evals/judge.eval.ts"], fileParallelism: false, maxWorkers: 1, testTimeout: 60_000 } });
