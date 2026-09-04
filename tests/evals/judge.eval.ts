import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, vi } from "vitest";
import { configuredPiRuntime, createPiCatalog, readPiConfiguration, savePiConfiguration } from "../../src/server/pi-configuration";
import { validatePiSelection } from "../../src/server/pi-models";
import { findCase, readJson, saveReview } from "../dashboard/results";
import { judgeAnswer, judgeCaseKeys, judgeSelectedAnswers, JUDGE_PROMPT_VERSION } from "./judge";
import { phaseOneCases } from "./phase-one-cases";

if (process.env.SERVER_GUY_LIVE_JUDGE !== "1") throw new Error("Explicit LLM-judge opt-in required");
it("reviews selected saved answers without rerunning Server Guy", async () => {
  try {
    const root = process.cwd();
    const run = process.env.PI_JUDGE_RUN!;
    const hash = process.env.PI_JUDGE_HASH!;
    const keys = judgeCaseKeys(process.env.PI_JUDGE_CASES, process.env.PI_JUDGE_CASE);
    for (const key of keys) findCase(root, run, hash, key); // Whole selection checked before authentication.
    const configuration = readPiConfiguration();
    if (!configuration || configuration.providerId !== "openai-codex" || configuration.credentialType !== "oauth") throw new Error("Subscription setup required");
    const sdk = await import("@earendil-works/pi-coding-agent");
    const selected = { ...configuration, modelId: process.env.PI_JUDGE_MODEL || configuration.modelId,
      reasoningEffort: (process.env.PI_JUDGE_EFFORT || configuration.reasoningEffort) as typeof configuration.reasoningEffort };
    validatePiSelection(await createPiCatalog(sdk), selected); // Before provider authentication.
    const temporary = mkdtempSync(join(tmpdir(), "server-guy-judge-"));
    vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(temporary, "config"));
    vi.stubEnv("PI_CODING_AGENT_DIR", join(temporary, "pi"));
    savePiConfiguration(selected); // Preferences only; never copies OAuth tokens.
    const runtime = await configuredPiRuntime(sdk);
    await judgeSelectedAnswers(keys, async (key) => {
      const { record } = findCase(root, run, hash, key);
      // Grade against the casebook's current wording when the case still exists; the judgment records the wording it used.
      const rubric = phaseOneCases.find((item) => item.id === record.caseId)?.rubric ?? record.rubric;
      const result = await judgeAnswer(sdk, runtime, { ...record, rubric });
      saveReview(root, run, hash, key, { ...result, type: "llm", rubric, model: selected.modelId, effort: selected.reasoningEffort,
        promptVersion: JUDGE_PROMPT_VERSION, piVersion: readJson(join(root, "package.json")).dependencies["@earendil-works/pi-coding-agent"] });
      console.log("Advisory LLM verdict saved. Human verdict and original results unchanged.");
    });
  } catch {
    // SDK failures may contain credentials. Never print the raw error/cause.
    throw new Error("Judge did not complete the selection. Earlier verdicts remain saved; remaining answers were not judged. Check results and subscription access; no retry or fallback was attempted.");
  } finally { vi.unstubAllEnvs(); }
});
