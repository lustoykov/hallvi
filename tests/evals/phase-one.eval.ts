import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { shutdownTracing } from "../../src/server/tracing";

import * as database from "../../src/server/db";
import * as github from "../../src/server/github";
import * as githubApi from "../../src/server/github-api";
import { getPhaseOneOperatorView } from "../../src/server/phase-one";
import * as pi from "../../src/server/pi";
import { executePiTurn } from "../execute-pi-turn";
import { chatRunSnapshot } from "../../src/server/pi-runs";
import {
  readPiConfiguration,
  savePiConfiguration,
} from "../../src/server/pi-configuration";
import type {
  PhaseOneOperatorView,
  PiTurnResult,
} from "../../src/server/types";
import { pushTestDatabase } from "../test-database";
import {
  checkPhaseOne,
  checkPhaseThree,
  checkPhaseTwo,
} from "./check-phase-one";
import { evalRepeatCount, selectPhaseOneCases } from "./phase-one-cases";
import { createEvalScratch, releaseEvalScratch } from "./scratch";
import { seedPhaseOneEvalCase } from "./seed-phase-one";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  nativeEvalCompaction,
  nativeEvalEvidence,
  seedNativeScenario,
  seedStaleStatusHistory,
} from "./native-scenarios";

// This file is deliberately .eval.ts, excluded by Vitest's normal test
// discovery.
// The separate config must also opt in before any setup or provider work runs.
if (process.env.SERVER_GUY_LIVE_EVALS !== "1")
  throw new Error("Explicit live-eval opt-in is required.");
const repeats = evalRepeatCount(process.env.PI_EVAL_REPEATS);
const selectedCases = selectPhaseOneCases(process.env.PI_EVAL_CASES);
const sourceFiles = [
  "src/server/pi.ts",
  "src/server/pi-runs.ts",
  "src/server/pi-run-context.ts",
  "src/server/pi-sessions.ts",
  "src/server/pi-decisions.ts",
  "src/server/pi-status.ts",
  "src/server/pi-worker.ts",
  "src/server/pi-repository.ts",
  "src/server/pi-contract.ts",
  "tests/execute-pi-turn.ts",
  "src/server/phase-one.ts",
  "src/server/phase-one-spec.ts",
  "src/server/phase-two.ts",
  "src/server/phase-two-spec.ts",
  "src/server/phase-three.ts",
  "src/server/phase-three-spec.ts",
  "src/server/pi-conformance.ts",
  "src/server/conformance-brief.ts",
  "src/server/conformance-definition.ts",
  "src/server/source-proposal.ts",
  "src/server/acceptance-checks.ts",
  "src/server/application-profile.ts",
  "src/server/application-contract.ts",
  "src/server/operator-view.ts",
  "src/server/workspaces.ts",
  "src/server/pi-configuration.ts",
  "src/server/db.ts",
  "src/server/db-schema.ts",
  "src/server/github-connection.ts",
  "src/server/github-api.ts",
  "tests/evals/phase-one-cases.ts",
  "tests/evals/seed-phase-one.ts",
  "tests/evals/seed-phase-two.ts",
  "tests/evals/seed-phase-three.ts",
  "tests/fixtures/fake-executor.ts",
  "tests/fixtures/conformance-builder.ts",
  "tests/fixtures/repositories.ts",
  "tests/fixtures/contract-builder.ts",
  "tests/evals/native-scenarios.ts",
  "tests/evals/check-phase-one.ts",
  "tests/evals/phase-one.eval.ts",
  "tests/evals/vitest.config.ts",
  "package-lock.json",
];
const fingerprints = () =>
  Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      createHash("sha256").update(readFileSync(file)).digest("hex"),
    ]),
  );
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
const results: Array<{
  caseId: string;
  repetition: number;
  rubric: string;
  elapsedMs: number;
  piCalls: number;
  input: Parameters<typeof pi.askPi>[0] | null;
  reply: PiTurnResult | null;
  before: PhaseOneOperatorView;
  after: PhaseOneOperatorView;
  checks: Record<string, boolean>;
  error: string | null;
  outcome: "checks-passed" | "checks-failed" | "run-error" | "not-run";
  semanticReview: "pending" | "not-applicable";
  nativeEvidence?: ReturnType<typeof nativeEvalEvidence>;
}> = [];
let runDirectory: string | undefined;
let state: string | undefined;
let metadata: Record<string, unknown>;
let initialFingerprints: ReturnType<typeof fingerprints>;
let blockedByRuntime = false;

beforeAll(() => {
  const chosen = readPiConfiguration();
  if (
    !chosen ||
    chosen.providerId !== "openai-codex" ||
    chosen.credentialType !== "oauth"
  ) {
    throw new Error(
      "Configure ChatGPT subscription access in Server Guy before running live Pi evals.",
    );
  }
  if (
    (process.env.PI_EVAL_EXPECTED_MODEL &&
      chosen.modelId !== process.env.PI_EVAL_EXPECTED_MODEL) ||
    (process.env.PI_EVAL_EXPECTED_EFFORT &&
      chosen.reasoningEffort !== process.env.PI_EVAL_EXPECTED_EFFORT)
  ) {
    throw new Error(
      "Model preferences changed after confirmation. Reload and confirm the intended settings.",
    );
  }
  if (globalThis.__serverGuyDb)
    throw new Error(
      "The live eval worker must not already own an application database.",
    );
  state = createEvalScratch("pi-eval");
  const artifacts = resolve("tests/results/evals");
  mkdirSync(artifacts, { recursive: true, mode: 0o700 });
  runDirectory = mkdtempSync(
    join(artifacts, `${new Date().toISOString().replaceAll(":", "-")}-`),
  );
  initialFingerprints = fingerprints();
  metadata = {
    suite: "phase-one-v2",
    startedAt: new Date().toISOString(),
    repeats,
    caseIds: selectedCases.map((scenario) => scenario.id),
    plannedCases: selectedCases.length * repeats,
    provider: chosen.providerId,
    model: chosen.modelId,
    effort: chosen.reasoningEffort,
    piVersion: JSON.parse(readFileSync("package.json", "utf8")).dependencies[
      "@earendil-works/pi-coding-agent"
    ],
    commit: git("rev-parse", "HEAD"),
    dirty: Boolean(git("status", "--porcelain")),
    sourceFingerprints: initialFingerprints,
    database: join(state, "eval.db"),
    databaseRetained: false,
    coverage:
      "Real Pi adapter, native session/tool loop and SQLite transaction; synthetic application/context; no GitHub calls. Application Contract cases seed a Phase 2 workspace with a synthetic inspection and saved file reads of a fixture repository, so read_repository_file is served from records and the GitHub API is blocked. Native scenarios seed synthetic previous exchanges/usage and lower keepRecentTokens to exercise real auto-compaction with a small fixture. Application status cases seed real records and, for stale-history cases, an outdated synthetic get_application_status exchange; the live lookup reads local records only and is recorded as native tool evidence. Conformance Result cases run the fake runner over the fixture tree served in-process, with the archive download blocked like the API. This is not a production context-window benchmark.",
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
  // Phase 2 reads are served from seeded Observations; an unseeded path is a
  // failed read, never a network request with the fixture token.
  vi.spyOn(githubApi, "githubJson").mockImplementation(async () => {
    throw new githubApi.GithubAccessError(
      "GitHub access is outside this eval's scope.",
    );
  });
  // The archive download behind a preview's base tree is blocked the same
  // way; Conformance Result cases serve that tree from the fixture.
  vi.spyOn(githubApi, "githubArchive").mockImplementation(async () => {
    throw new githubApi.GithubAccessError(
      "GitHub access is outside this eval's scope.",
    );
  });
  console.log(
    `Live Pi eval: ${selectedCases.length * repeats} sequential turns, ${chosen.modelId}/${chosen.reasoningEffort}. Results: ${runDirectory}`,
  );
});

for (let repetition = 1; repetition <= repeats; repetition++) {
  for (const scenario of selectedCases) {
    it(`${scenario.id} / repetition ${repetition}`, async (context) => {
      let before = seedPhaseOneEvalCase(scenario, repetition);
      const record: (typeof results)[number] = {
        caseId: scenario.id,
        repetition,
        rubric: scenario.rubric,
        elapsedMs: 0,
        piCalls: 0,
        input: null,
        reply: null,
        before,
        after: before,
        checks: {},
        error: null,
        outcome: "not-run",
        semanticReview: "not-applicable",
      };
      results.push(record);
      if (blockedByRuntime) {
        record.error =
          "Not run after an earlier Pi runtime/provider failure; no automatic retries or model fallback.";
        context.skip();
        return;
      }
      let restoreSettings: (() => void) | undefined;
      if (scenario.nativeScenario) {
        before = await seedNativeScenario(
          scenario,
          before,
          readPiConfiguration()!,
        );
        record.before = before;
        record.after = before;
        const inMemory = SettingsManager.inMemory.bind(SettingsManager);
        const settingsSpy = vi
          .spyOn(SettingsManager, "inMemory")
          .mockImplementation(() =>
            inMemory({ compaction: nativeEvalCompaction }),
          );
        restoreSettings = () => settingsSpy.mockRestore();
      }
      if (scenario.staleHistory) {
        before = await seedStaleStatusHistory(
          scenario,
          before,
          readPiConfiguration()!,
        );
        record.before = before;
        record.after = before;
      }
      // Pass-through spy: the actual adapter executes. No fake model response.
      const turn = vi.spyOn(pi, "askPi");
      const start = performance.now();
      try {
        record.after = await executePiTurn(
          before.application!.id,
          before.selectedChatId!,
          scenario.message,
        );
        record.input = turn.mock.calls[0]?.[0] ?? null;
        record.reply = await turn.mock.results[0].value;
        record.checks = checkPhaseOne(
          scenario,
          before,
          record.after,
          record.reply!,
          before.decisions.map((decision) => database.getDecision(decision.id)),
        );
        if (scenario.phaseTwo)
          Object.assign(
            record.checks,
            checkPhaseTwo(scenario, before, record.after),
          );
        if (scenario.phaseThree)
          Object.assign(
            record.checks,
            checkPhaseThree(scenario, before, record.after),
          );
        if (scenario.nativeScenario || scenario.statusLookup) {
          record.nativeEvidence = nativeEvalEvidence(
            before.application!.id,
            before.selectedChatId!,
            record.input!.run.id,
            {
              decisions: Boolean(scenario.nativeScenario),
              status: scenario.statusLookup,
            },
          );
          Object.assign(record.checks, record.nativeEvidence.checks);
          if (
            scenario.nativeScenario &&
            scenario.nativeScenario !== "cancelled"
          ) {
            record.checks[
              "native compaction ran after fresh context was appended"
            ] = record.nativeEvidence.compactions.length > 0;
          }
        }
        record.outcome = Object.values(record.checks).every(Boolean)
          ? "checks-passed"
          : "checks-failed";
        record.semanticReview = "pending";
      } catch (error) {
        record.input = turn.mock.calls[0]?.[0] ?? null;
        // A successful adapter result can still be rejected by the transaction.
        record.reply =
          (await turn.mock.results[0]?.value?.catch(() => null)) ?? null;
        record.after = getPhaseOneOperatorView(
          before.application!.id,
          before.selectedChatId!,
        );
        record.outcome = "run-error";
        blockedByRuntime = error instanceof pi.PiUnavailableError;
        // Never serialize credential-bearing SDK/provider errors into reports.
        record.error = blockedByRuntime
          ? "Pi runtime/provider failure; remaining turns stopped. Check Settings/account access before an explicit rerun."
          : "The accepted message is saved, but the attempt failed. No Decisions were committed from it.";
      } finally {
        record.piCalls = chatRunSnapshot(
          before.application!.id,
          before.selectedChatId!,
        ).runs.reduce((sum, run) => sum + run.piCalls, 0);
        record.elapsedMs = Math.round(performance.now() - start);
        turn.mockRestore();
        restoreSettings?.();
      }
      expect(record.error, scenario.id).toBeNull();
      expect(
        Object.entries(record.checks)
          .filter(([, pass]) => !pass)
          .map(([name]) => name),
        scenario.id,
      ).toEqual([]);
    });
  }
}

afterAll(async () => {
  await shutdownTracing();
  // The scratch database is released even when setup failed before a run
  // directory existed.
  if (!runDirectory) {
    releaseEvalScratch(state);
    return;
  }
  const sourcesUnchanged =
    JSON.stringify(initialFingerprints) === JSON.stringify(fingerprints());
  const report = {
    ...metadata,
    finishedAt: new Date().toISOString(),
    sourcesUnchanged,
    automatedPasses: results.filter((r) => r.outcome === "checks-passed")
      .length,
    recordedCases: results.length,
    humanReview: "pending — automated passes are not semantic acceptance",
    results,
  };
  writeFileSync(
    join(runDirectory, "results.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  const quote = (text: string) =>
    text
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  const review = [
    "# Phase 1 live Pi review",
    "",
    `Model: ${metadata.model} · ${metadata.effort}. Automated: ${report.automatedPasses}/${results.length}.`,
    "",
    "Human review is pending. Judge meaning against each rubric, not exact wording. Mark pass/fail and explain why; assistant suggestions are not human sign-off.",
    ...results.flatMap((r) => [
      "",
      `## ${r.caseId} / repetition ${r.repetition}`,
      "",
      `Automated outcome: ${r.outcome}`,
      "",
      `Expected meaning: ${r.rubric}`,
      "",
      "User:",
      quote(r.input?.userMessage ?? "Not run"),
      "",
      "Assistant:",
      quote(r.reply?.message ?? r.error ?? "No accepted reply"),
      "",
      "Accepted tool proposals:",
      "```json",
      JSON.stringify(r.reply?.decisionProposals ?? [], null, 2),
      "```",
      "",
      "Human verdict: pending. Reason:",
    ]),
  ].join("\n");
  writeFileSync(join(runDirectory, "review.md"), review, { mode: 0o600 });
  // Reports are on disk: close SQLite, then delete the scratch directory.
  // tests/results/ keeps everything reviewable.
  releaseEvalScratch(state);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  console.log(
    `Saved ${runDirectory}/review.md. Human meaning review is still pending.`,
  );
  expect(sourcesUnchanged, "source must remain frozen during a baseline").toBe(
    true,
  );
});
