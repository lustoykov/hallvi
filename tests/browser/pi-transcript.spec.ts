import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { exchange, scriptWorker } from "./scripted-worker";

test.use({ scriptedWorker: true });

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
  const chatId = created.selectedChatId as string;
  const now = new Date().toISOString();
  const body = "Now checking persistence.";
  // Pi's side of the conversation, as the worker would report it.
  let status: "running" | "completed" = "running";
  let said = false;
  const closeWorker = await scriptWorker(fixture, () => {
    const { replyId, messages } = exchange(chatId, "Check persistence.", {
      body,
      status,
    });
    return {
      status: status === "running" ? "working" : "idle",
      messages,
      // Pi's own record of the call: what it was, and what came back.
      calls: {
        "read-package": {
          replyId,
          sequence: 1,
          tool: "read",
          args: { path: "package.json" },
          at: now,
          result: { text: "{}", failed: false, at: now },
        },
      },
      said: said ? [{ replyId, sequence: 2, text: body, at: now }] : [],
    };
  });
  const runId = "reply:asked";
  try {
    await page.goto(`/applications/${appId}`);
    const message = page.locator(`[id="hv-message-${runId}"]`);
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
    said = true;
    await expect(message.getByText(body, { exact: true })).toHaveCount(1);
    status = "completed";
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
    await closeWorker();
  }
});
