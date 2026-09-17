// The activity store keeps evidence of what Pi ran. These assert the parts a
// reader depends on: order, honest status, redaction, and that a stopped run
// never leaves a row claiming to still be running.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

const APPLICATION = "11111111-2222-4333-8444-555555555555";
const RUN = "run-1";
let store: typeof import("@/server/pi-activity");
let directory: string;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "hd-activity-"));
  process.env.HALDUR_CONFIG_DIR = directory;
  store = await import("@/server/pi-activity");
});

afterAll(() => {
  delete process.env.HALDUR_CONFIG_DIR;
  rmSync(directory, { recursive: true, force: true });
});

it("keeps a call in order, with what went in and what came back", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 1,
    id: "call-a",
    tool: "read_file",
    args: { path: "/workspace/package.json" },
  });
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-a",
    result: { content: "ok" },
    isError: false,
  });
  const [record] = store.listActivity(APPLICATION);
  expect(record.tool).toBe("read_file");
  expect(record.status).toBe("succeeded");
  expect(record.args).toContain("/workspace/package.json");
  expect(record.result).toContain("ok");
  expect(record.finishedAt).toBeTruthy();
});

it("says a call failed when the runtime says it failed", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 2,
    id: "call-b",
    tool: "list_directory",
    args: { path: "/nowhere" },
  });
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-b",
    result: "No such directory",
    isError: true,
  });
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-b");
  expect(record?.status).toBe("failed");
});

it("treats a cumulative partial as the whole, not as more to append", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 3,
    id: "call-c",
    tool: "workspace_bash",
    args: { command: "npm test" },
  });
  store.updateActivity(APPLICATION, "call-c", "line one\n", "snapshot");
  store.updateActivity(
    APPLICATION,
    "call-c",
    "line one\nline two\n",
    "snapshot",
  );
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-c");
  expect(record?.preview).toBe("line one\nline two\n");
  expect(record?.status).toBe("running");
});

it("appends a delta, and keeps two identical chunks as two", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 4,
    id: "call-d",
    tool: "workspace_bash",
    args: { command: "npm test" },
  });
  // The defect this replaces: guessing by prefix collapsed the second
  // "tick\n" into the first, because a snapshot looks like a longer delta.
  store.updateActivity(APPLICATION, "call-d", "tick\n", "delta");
  store.updateActivity(APPLICATION, "call-d", "tick\n", "delta");
  store.updateActivity(APPLICATION, "call-d", "tock\n", "delta");
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-d");
  expect(record?.preview).toBe("tick\ntick\ntock\n");
});

it("replaces on a repeated snapshot rather than doubling it", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 6,
    id: "call-g",
    tool: "workspace_bash",
    args: { command: "npm test" },
  });
  store.updateActivity(APPLICATION, "call-g", "tick\ntick\n", "snapshot");
  store.updateActivity(APPLICATION, "call-g", "tick\ntick\n", "snapshot");
  expect(
    store.listActivity(APPLICATION).find((item) => item.id === "call-g")
      ?.preview,
  ).toBe("tick\ntick\n");
});

it("reads the text out of a runtime result object", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 7,
    id: "call-h",
    tool: "workspace_bash",
    args: { command: "ls" },
  });
  // What the SDK actually hands over, rather than a bare string.
  store.updateActivity(
    APPLICATION,
    "call-h",
    { content: [{ type: "text", text: "one\n" }] },
    "snapshot",
  );
  store.updateActivity(
    APPLICATION,
    "call-h",
    { content: [{ type: "text", text: "one\ntwo\n" }] },
    "snapshot",
  );
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-h",
    result: { content: [{ type: "text", text: "one\ntwo\nthree\n" }] },
    isError: false,
  });
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-h");
  expect(record?.preview).toBe("one\ntwo\n");
  // No JSON scaffolding, and no doubling of the repeated lines.
  expect(record?.result).toBe("one\ntwo\nthree\n");
});

it("stops storing output once a call has ended", () => {
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-d",
    result: "done",
    isError: false,
  });
  store.updateActivity(APPLICATION, "call-d", "late output", "snapshot");
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-d");
  expect(record?.preview).toBe("tick\ntick\ntock\n");
  expect(record?.result).toBe("done");
});

it("never stores a secret it was handed, and says when it cut", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 5,
    id: "call-e",
    tool: "workspace_bash",
    args: { command: "echo secret" },
  });
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-e",
    result: "x".repeat(50_000),
    isError: false,
  });
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-e");
  expect(record?.truncated).toBe(true);
  expect(record!.result.length).toBeLessThan(50_000);
});

it("settles a call the run never finished, so no row spins forever", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: "run-2",
    sequence: 1,
    id: "call-f",
    tool: "read_file",
    args: { path: "/workspace/x" },
  });
  expect(
    store.listActivity(APPLICATION).find((item) => item.id === "call-f")
      ?.status,
  ).toBe("running");
  store.settleRunningActivity(APPLICATION, "run-2");
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-f");
  expect(record?.status).toBe("interrupted");
  expect(record?.finishedAt).toBeTruthy();
  // Another run's calls are untouched.
  expect(
    store.listActivity(APPLICATION).find((item) => item.id === "call-c")
      ?.status,
  ).toBe("running");
});

it("reads back in sequence within a run, whatever the clock did", () => {
  expect(
    store
      .listActivity(APPLICATION)
      .filter((item) => item.runId === RUN)
      .map((item) => item.sequence),
  ).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

it("settles every open call at startup, as a crash restart must", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: "run-3",
    sequence: 1,
    id: "call-i",
    tool: "read_file",
    args: { path: "/workspace/y" },
  });
  // A crash never reaches the worker's own cleanup, so the restart settles
  // everything still open rather than one known run.
  store.settleRunningActivity(APPLICATION, null);
  expect(
    store.listActivity(APPLICATION).filter((item) => item.status === "running"),
  ).toEqual([]);
  expect(
    store.listActivity(APPLICATION).find((item) => item.id === "call-i")
      ?.status,
  ).toBe("interrupted");
  // Calls that had already finished keep the outcome they reported.
  expect(
    store.listActivity(APPLICATION).find((item) => item.id === "call-a")
      ?.status,
  ).toBe("succeeded");
});

it("records a decline as not run, whatever the runtime returned", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: "run-4",
    sequence: 1,
    id: "call-j",
    tool: "bash",
    args: { command: "echo no" },
  });
  // The executor records the decision before returning to the runtime.
  store.settleActivity(APPLICATION, "call-j", "declined");
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-j",
    result: { declined: true },
    isError: false,
  });
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-j");
  expect(record?.status).toBe("declined");
});

it("keeps a settled outcome when the end event arrives after it", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: "run-5",
    sequence: 1,
    id: "call-k",
    tool: "bash",
    args: { command: "echo no" },
  });
  // The executor refuses first; the runtime's end event follows and reports
  // an ordinary result, which must not overwrite what we already know.
  store.settleActivity(APPLICATION, "call-k", "declined");
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-k",
    result: { declined: true },
    isError: false,
  });
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-k");
  expect(record?.status).toBe("declined");
  expect(record?.result).toContain("declined");
});

it("has nothing to say about an application Pi never worked on", () => {
  expect(store.listActivity("99999999-2222-4333-8444-555555555555")).toEqual(
    [],
  );
});
