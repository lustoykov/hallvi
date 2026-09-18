import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { join } from "node:path";
import { test, expect } from "./fixtures";

test("contextual questions preserve a draft across tab closure and return to their destination", async ({
  page,
  context,
  fixture,
}) => {
  test.setTimeout(180_000);
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/experience-continuity",
    },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const path = `/applications/${created.application.id}`;
  await page.goto(path);
  const draft = "Keep this question exactly as I wrote it.";
  await page.getByRole("textbox", { name: "Message Hallvi" }).fill(draft);
  await page
    .getByRole("navigation", { name: "Application workspace" })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await expect(
    page.getByText("No deployment is recorded yet", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose a server", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message Hallvi" }),
  ).toHaveValue(draft);
  await expect(page.getByText("About Overview", { exact: true })).toBeVisible();
  // Closing the actual tab distinguishes durable drafts from sessionStorage.
  await page.close();
  const returned = await context.newPage();
  try {
    await returned.goto(`${fixture.url}${path}`);
    const composer = returned.getByRole("textbox", { name: "Message Hallvi" });
    await expect(composer).toHaveValue(draft);
    await expect(
      returned.getByText("About Overview", { exact: true }),
    ).toBeVisible();
    await returned
      .getByRole("button", { name: "Remove Overview context" })
      .click();
    await expect(composer).toHaveValue(draft);
    await expect(composer).toBeFocused();
    await composer.fill("");
    await returned
      .getByRole("navigation", { name: "Application workspace" })
      .getByRole("button", { name: "Backups", exact: true })
      .click();
    await returned.getByRole("button", { name: /^Ask Hallvi to look/ }).click();
    await expect(
      returned.getByText("About Backups", { exact: true }),
    ).toBeVisible();
    const question = await composer.inputValue();
    expect(question).toContain("copying this application's data");
    await returned.setViewportSize({ width: 390, height: 844 });
    const sendBounds = await returned
      .getByRole("button", { name: "Send", exact: true })
      .boundingBox();
    expect(sendBounds).not.toBeNull();
    expect(sendBounds!.x + sendBounds!.width).toBeLessThanOrEqual(390);
    expect(
      await returned.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await returned.getByRole("button", { name: "Send", exact: true }).click();
    await expect(composer).toBeFocused();
    await expect(
      returned.getByText(`[QA fixture reply] ${question}`, { exact: true }),
    ).toBeVisible();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: fixture.url,
    });
    const copy = returned.getByRole("button", {
      name: "Copy reply",
      exact: true,
    });
    await expect(copy).toHaveCount(1);
    await copy.click();
    await expect(
      returned.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    expect(await returned.evaluate(() => navigator.clipboard.readText())).toBe(
      `[QA fixture reply] ${question}`,
    );
    await returned.reload();
    await expect(composer).toHaveValue("");
    // Clipboard denial is recoverable, not an unhandled browser exception.
    await returned.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async () => {
          throw new Error("Clipboard unavailable");
        },
      });
    });
    await copy.click();
    await expect(
      returned.getByRole("status").filter({ hasText: "Copy failed" }),
    ).toBeVisible();
    await returned
      .getByRole("button", { name: "Return to Backups", exact: true })
      .click();
    await expect(
      returned.getByRole("heading", { name: "Backups", exact: true }),
    ).toBeVisible();
    await expect(
      returned
        .getByRole("navigation", { name: "Application workspace" })
        .getByRole("button", { name: "Backups", exact: true }),
    ).toBeFocused();
  } finally {
    await returned.close();
  }
});

test("Send next waits behind active work and Stop cancels its waiting follow-up", async ({
  page,
  fixture,
}) => {
  test.setTimeout(180_000);
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/experience-queue",
    },
  });
  expect(response.ok()).toBe(true);
  const view = await response.json();
  const appId = view.application.id;
  const chatId = view.selectedChatId;
  const db = new Database(join(fixture.state, "qa.db"));
  const userId = randomUUID();
  const runId = randomUUID();
  const now = new Date().toISOString();
  try {
    // Hold an active turn without running a model or any external command.
    // The real worker will not claim the follow-up until this turn settles.
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, body, source, status, created_at, updated_at) VALUES (?, ?, 'user', 'Inspect the application', 'user', 'completed', ?, ?)",
    ).run(userId, chatId, now, now);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, body, source, status, response_to, request_key, created_at, updated_at) VALUES (?, ?, 'assistant', 'Inspecting the application.', 'pi', 'running', ?, ?, ?, ?)",
    ).run(runId, chatId, userId, randomUUID(), now, now);
    db.prepare(
      "UPDATE conversations SET status = 'working', current_response_id = ? WHERE id = ?",
    ).run(runId, chatId);
    await page.goto(`/applications/${appId}`);
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    await composer.fill("Explain the result afterwards.");
    await page.getByRole("button", { name: "Send next", exact: true }).click();
    const cancel = page.getByRole("button", {
      name: "Cancel queued message",
      exact: true,
    });
    await expect(cancel).toBeVisible();
    await expect(composer).toHaveValue("");
    const state = db
      .prepare(
        "SELECT current_response_id AS active FROM conversations WHERE id = ?",
      )
      .get(chatId) as { active: string };
    expect(state.active).toBe(runId);
    await page.reload();
    await expect(cancel).toBeVisible();
    await page
      .locator(`#hv-message-${runId}`)
      .getByRole("button", { name: /^Stop/ })
      .click();
    await expect(cancel).toHaveCount(0);
    await expect
      .poll(() => {
        const row = db
          .prepare(
            "SELECT count(*) AS count FROM messages WHERE conversation_id = ? AND status IN ('queued', 'running')",
          )
          .get(chatId) as { count: number };
        return row.count;
      })
      .toBe(0);
    await expect(
      page.getByText("Explain the result afterwards.", { exact: true }),
    ).toBeVisible();
  } finally {
    db.close();
  }
});

test("a late POST response preserves identical text typed after SSE acceptance", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/experience-draft-race",
    },
  });
  expect(response.ok()).toBe(true);
  const view = await response.json();
  await page.goto(`/applications/${view.application.id}`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/messages", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const accepted = await route.fetch();
    await gate;
    await route.fulfill({ response: accepted });
  });
  const composer = page.getByRole("textbox", { name: "Message Hallvi" });
  await composer.fill("Check again.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(composer).toHaveValue("");
  // The SSE stream confirms acceptance while the original POST remains pending.
  await expect(
    page.getByText("[QA fixture reply] Check again.", { exact: true }),
  ).toBeVisible();
  await composer.fill("Check again.");
  release();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  await expect(composer).toHaveValue("Check again.");
  await page.reload();
  await expect(composer).toHaveValue("Check again.");
});
