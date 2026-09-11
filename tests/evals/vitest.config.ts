import { defineConfig } from "vitest/config";
import { evalRepeatCount, selectEvalCases } from "./cases";

if (process.env.SERVER_GUY_LIVE_EVALS !== "1") {
  throw new Error(
    "Live evals use your configured Pi subscription. Opt in with SERVER_GUY_LIVE_EVALS=1 npm run eval:pi. Ordinary npm test never calls the provider.",
  );
}
evalRepeatCount(process.env.PI_EVAL_REPEATS);
selectEvalCases(process.env.PI_EVAL_CASES);

export default defineConfig({
  test: {
    include: ["tests/evals/pi.eval.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    // One turn usually fits in a minute; compaction cases take longer.
    testTimeout: 600_000,
    hookTimeout: 30_000,
  },
});
