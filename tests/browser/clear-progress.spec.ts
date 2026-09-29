import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionRecord } from "../../src/server/operator-execution";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

// The shipping UI and evidence join, with synthetic Pi history. This proves
// presentation and refresh, not that a real model chooses useful findings.
test.use({ scriptedWorker: true, video: "on" });

test("current work keeps findings in order and waits for the owner", async ({
  page,
  fixture,
}, testInfo) => {
  test.setTimeout(120_000);
  const now = "2026-09-29T12:10:00.000Z";
  const started = "2026-09-29T12:08:00.000Z";
  await page.clock.setFixedTime(new Date(now));
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/clear-progress",
    },
  });
  expect(created.ok()).toBe(true);
  const view = await created.json();
  const appId = view.application.id;
  const chatId = view.selectedChatId;
  const finding =
    "The Compose file includes PostgreSQL. The app also needs your external API key before it can start.";
  let found = false;
  let needsInput = false;
  let execution: ExecutionRecord = {
    id: randomUUID(),
    applicationId: appId,
    chatId,
    runId: chatId,
    toolCallId: "read-compose",
    tool: "server_bash",
    target: "root@203.0.113.7:22",
    input: JSON.stringify({
      intent: "Inspect application startup configuration",
      command: "cat compose.yaml",
    }),
    mode: "always-ask",
    status: "awaiting-approval",
    output: "",
    createdAt: started,
  };
  const directory = join(fixture.state, "operator", appId, "executions");
  mkdirSync(directory, { recursive: true });
  function saveExecution() {
    const recordPath = join(directory, `${execution.id}.json`);
    writeFileSync(`${recordPath}.tmp`, JSON.stringify(execution));
    renameSync(`${recordPath}.tmp`, recordPath);
  }
  saveExecution();
  const closeWorker = await scriptWorker(fixture, () => {
    const { replyId, messages } = exchange(
      chatId,
      "Inspect this application and prepare its image.",
      {
        body: needsInput ? finding : "",
        status: needsInput ? "completed" : "running",
        startedAt: started,
      },
    );
    return {
      status: needsInput ? "idle" : "working",
      messages: messages.map((message) => ({ ...message, createdAt: started })),
      calls: {
        "read-compose": {
          replyId,
          sequence: 1,
          tool: "server_bash",
          args: {
            intent: "Inspect application startup configuration",
            command: "cat compose.yaml",
          },
          at: started,
          ...(found
            ? {
                result: {
                  text: "services: web (requires EXTERNAL_API_KEY), postgres",
                  failed: false,
                  at: started,
                },
              }
            : {}),
        },
        ...(found
          ? {
              "build-image": {
                replyId,
                sequence: 3,
                tool: execution.tool,
                args: JSON.parse(execution.input),
                at: started,
                ...(needsInput
                  ? { result: { text: "Image built", failed: false, at: now } }
                  : {}),
              },
            }
          : {}),
      },
      said: found ? [{ replyId, sequence: 2, text: finding, at: started }] : [],
    };
  });
  const changed = () =>
    closeWorker.changed({ kind: "chat", applicationId: appId, chatId });
  try {
    // This is the disposable fixture's setting, never an owner's account.
    const settings = await page.request.get(
      `/api/applications/${appId}/operator`,
    );
    const { settings: current } = await settings.json();
    expect(
      (
        await page.request.post(`/api/applications/${appId}/operator`, {
          data: { ...current, permissionMode: "always-ask" },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(`/applications/${appId}`);
    const line = page.locator(".hv-still-working");
    await expect(line).toContainText("Waiting for you to approve a command");
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Decline", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(line).toContainText("Waiting for you to approve a command");
    await page.screenshot({
      path: testInfo.outputPath("approval-desktop.png"),
    });

    // Scripted transitions stand in for an approval and tool results. They
    // exercise the shipping projection, not real execution or model timing.
    execution = { ...execution, status: "running" };
    saveExecution();
    changed();
    await expect(line).toContainText(
      "Running: Inspect application startup configuration · On the server · 203.0.113.7",
    );
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("action-desktop.png") });

    execution = {
      ...execution,
      status: "succeeded",
      output: "services: web (requires EXTERNAL_API_KEY), postgres",
      exitCode: 0,
      finishedAt: now,
    };
    saveExecution();
    found = true;
    execution = {
      ...execution,
      id: randomUUID(),
      toolCallId: "build-image",
      input: JSON.stringify({
        intent: "Build the application image",
        command: "docker compose build web",
      }),
      status: "awaiting-approval",
      output: "",
      exitCode: undefined,
      finishedAt: undefined,
    };
    saveExecution();
    changed();
    await expect(page.getByText(finding, { exact: true })).toHaveCount(1);
    await expect(line).toContainText("Waiting for you to approve a command");
    // A separate approval belongs to this second execution.
    execution = { ...execution, status: "running" };
    saveExecution();
    changed();
    await expect(line).toContainText(
      "Running: Build the application image · On the server · 203.0.113.7",
    );
    await page.screenshot({ path: testInfo.outputPath("finding-desktop.png") });
    await page.reload();
    await expect(page.getByText(finding, { exact: true })).toHaveCount(1);
    await expect(line).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await line.scrollIntoViewIfNeeded();
    const workBounds = await line.boundingBox();
    const composerBounds = await page.locator(".hv-composer").boundingBox();
    expect(workBounds).not.toBeNull();
    expect(composerBounds).not.toBeNull();
    expect(workBounds!.y).toBeGreaterThanOrEqual(0);
    expect(workBounds!.y + workBounds!.height).toBeLessThanOrEqual(
      composerBounds!.y,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("finding-narrow.png") });
    execution = {
      ...execution,
      createdAt: "2026-09-29T12:03:20.000Z",
      outputAt: "2026-09-29T12:06:10.000Z",
    };
    saveExecution();
    changed();
    await expect(line).toContainText("6m 40s · quiet for 3m 50s");
    await line.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("quiet-narrow.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });

    execution = {
      ...execution,
      status: "succeeded",
      output: "Image built",
      exitCode: 0,
      finishedAt: now,
    };
    saveExecution();
    needsInput = true;
    mkdirSync(join(fixture.state, "secrets"), { recursive: true });
    writeFileSync(
      join(fixture.state, "secrets", `${appId}.json`),
      JSON.stringify([
        {
          name: "EXTERNAL_API_KEY",
          why: "The application needs your API key before it can start.",
          requestedAt: now,
          establishedAt: null,
          origin: "owner",
          revision: 0,
          sealed: null,
        },
      ]),
    );
    changed();
    await page.reload();
    await expect(line).toHaveCount(0);
    await expect(
      page.getByText("EXTERNAL_API_KEY", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(finding, { exact: true })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("input-desktop.png") });
  } finally {
    await closeWorker();
  }
});
