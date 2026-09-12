import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionRecord } from "../../src/server/operator-execution";
import { test, expect } from "./fixtures";

test("server output streams inline, preserves reading position and stays readable on completion @journey-streaming-output", async ({
  page,
  fixture,
}) => {
  const created = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/streaming-output",
    },
  });
  expect(created.ok()).toBe(true);
  const result = await created.json();
  const appId = result.application?.id ?? result.id;
  const database = new Database(join(fixture.state, "qa.db"));
  const chat = database
    .prepare(
      "SELECT id FROM conversations WHERE application_id = ? AND kind = 'main'",
    )
    .get(appId) as { id: string };
  const now = new Date().toISOString();
  const userId = randomUUID();
  const runId = randomUUID();
  const executionId = randomUUID();
  database
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, body, source, created_at, updated_at) VALUES (?, ?, 'user', 'Show the command output.', 'user', ?, ?)",
    )
    .run(userId, chat.id, now, now);
  database
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, body, source, status, response_to, request_key, blocks, created_at, updated_at, started_at) VALUES (?, ?, 'assistant', 'Here is the command running on the server.', 'pi', 'running', ?, ?, ?, ?, ?, ?)",
    )
    .run(
      runId,
      chat.id,
      userId,
      randomUUID(),
      JSON.stringify([{ type: "execution", id: executionId }]),
      now,
      now,
      now,
    );
  database
    .prepare(
      "UPDATE conversations SET current_response_id = ?, status = 'working' WHERE id = ?",
    )
    .run(runId, chat.id);
  const directory = join(fixture.state, "operator", appId, "executions");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${executionId}.json`);
  let record: ExecutionRecord = {
    id: executionId,
    applicationId: appId,
    chatId: chat.id,
    runId,
    tool: "server_bash",
    target: "root@fixture-server:22",
    input: JSON.stringify({
      command: "docker compose up -d",
      timeoutSeconds: 120,
    }),
    mode: "pi-decides",
    status: "running",
    output: "",
    createdAt: now,
  };
  function update(next: Partial<ExecutionRecord>) {
    record = { ...record, ...next };
    writeFileSync(`${path}.tmp`, JSON.stringify(record));
    renameSync(`${path}.tmp`, path);
  }
  try {
    update({});
    await page.goto(`/applications/${appId}`);
    const card = page.locator(`#execution-${executionId}`);
    const output = card.getByRole("region", { name: "Command output" });
    await expect(output).toContainText("Waiting for command output");
    await expect(card.getByLabel("Command", { exact: true })).toHaveText(
      "docker compose up -d",
    );
    const lines = Array.from(
      { length: 60 },
      (_, i) => `Building layer ${i + 1}/60`,
    ).join("\n");
    update({ output: lines });
    await expect(output).toContainText("Building layer 60/60");
    await expect
      .poll(() =>
        output.evaluate(
          (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
        ),
      )
      .toBeLessThan(2);
    await output.evaluate((el) => (el.scrollTop = 80));
    await expect(
      card.getByRole("button", { name: "Follow latest", exact: true }),
    ).toBeVisible();
    update({ output: lines + "\nStarting web container…" });
    await expect(output).toContainText("Starting web container");
    await expect.poll(() => output.evaluate((el) => el.scrollTop)).toBe(80);
    await card
      .getByRole("button", { name: "Follow latest", exact: true })
      .click();
    await expect
      .poll(() =>
        output.evaluate(
          (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
        ),
      )
      .toBeLessThan(2);
    await page.screenshot({
      path: "tests/results/streaming-output-desktop.png",
    });
    update({
      status: "succeeded",
      exitCode: 0,
      finishedAt: new Date().toISOString(),
      output: record.output + "\nContainer web started.",
    });
    await expect(card).toContainText("Completed · exit 0");
    await expect(output).toBeVisible();
    await expect(output).toContainText("Container web started.");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await card.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(card).toContainText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "Container web started.",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "tests/results/streaming-output-mobile.png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await card.locator("summary").click();
    await expect(output).not.toBeVisible();
    await page.reload();
    await expect(card.locator("summary")).toHaveText("Command and output");
    await card.locator("summary").click();
    await expect(output).toContainText("Container web started.");
    update({
      status: "failed",
      exitCode: 3,
      output: JSON.stringify({ output: "missing service", exitCode: 3 }),
    });
    await expect(card).toContainText("failed · exit 3");
    await expect(output).toHaveText("missing service");
  } finally {
    database.close();
  }
});
