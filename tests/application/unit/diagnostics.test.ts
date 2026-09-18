import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  diagnosticFailure,
  diagnosticLogPath,
  diagnosticMetadata,
  logDiagnostic,
  LOG_ARCHIVES,
  LOG_MAX_BYTES,
} from "../../../src/server/diagnostics";
import type { PiRun } from "../../../src/server/types";

const mocks = vi.hoisted(() => ({ failWrites: false, failRotation: false }));
vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  return {
    ...real,
    renameSync: (...args: Parameters<typeof real.renameSync>) => {
      if (mocks.failRotation)
        throw Object.assign(new Error("read only"), { code: "EACCES" });
      return real.renameSync(...args);
    },
    appendFileSync: (...args: Parameters<typeof real.appendFileSync>) => {
      if (mocks.failWrites)
        throw Object.assign(new Error("read only"), { code: "EROFS" });
      return real.appendFileSync(...args);
    },
  };
});
let root: string;
const run = {
  id: "run",
  chatId: "chat",
  applicationId: "app",
  retryOfId: "prior",
} as PiRun;
beforeEach(() => {
  mocks.failWrites = false;
  mocks.failRotation = false;
  root = fs.mkdtempSync(join(tmpdir(), "hallvi-log-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "synthetic.db"));
  vi.stubEnv("HALLVI_LOG_DIR", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it("uses a blank override as the default and writes selected NDJSON fields with private modes", () => {
  expect(diagnosticLogPath()).toBe(join(root, "diagnostics", "replies.ndjson"));
  logDiagnostic("step.finished", run, {
    step: "model",
    stepId: "model:1",
    outcome: "completed",
    durationMs: 4,
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    metadata: {
      inputTokens: 2,
      outputTokens: 3,
      model: "fixture",
      raw: "secret-canary",
      arguments: { password: "secret-canary" },
    },
    failure: diagnosticFailure(
      Object.assign(new Error("secret-canary"), { status: 429 }),
    ),
  });
  const text = fs.readFileSync(diagnosticLogPath(), "utf8");
  expect(text.endsWith("\n")).toBe(true);
  expect(text).not.toContain("secret-canary");
  expect(JSON.parse(text)).toMatchObject({
    event: "step.finished",
    runId: "run",
    retryOfId: "prior",
    stepId: "model:1",
    metadata: { inputTokens: 2, outputTokens: 3, model: "fixture" },
    errorCategory: "rate-limit",
    httpStatus: 429,
  });
  expect(fs.statSync(diagnosticLogPath()).mode & 0o777).toBe(0o600);
  expect(fs.statSync(join(root, "diagnostics")).mode & 0o777).toBe(0o700);
});

it("bounds file retention to the active file and three rotated archives", () => {
  const path = diagnosticLogPath();
  fs.mkdirSync(join(root, "diagnostics"));
  for (let i = 0; i < 6; i++) {
    fs.writeFileSync(
      path,
      JSON.stringify({ synthetic: i, padding: "x".repeat(LOG_MAX_BYTES) }) +
        "\n",
    );
    logDiagnostic("reply.accepted", run);
  }
  expect(fs.readdirSync(join(root, "diagnostics")).sort()).toEqual([
    "replies.ndjson",
    "replies.ndjson.1",
    "replies.ndjson.2",
    "replies.ndjson.3",
  ]);
  expect(fs.statSync(path).size).toBeLessThan(LOG_MAX_BYTES);
  expect(
    JSON.parse(fs.readFileSync(`${path}.${LOG_ARCHIVES}`, "utf8")).synthetic,
  ).toBe(3);
  expect(JSON.parse(fs.readFileSync(path, "utf8")).event).toBe(
    "reply.accepted",
  );
});

it("swallows read-only filesystem and serialization failures without stdout fallback", () => {
  const stdout = vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.failWrites = true;
  expect(() => logDiagnostic("reply.accepted", run)).not.toThrow();
  expect(() =>
    logDiagnostic("step.finished", run, {
      metadata: {
        get model() {
          throw new Error("secret-canary");
        },
      },
    }),
  ).not.toThrow();
  expect(stdout).not.toHaveBeenCalled();
});

it("selects safe categories and numeric status while dropping arbitrary errors, identifiers and metadata", () => {
  expect(
    diagnosticFailure({
      cause: { code: "SQLITE_BUSY", message: "secret-canary" },
    }),
  ).toEqual({ category: "storage" });
  expect(diagnosticFailure({ code: "ECONNRESET" })).toEqual({
    category: "network",
  });
  expect(diagnosticFailure({ status: 401 })).toEqual({
    category: "authentication",
    httpStatus: 401,
  });
  expect(
    diagnosticFailure({ status: "401", message: "secret-canary" }),
  ).toEqual({ category: "unknown" });
  expect(
    diagnosticFailure({
      get status() {
        throw new Error("secret-canary");
      },
    }),
  ).toEqual({ category: "unknown" });
  expect(
    diagnosticMetadata({
      inputTokens: -1,
      outputTokens: Infinity,
      model: "sk-secret",
      provider: "secret-token",
      raw: "secret-canary",
    }),
  ).toEqual({});
  logDiagnostic("step.finished", run, {
    stepId: "secret-canary",
    traceId: "secret-canary",
    spanId: "secret-canary",
  });
  expect(fs.readFileSync(diagnosticLogPath(), "utf8")).not.toContain(
    "secret-canary",
  );
});

it("retains the existing file if rotation fails and does not fail the caller", () => {
  fs.mkdirSync(join(root, "diagnostics"));
  const existing = "x".repeat(LOG_MAX_BYTES);
  fs.writeFileSync(diagnosticLogPath(), existing);
  mocks.failRotation = true;
  expect(() => logDiagnostic("reply.accepted", run)).not.toThrow();
  expect(fs.readFileSync(diagnosticLogPath(), "utf8")).toBe(existing);
});
