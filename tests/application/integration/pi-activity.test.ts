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
  directory = mkdtempSync(join(tmpdir(), "sg-activity-"));
  process.env.SERVER_GUY_CONFIG_DIR = directory;
  store = await import("@/server/pi-activity");
});

afterAll(() => {
  delete process.env.SERVER_GUY_CONFIG_DIR;
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
  store.updateActivity(APPLICATION, "call-c", "line one\n");
  store.updateActivity(APPLICATION, "call-c", "line one\nline two\n");
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-c");
  expect(record?.preview).toBe("line one\nline two\n");
  expect(record?.status).toBe("running");
});

it("appends a partial that is a delta rather than the whole", () => {
  store.startActivity({
    applicationId: APPLICATION,
    runId: RUN,
    sequence: 4,
    id: "call-d",
    tool: "workspace_bash",
    args: { command: "npm test" },
  });
  store.updateActivity(APPLICATION, "call-d", "first\n");
  store.updateActivity(APPLICATION, "call-d", "second\n");
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-d");
  expect(record?.preview).toBe("first\nsecond\n");
});

it("stops storing output once a call has ended", () => {
  store.endActivity({
    applicationId: APPLICATION,
    id: "call-d",
    result: "done",
    isError: false,
  });
  store.updateActivity(APPLICATION, "call-d", "late output");
  const record = store
    .listActivity(APPLICATION)
    .find((item) => item.id === "call-d");
  expect(record?.preview).toBe("first\nsecond\n");
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
  expect(record?.status).toBe("failed");
  expect(record?.finishedAt).toBeTruthy();
  // Another run's calls are untouched.
  expect(
    store.listActivity(APPLICATION).find((item) => item.id === "call-c")
      ?.status,
  ).toBe("running");
});

it("reads back in the order the calls were made", () => {
  expect(
    store
      .listActivity(APPLICATION)
      .filter((item) => item.runId === RUN)
      .map((item) => item.sequence),
  ).toEqual([1, 2, 3, 4, 5]);
});

it("has nothing to say about an application Pi never worked on", () => {
  expect(store.listActivity("99999999-2222-4333-8444-555555555555")).toEqual(
    [],
  );
});
