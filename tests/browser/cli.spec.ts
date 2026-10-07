import { openConversation } from "./workspace-helpers";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The `hallvi` request commands as a caller runs them: a separate process
// talking to the real app and worker over the loopback API. Only the model is
// scripted; `[mark]` makes it run one command in the repository workspace that
// leaves a file only if it really ran (tests/browser-fixtures).

const CLI = "scripts/cli.mjs";
/** Never the environment's controller: every call here names its own. */
function environment() {
  const env = { ...process.env };
  delete env.HALLVI_CONTROLLER_URL;
  // Playwright forces colors; the terminal can also set NO_COLOR. Keep the
  // CLI stderr assertion about the command, not Node's conflicting-env warning.
  delete env.FORCE_COLOR;
  return env;
}
function hallvi(...args: string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: environment(),
    timeout: 90_000,
  });
  return {
    code: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    json: () => JSON.parse(run.stdout),
  };
}

async function application(page: Page, name: string) {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: `https://github.com/qa/${name}-${randomUUID().slice(0, 8)}`,
    },
  });
  const view = await created.json();
  return { id: view.application.id as string, chatId: view.selectedChatId };
}

/** Where the scripted command leaves its mark, if it ran. */
const markOf = (state: string, request: string) =>
  join(
    dirname(state),
    `mark-${createHash("sha256").update(request).digest("hex").slice(0, 16)}`,
  );

async function sentBodies(page: Page, app: { id: string; chatId: string }) {
  const snapshot = await (
    await page.request.get(
      `/api/applications/${app.id}/chats/${app.chatId}/messages`,
    )
  ).json();
  return (snapshot.messages as { role: string; body: string }[])
    .filter((message) => message.role === "user")
    .map((message) => message.body);
}

test("apps, exec, wait and inspect agree on one request, and stopping the CLI leaves the work with Pi", async ({
  page,
  fixture,
}) => {
  test.setTimeout(240_000);
  const controller = fixture.url;
  const app = await application(page, "cli-journey");

  const listed = hallvi("apps", "--controller", controller, "--json");
  expect(listed.code, listed.stderr).toBe(0);
  expect(listed.json().controller).toBe(controller);
  expect(
    listed
      .json()
      .applications.find((each: { id: string }) => each.id === app.id),
  ).toMatchObject({ mainChatId: app.chatId, permissionMode: "pi-decides" });

  // One request, followed to the end, with exactly one JSON object and no
  // progress anywhere else.
  const request = "Check the application [mark] [long]";
  const exec = hallvi(
    "exec",
    app.id,
    request,
    "--controller",
    controller,
    "--json",
  );
  expect(exec.code, exec.stdout).toBe(0);
  expect(exec.stderr).toBe("");
  const done = exec.json();
  expect(done).toMatchObject({
    controller,
    applicationId: app.id,
    chatId: app.chatId,
    accepted: true,
    status: "completed",
    timedOut: false,
    answer: `[QA fixture reply] ${request}`,
    failure: null,
    attention: null,
    operation: { id: done.requestKey, requestKeys: [done.requestKey] },
  });
  expect(done.handle).toBe(
    `${controller}/api/applications/${app.id}/chats/${app.chatId}/requests/${done.requestKey}`,
  );
  const [call] = done.evidence;
  expect(call).toMatchObject({
    tool: "bash",
    target: "Repository workspace",
    status: "succeeded",
    outputTruncated: true,
  });
  expect(call.output).toHaveLength(2_000);
  expect(existsSync(markOf(fixture.state, request))).toBe(true);
  // What the command printed that looks like a credential never leaves.
  expect(exec.stdout).toContain("[REDACTED]");
  expect(exec.stdout).not.toContain("ghp_QA");

  // A fresh process finds the same request, operation and evidence.
  const waited = hallvi("wait", done.handle, "--json");
  expect(waited.code).toBe(0);
  expect(waited.json()).toMatchObject({
    status: "completed",
    operation: done.operation,
    evidence: done.evidence,
  });
  const inspected = hallvi(
    "inspect",
    app.id,
    "--controller",
    controller,
    "--json",
  );
  expect(inspected.code).toBe(0);
  expect(inspected.json()).toMatchObject({
    main: { chatId: app.chatId, status: "idle", worker: { alive: true } },
    executions: [
      { executionId: call.executionId, toolCallId: call.toolCallId },
    ],
  });
  const full = hallvi(
    "inspect",
    app.id,
    "--controller",
    controller,
    "--execution",
    call.executionId,
    "--json",
  ).json().execution;
  expect(full).toMatchObject({
    id: call.executionId,
    toolCallId: call.toolCallId,
    chatId: app.chatId,
    status: "succeeded",
  });
  expect(full.output.length).toBeGreaterThan(20_000);
  expect(full.output).not.toContain("ghp_QA");

  // Handed over and left: the request keeps going without anyone watching.
  const first = hallvi(
    "exec",
    app.id,
    "Take your time [slow-cancel]",
    "--bg",
    "--controller",
    controller,
    "--json",
  );
  expect(first.code).toBe(0);
  const handed = first.json();
  expect(handed).toMatchObject({
    accepted: true,
    background: true,
    status: null,
  });
  const glance = hallvi("wait", handed.handle, "--timeout", "0", "--json");
  expect(glance.code).toBe(3);
  expect(glance.json()).toMatchObject({ status: "working", timedOut: true });

  // A second request waits behind it, and the CLI following it is stopped.
  const following = spawn(
    process.execPath,
    [CLI, "exec", app.id, "And then this", "--controller", controller],
    { env: environment() },
  );
  let said = "";
  following.stderr.on("data", (chunk) => (said += chunk));
  await expect
    .poll(() => said, { timeout: 30_000 })
    .toContain("Waiting behind Pi's current work.");
  following.kill("SIGINT");
  const [code] = await new Promise<[number | null]>((done) =>
    following.once("close", (exit) => done([exit])),
  );
  expect(code).toBe(130);
  expect(said).toContain("stopping this command did not stop it");
  const second = /hallvi wait (\S+)/.exec(said)![1];

  // Both are read from fresh processes. Pi answered the second after the
  // work it waited behind, as work of its own: each has its own result.
  for (const [handle, said] of [
    [handed.handle, "Take your time [slow-cancel]"],
    [second, "And then this"],
  ]) {
    const result = hallvi("wait", handle, "--json");
    expect(result.code, result.stdout).toBe(0);
    const read = result.json();
    expect(read).toMatchObject({
      status: "completed",
      operation: { id: read.requestKey, requestKeys: [read.requestKey] },
      answer: `[QA fixture reply] ${said}`,
    });
  }

  // The answer to a send was lost after Pi took it; sending again under the
  // same key follows that one request, and another text under it is refused.
  const key = randomUUID();
  const lost = await page.request.post(
    `/api/applications/${app.id}/chats/${app.chatId}/messages`,
    { data: { message: "Only once", requestKey: key, origin: "cli" } },
  );
  expect(lost.status()).toBe(202);
  const again = hallvi(
    "exec",
    app.id,
    "Only once",
    "--request-key",
    key,
    "--controller",
    controller,
    "--json",
  );
  expect(again.code, again.stdout).toBe(0);
  expect(again.json()).toMatchObject({
    status: "completed",
    operation: { id: key },
  });
  const other = hallvi(
    "exec",
    app.id,
    "Something else",
    "--request-key",
    key,
    "--controller",
    controller,
    "--json",
  );
  expect(other.code).toBe(1);
  expect(other.json()).toMatchObject({
    accepted: false,
    error: { code: "refused" },
  });
  expect(await sentBodies(page, app)).toEqual([
    request,
    "Take your time [slow-cancel]",
    "And then this",
    "Only once",
  ]);

  // Named wrongly or not at all, nothing is contacted.
  for (const args of [[], ["--controller", "http://example.com"]]) {
    const refused = hallvi("apps", ...args, "--json");
    expect(refused.code).toBe(1);
    expect(refused.json().error.code).toMatch(/^controller-(missing|invalid)$/);
  }
});

test("in Always ask a CLI request stops at the approval with nothing run, and approving it in Hallvi lets the same request finish", async ({
  page,
  fixture,
}, testInfo) => {
  test.setTimeout(180_000);
  const controller = fixture.url;
  const app = await application(page, "cli-approval");
  expect(
    (
      await page.request.post(`/api/applications/${app.id}/operator`, {
        data: { permissionMode: "always-ask", host: null },
      })
    ).status(),
  ).toBe(200);

  // Both pages are already watching when the separate CLI process sends.
  // Approval and completion must arrive through SSE, without a reload.
  const observer = await page.context().newPage();
  await page.goto(`/applications/${app.id}`);
  await openConversation(page);
  await observer.goto(`/applications/${app.id}`);
  await openConversation(observer);
  const request = "Ask me first [mark]";
  const asked = hallvi(
    "exec",
    app.id,
    request,
    "--controller",
    controller,
    "--json",
  );
  expect(asked.code, asked.stdout).toBe(2);
  const waiting = asked.json();
  expect(waiting).toMatchObject({
    status: "waiting-for-approval",
    attention: {
      kind: "approval",
      page: `${controller}/applications/${app.id}?chat=${app.chatId}`,
    },
  });
  expect(waiting.evidence).toMatchObject([
    {
      executionId: waiting.attention.executionId,
      status: "awaiting-approval",
      exitCode: null,
      output: "",
      finishedAt: null,
    },
  ]);
  // The command has not run: it would have left its mark.
  expect(existsSync(markOf(fixture.state, request))).toBe(false);

  const sent = page.locator(`#hv-message-${waiting.requestKey}`);
  await expect(sent.locator(".hv-message-heading strong")).toHaveText("CLI");
  const approve = page.getByRole("button", { name: "Approve", exact: true });
  await expect(
    observer.getByRole("button", { name: "Approve", exact: true }),
  ).toBeVisible();
  await approve.click();
  // Taken once the card stops asking; then the caller follows it again.
  await expect(approve).toHaveCount(0);
  await expect(
    observer.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);

  const finished = hallvi("wait", waiting.handle, "--json");
  expect(finished.code, finished.stdout).toBe(0);
  expect(finished.json()).toMatchObject({
    status: "completed",
    operation: { id: waiting.requestKey },
    evidence: [
      { executionId: waiting.attention.executionId, status: "succeeded" },
    ],
  });
  expect(existsSync(markOf(fixture.state, request))).toBe(true);
  await expect(
    observer.getByText(`[QA fixture reply] ${request}`, { exact: true }),
  ).toBeVisible();
  await observer.close();

  // Where it came from is kept with the message, not in the page.
  await page.reload();
  await expect(sent.locator(".hv-message-heading strong")).toHaveText("CLI");
  await page.screenshot({
    path: testInfo.outputPath("cli-request-after-approval.png"),
    fullPage: true,
  });
});
