import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./fixtures";

test("Pi text stays once in order through completion and reload @journey-streaming-output", async ({
  page,
  fixture,
}) => {
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/transcript",
    },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const appId = created.application?.id ?? created.id;
  const db = new Database(join(fixture.state, "qa.db"));
  const { id: chatId } = db
    .prepare(
      "SELECT id FROM conversations WHERE application_id = ? AND kind = 'main'",
    )
    .get(appId) as { id: string };
  const runId = randomUUID();
  const now = new Date().toISOString();
  const body = "Now checking persistence.";
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, body, source, status, created_at, updated_at) VALUES (?, ?, 'assistant', ?, 'pi', 'running', ?, ?)",
  ).run(runId, chatId, body, now, now);
  const dir = join(fixture.state, "operator", appId, "activity");
  mkdirSync(dir, { recursive: true });
  const save = (id: string, value: object) => {
    const path = join(dir, `${id}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(value));
    renameSync(`${path}.tmp`, path);
  };
  const record = {
    kind: "tool",
    id: "read-package",
    applicationId: appId,
    runId,
    sequence: 1,
    tool: "read",
    args: JSON.stringify({ path: "package.json" }),
    preview: "",
    result: "{}",
    status: "succeeded",
    truncated: false,
    startedAt: now,
    finishedAt: now,
  };
  save(record.id, record);
  try {
    await page.goto(`/applications/${appId}`);
    const message = page.locator(`#hv-message-${runId}`);
    await expect(message.getByText(body, { exact: true })).toHaveCount(1);
    // What the group line actually says. It counts and pluralises — "1 file
    // read" — and this asked for "File reads", so the one spec guarding the
    // transcript has been red on main rather than guarding anything.
    const group = message.getByRole("button", { name: /1 file read/ });
    await expect(group).toBeVisible();
    await group.click();
    await expect(
      message.getByText("package.json", { exact: true }),
    ).toBeVisible();
    const text = await message.innerText();
    expect(text.indexOf("package.json")).toBeLessThan(text.indexOf(body));
    save("said", {
      ...record,
      kind: "message",
      id: "said",
      sequence: 2,
      text: body,
    });
    await expect(message.getByText(body, { exact: true })).toHaveCount(1);
    db.prepare(
      "UPDATE messages SET status = 'completed', revision = revision + 1 WHERE id = ?",
    ).run(runId);
    await page.reload();
    await expect(message.getByText(body, { exact: true })).toHaveCount(1);
    await expect(group).toBeVisible();
    await page.screenshot({ path: "tests/results/pi-transcript-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(message.getByText(body, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({ path: "tests/results/pi-transcript-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    await expect(
      page.getByText("Connect an application server to use Terminal."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Application server terminal" }),
    ).toHaveCount(0);
  } finally {
    db.close();
  }
});
