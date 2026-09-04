import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import * as database from "../../src/server/db";
import * as github from "../../src/server/github";
import { getPhaseOneOperatorView, sendChatMessage } from "../../src/server/phase-one";
import * as pi from "../../src/server/pi";
import { readPiConfiguration, savePiConfiguration } from "../../src/server/pi-configuration";
import type { PhaseOneOperatorView, PiTurnResult } from "../../src/server/types";
import { pushTestDatabase } from "../test-database";
import { checkPhaseOne } from "./check-phase-one";
import { evalRepeatCount, phaseOneCases, type PhaseOneEvalCase } from "./phase-one-cases";

// This file is deliberately .eval.ts, excluded by Vitest's normal test discovery.
// The separate config must also opt in before any setup or provider work runs.
if (process.env.SERVER_GUY_LIVE_EVALS !== "1") throw new Error("Explicit live-eval opt-in is required.");
const repeats = evalRepeatCount(process.env.PI_EVAL_REPEATS);
const sourceFiles = [
  "src/server/pi.ts", "src/server/phase-one.ts", "src/server/phase-one-spec.ts",
  "src/server/pi-configuration.ts", "src/server/db.ts", "src/server/db-schema.ts",
  "tests/evals/phase-one-cases.ts", "tests/evals/check-phase-one.ts", "tests/evals/phase-one.eval.ts", "tests/evals/vitest.config.ts", "package-lock.json",
];
const fingerprints = () => Object.fromEntries(sourceFiles.map((file) => [file,
  createHash("sha256").update(readFileSync(file)).digest("hex"),
]));
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const results: Array<{
  caseId: string; repetition: number; rubric: string; elapsedMs: number;
  input: Parameters<typeof pi.askPi>[0] | null;
  reply: PiTurnResult | null; before: PhaseOneOperatorView; after: PhaseOneOperatorView;
  checks: Record<string, boolean>; error: string | null;
  outcome: "checks-passed" | "checks-failed" | "run-error" | "not-run";
  semanticReview: "pending" | "not-applicable";
}> = [];
let runDirectory: string | undefined;
let metadata: Record<string, unknown>;
let initialFingerprints: ReturnType<typeof fingerprints>;
let blockedByRuntime = false;

beforeAll(() => {
  const chosen = readPiConfiguration();
  if (!chosen || chosen.providerId !== "openai-codex" || chosen.credentialType !== "oauth") {
    throw new Error("Configure ChatGPT subscription access in Server Guy before running live Pi evals.");
  }
  if ((process.env.PI_EVAL_EXPECTED_MODEL && chosen.modelId !== process.env.PI_EVAL_EXPECTED_MODEL)
    || (process.env.PI_EVAL_EXPECTED_EFFORT && chosen.reasoningEffort !== process.env.PI_EVAL_EXPECTED_EFFORT)) {
    throw new Error("Model preferences changed after confirmation. Reload and confirm the intended settings.");
  }
  if (globalThis.__serverGuyDb) throw new Error("The live eval worker must not already own an application database.");
  const state = mkdtempSync(join(tmpdir(), "server-guy-pi-eval-"));
  const artifacts = resolve("tests/results/evals");
  mkdirSync(artifacts, { recursive: true, mode: 0o700 });
  runDirectory = mkdtempSync(join(artifacts, `${new Date().toISOString().replaceAll(":", "-")}-`));
  initialFingerprints = fingerprints();
  metadata = {
    suite: "phase-one-decisions-v1", startedAt: new Date().toISOString(), repeats,
    plannedCases: phaseOneCases.length * repeats,
    provider: chosen.providerId, model: chosen.modelId, effort: chosen.reasoningEffort,
    piVersion: JSON.parse(readFileSync("package.json", "utf8")).dependencies["@earendil-works/pi-coding-agent"],
    commit: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain")),
    sourceFingerprints: initialFingerprints, database: join(state, "eval.db"),
    coverage: "Real Pi adapter and SQLite transaction; synthetic application/context; no GitHub calls. Only accepted tool proposals are captured, not a full SDK trace.",
  };
  vi.stubEnv("SERVER_GUY_DB_PATH", join(state, "eval.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(state, "config"));
  vi.stubEnv("PI_CODING_AGENT_DIR", join(state, "pi"));
  mkdirSync(join(state, "pi"), { mode: 0o700 });
  // Snapshot preferences, not tokens. The existing Pi credential file remains
  // the auth source; normal SDK token refresh may update it after this opt-in.
  savePiConfiguration(chosen);
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
  vi.spyOn(github, "inspectGithubRepository").mockImplementation(() => {
    throw new Error("GitHub access is outside this eval's scope.");
  });
  console.log(`Live Pi eval: ${phaseOneCases.length * repeats} sequential turns, ${chosen.modelId}/${chosen.reasoningEffort}. Results: ${runDirectory}`);
});

function seed(scenario: PhaseOneEvalCase, repetition: number) {
  const name = `${scenario.id}-${repetition}`;
  const application = database.insertApplication({
    name, repositoryUrl: `https://github.com/qa/${name}`, repositoryOwner: "qa", repositoryName: name,
    environment: "production", approvalMode: "always-ask", approvalScope: "Current application launch",
  });
  const workspace = database.insertWorkspace(application.id);
  const chat = database.insertChat(workspace.id, "Launch Brief", true);
  if (scenario.existingPriority) {
    const source = database.insertMessage(chat.id, "user", scenario.existingPriority, "user");
    database.insertMessage(chat.id, "assistant", "Your launch priority is recorded.", "pi");
    database.insertDecision({
      applicationId: application.id, sourceMessageId: source.id, kind: "launch-priority",
      label: "Additional launch priority", value: scenario.existingPriority,
    });
  }
  return getPhaseOneOperatorView(application.id, chat.id);
}

for (let repetition = 1; repetition <= repeats; repetition++) {
  for (const scenario of phaseOneCases) {
    it(`${scenario.id} / repetition ${repetition}`, async (context) => {
      const before = seed(scenario, repetition);
      const record: typeof results[number] = {
        caseId: scenario.id, repetition, rubric: scenario.rubric, elapsedMs: 0,
        input: null, reply: null, before, after: before, checks: {}, error: null,
        outcome: "not-run", semanticReview: "not-applicable",
      };
      results.push(record);
      if (blockedByRuntime) {
        record.error = "Not run after an earlier Pi runtime/provider failure; no automatic retries or model fallback.";
        context.skip();
        return;
      }
      // Pass-through spy: the actual adapter executes. No fake model response.
      const turn = vi.spyOn(pi, "askPi");
      const start = performance.now();
      try {
        record.after = await sendChatMessage(before.application!.id, before.selectedChatId!, scenario.message);
        record.input = turn.mock.calls[0]?.[0] ?? null;
        record.reply = await turn.mock.results[0].value;
        record.checks = checkPhaseOne(scenario, before, record.after, record.reply!,
          before.decisions.map((decision) => database.getDecision(decision.id)));
        record.outcome = Object.values(record.checks).every(Boolean) ? "checks-passed" : "checks-failed";
        record.semanticReview = "pending";
      } catch (error) {
        record.input = turn.mock.calls[0]?.[0] ?? null;
        // A successful adapter result can still be rejected by the transaction.
        record.reply = await turn.mock.results[0]?.value?.catch(() => null) ?? null;
        record.after = getPhaseOneOperatorView(before.application!.id, before.selectedChatId!);
        record.outcome = "run-error";
        blockedByRuntime = error instanceof pi.PiUnavailableError;
        // Never serialize credential-bearing SDK/provider errors into reports.
        record.error = blockedByRuntime ? "Pi runtime/provider failure; remaining turns stopped. Check Settings/account access before an explicit rerun."
          : "The turn failed before acceptance. Compare the captured proposal and unchanged/persisted state.";
      } finally {
        record.elapsedMs = Math.round(performance.now() - start);
        turn.mockRestore();
      }
      expect(record.error, scenario.id).toBeNull();
      expect(Object.entries(record.checks).filter(([, pass]) => !pass).map(([name]) => name), scenario.id).toEqual([]);
    });
  }
}

afterAll(() => {
  if (!runDirectory) return;
  const sourcesUnchanged = JSON.stringify(initialFingerprints) === JSON.stringify(fingerprints());
  const report = {
    ...metadata, finishedAt: new Date().toISOString(), sourcesUnchanged,
    automatedPasses: results.filter((r) => r.outcome === "checks-passed").length,
    recordedCases: results.length, humanReview: "pending — automated passes are not semantic acceptance", results,
  };
  writeFileSync(join(runDirectory, "results.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  const quote = (text: string) => text.split("\n").map((line) => `> ${line}`).join("\n");
  const review = [
    "# Phase 1 live Pi review", "", `Model: ${metadata.model} · ${metadata.effort}. Automated: ${report.automatedPasses}/${results.length}.`,
    "", "Human review is pending. Judge meaning against each rubric, not exact wording. Mark pass/fail and explain why; assistant suggestions are not human sign-off.",
    ...results.flatMap((r) => [
      "", `## ${r.caseId} / repetition ${r.repetition}`, "", `Automated outcome: ${r.outcome}`, "",
      `Expected meaning: ${r.rubric}`, "", "User:", quote(r.input?.userMessage ?? "Not run"), "",
      "Assistant:", quote(r.reply?.message ?? r.error ?? "No accepted reply"), "",
      "Accepted tool proposals:", "```json", JSON.stringify(r.reply?.decisionProposals ?? [], null, 2), "```", "",
      "Human verdict: pending. Reason:",
    ]),
  ].join("\n");
  writeFileSync(join(runDirectory, "review.md"), review, { mode: 0o600 });
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  console.log(`Saved ${runDirectory}/review.md. Human meaning review is still pending.`);
  expect(sourcesUnchanged, "source must remain frozen during a baseline").toBe(true);
});
