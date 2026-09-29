import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import {
  decideExecution,
  executionContext,
  listExecutions,
  saveOperatorSettings,
  settleRunningExecutions,
} from "../../../src/server/operator-execution";
import { pushTestDatabase } from "../../test-database";
import {} from "../../../src/server/pi-activity";
let root: string;
/** The conversation whose tools are being called. */
let run: { applicationId: string; chatId: string };
const scope = (chatId = run.chatId) => ({
  applicationId: run.applicationId,
  chatId,
});
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-operator-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
});
beforeEach(async () => {
  for (const application of await store.listApplications())
    await store.deleteApplication(application.id);
  const app = await store.insertApplication({
    name: "Test",
    repositoryUrl: "https://github.com/test/app",
    repositoryOwner: "test",
    repositoryName: "app",
  });
  const chat = await store.insertChat(app.id, "Main operator");
  run = { applicationId: app.id, chatId: chat.id };
});
afterAll(async () => {
  await store.closeDatabase();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const settings = async (
  permissionMode: "always-ask" | "pi-decides" | "bypass",
) =>
  await saveOperatorSettings(run.applicationId, { permissionMode, host: null });
async function receiptFor(toolCallId: string) {
  return vi.waitFor(async () => {
    const receipt = (await listExecutions(run.applicationId)).find(
      (record) => record.toolCallId === toolCallId,
    );
    expect(receipt).toBeDefined();
    return receipt!;
  });
}
it("pauses the actual call until approved, then records its output and failure code", async () => {
  await settings("always-ask");
  const work = vi.fn(async () => ({ output: "missing service", exitCode: 3 }));
  const pending = executionContext(scope()).execute(
    "server_bash",
    "test host",
    "systemctl status app",
    work,
    false,
    "host-call",
  );
  const receipt = await receiptFor("host-call");
  expect(receipt.status).toBe("awaiting-approval");
  expect(work).not.toHaveBeenCalled();
  // The record keeps the id Pi gave the call; that is what places it.
  expect(receipt.toolCallId).toBe("host-call");
  await store.closeDatabase();
  expect((await listExecutions(run.applicationId))[0].id).toBe(receipt.id);
  await decideExecution(run.applicationId, receipt.id, true);
  expect(await pending).toEqual({ output: "missing service", exitCode: 3 });
  expect(work).toHaveBeenCalledOnce();
  expect((await listExecutions(run.applicationId))[0]).toMatchObject({
    status: "failed",
    output: "missing service",
    exitCode: 3,
    approvalId: receipt.id,
  });
});
it("declining or cancelling an approval never starts the command", async () => {
  await settings("always-ask");
  const work = vi.fn(async () => "should not run");
  const declined = executionContext(scope()).execute(
    "bash",
    "workspace",
    "example",
    work,
    false,
    "declined-call",
  );
  await decideExecution(
    run.applicationId,
    (await receiptFor("declined-call")).id,
    false,
  );
  expect(await declined).toEqual({ declined: true });
  // The SDK completes normally after a decline, so Pi's history says the call
  // came back. This record is what says nothing ran, under Pi's own call id.
  expect((await listExecutions(run.applicationId))[0]).toMatchObject({
    toolCallId: "declined-call",
    status: "declined",
  });
  const controller = new AbortController();
  // Pi's own signal for the call: what its abort reaches a tool through.
  const cancelled = executionContext(scope()).execute(
    "bash",
    "workspace",
    "example",
    work,
    false,
    "cancelled-call",
    controller.signal,
  );
  await receiptFor("cancelled-call");
  const cancellation = expect(cancelled).rejects.toThrow();
  controller.abort();
  await cancellation;
  expect(work).not.toHaveBeenCalled();
  expect(
    (await listExecutions(run.applicationId)).map((item) => item.status),
  ).toEqual(["declined", "interrupted"]);
});
it("Pi decides runs ordinary commands and can ask; Bypass never pauses, even when Pi asks", async () => {
  await settings("pi-decides");
  const context = executionContext(scope());
  expect(
    await context.execute(
      "bash",
      "workspace",
      "example",
      async () => "done",
      false,
      "ordinary-call",
    ),
  ).toBe("done");
  const question = context.execute(
    "request_approval",
    "User decision",
    "Remove database?",
    async () => ({ approved: true }),
    true,
    "approval-call",
  );
  const receipt = await receiptFor("approval-call");
  await decideExecution(run.applicationId, receipt.id, true);
  await question;
  await context.execute(
    "bash",
    "workspace",
    "approved work",
    async () => "done",
    false,
    "approved-call",
  );
  expect((await listExecutions(run.applicationId)).at(-1)?.approvalId).toBe(
    receipt.id,
  );
  await settings("bypass");
  expect(
    await context.execute(
      "request_approval",
      "User decision",
      "An action",
      async () => "done",
      true,
      "bypass-call",
    ),
  ).toBe("done");
  expect(
    (await listExecutions(run.applicationId)).some(
      (item) => item.status === "awaiting-approval",
    ),
  ).toBe(false);
});
it("side chats cannot execute and a stretch that ended leaves its pending command unapprovable", async () => {
  const side = await store.insertChat(run.applicationId, "Explain");
  await expect(
    executionContext(scope(side.id)).execute(
      "bash",
      "workspace",
      "anything",
      async () => "bad",
      false,
      "side-call",
    ),
  ).rejects.toThrow("read-only");
  await settings("always-ask");
  const stopped = new AbortController();
  const work = vi.fn(async () => "bad");
  const pending = executionContext(scope()).execute(
    "bash",
    "workspace",
    "example",
    work,
    false,
    "stopped-call",
    stopped.signal,
  );
  const receipt = await receiptFor("stopped-call");
  const rejected = expect(pending).rejects.toThrow();
  // What the owner of the session does when a stretch ends or a worker starts.
  await settleRunningExecutions(run.applicationId, run.chatId);
  stopped.abort();
  expect((await listExecutions(run.applicationId))[0].status).toBe(
    "interrupted",
  );
  await expect(
    decideExecution(run.applicationId, receipt.id, true),
  ).rejects.toThrow("no longer");
  await rejected;
  expect(work).not.toHaveBeenCalled();
});
