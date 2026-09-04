import { defineConfig } from "vitest/config";
import { judgeCaseKeys } from "./judge";

if (process.env.SERVER_GUY_LIVE_JUDGE !== "1") {
    throw new Error("LLM judging uses your subscription. Opt in with SERVER_GUY_LIVE_JUDGE=1 and select saved answers.");
}
const keys = judgeCaseKeys(process.env.PI_JUDGE_CASES, process.env.PI_JUDGE_CASE);
export default defineConfig({ test: { include: ["tests/evals/judge.eval.ts"], fileParallelism: false, maxWorkers: 1, testTimeout: Math.min(15 * 60_000, 60_000 * keys.length) } });
