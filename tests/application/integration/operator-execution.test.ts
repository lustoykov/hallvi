import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import {
  claimNextPiRun,
  sendChatMessage,
  finishPiRun,
} from "../../../src/server/pi-runs";
import {
  decideExecution,
  executionContext,
  listExecutions,
  saveOperatorSettings,
} from "../../../src/server/operator-execution";
import { pushTestDatabase } from "../../test-database";
import type { PiRun } from "../../../src/server/types";
let root: string;
let run: PiRun;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "sg-operator-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});
beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
  const app = store.insertApplication({
    name: "Test",
    repositoryUrl: "https://github.com/test/app",
    repositoryOwner: "test",
    repositoryName: "app",
  });
  const chat = store.insertChat(app.id, "Main operator");
  sendChatMessage(app.id, chat.id, "Inspect this server", randomUUID());
  run = claimNextPiRun()!;
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const settings = (permissionMode: "always-ask" | "pi-decides" | "bypass") =>
  saveOperatorSettings(run.applicationId, { permissionMode, host: null });
it("pauses the actual call until approved, then records its output and failure code", async () => {
  settings("always-ask");
  const work = vi.fn(async () => ({ output: "missing service", exitCode: 3 }));
  const pending = executionContext(run).execute(
    "server_bash",
    "test host",
    "systemctl status app",
    work,
  );
  const [receipt] = listExecutions(run.applicationId);
  expect(receipt.status).toBe("awaiting-approval");
  expect(work).not.toHaveBeenCalled();
  expect(store.getChat(run.chatId)?.status).toBe("awaiting-approval");
  store.db().$client.close();
  delete globalThis.__serverGuyDb;
  expect(listExecutions(run.applicationId)[0].id).toBe(receipt.id);
  decideExecution(run.applicationId, receipt.id, true);
  expect(await pending).toEqual({ output: "missing service", exitCode: 3 });
  expect(work).toHaveBeenCalledOnce();
  expect(listExecutions(run.applicationId)[0]).toMatchObject({
    status: "failed",
    output: "missing service",
    exitCode: 3,
    approvalId: receipt.id,
  });
});
it("declining or cancelling an approval never starts the command", async () => {
  settings("always-ask");
  const work = vi.fn(async () => "should not run");
  const declined = executionContext(run).execute(
    "bash",
    "workspace",
    "example",
    work,
  );
  decideExecution(
    run.applicationId,
    listExecutions(run.applicationId)[0].id,
    false,
  );
  expect(await declined).toEqual({ declined: true });
  const controller = new AbortController();
  const cancelled = executionContext(run, controller.signal).execute(
    "bash",
    "workspace",
    "example",
    work,
  );
  controller.abort();
  await expect(cancelled).rejects.toThrow();
  expect(work).not.toHaveBeenCalled();
  expect(listExecutions(run.applicationId).map((item) => item.status)).toEqual([
    "declined",
    "interrupted",
  ]);
});
it("Pi decides runs ordinary commands and can ask; Bypass never pauses, even when Pi asks", async () => {
  settings("pi-decides");
  const context = executionContext(run);
  expect(
    await context.execute("bash", "workspace", "example", async () => "done"),
  ).toBe("done");
  const question = context.execute(
    "request_approval",
    "User decision",
    "Remove database?",
    async () => ({ approved: true }),
    true,
  );
  const receipt = listExecutions(run.applicationId).find(
    (item) => item.status === "awaiting-approval",
  )!;
  decideExecution(run.applicationId, receipt.id, true);
  await question;
  await context.execute(
    "bash",
    "workspace",
    "approved work",
    async () => "done",
  );
  expect(listExecutions(run.applicationId).at(-1)?.approvalId).toBe(receipt.id);
  settings("bypass");
  expect(
    await context.execute(
      "request_approval",
      "User decision",
      "An action",
      async () => "done",
      true,
    ),
  ).toBe("done");
  expect(
    listExecutions(run.applicationId).some(
      (item) => item.status === "awaiting-approval",
    ),
  ).toBe(false);
});
it("side chats cannot execute and a stopped turn's pending command cannot be approved or replayed", async () => {
  const side = store.insertChat(run.applicationId, "Explain");
  await expect(
    executionContext({ ...run, chatId: side.id }).execute(
      "bash",
      "workspace",
      "anything",
      async () => "bad",
    ),
  ).rejects.toThrow("read-only");
  settings("always-ask");
  const work = vi.fn(async () => "bad");
  const pending = executionContext(run).execute(
    "bash",
    "workspace",
    "example",
    work,
  );
  const receipt = listExecutions(run.applicationId)[0];
  finishPiRun(run.id, "interrupted", "Stopped");
  expect(listExecutions(run.applicationId)[0].status).toBe("interrupted");
  expect(() => decideExecution(run.applicationId, receipt.id, true)).toThrow(
    "no longer",
  );
  await expect(pending).rejects.toThrow("stopped");
  expect(work).not.toHaveBeenCalled();
});
