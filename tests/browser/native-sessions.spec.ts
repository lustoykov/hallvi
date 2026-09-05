import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";

async function addApplication(page: Page, name: string) {
  await page.goto("/applications/new");
  await page
    .getByLabel("GitHub repository", { exact: true })
    .fill(`https://github.com/qa/${name}`);
  await page
    .getByRole("button", { name: "Add application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
    timeout: 30_000,
  });
  return snapshot(page);
}

async function snapshot(page: Page) {
  const url = new URL(page.url());
  return (await page.request.get(`/api${url.pathname}${url.search}`)).json();
}

async function send(
  page: Page,
  message: string,
  answer = `[QA fixture reply] ${message}`,
) {
  await page.getByRole("textbox", { name: "Message Server Guy" }).fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
}

test(
  "native history continues across reload while separate Chats share only saved Decisions",
  journey("native-history"),
  async ({ page, fixture }) => {
    const first = await addApplication(page, "native-continuity");
    const firstPath = join(
      fixture.state,
      "pi-sessions",
      first.application.id,
      `${first.selectedChatId}.jsonl`,
    );
    await send(page, "Remember the violet deployment window");
    const sessionId = JSON.parse(
      readFileSync(firstPath, "utf8").split("\n")[0],
    ).id;
    await page.reload();
    await send(
      page,
      "recall: Remember the violet deployment window",
      "[QA native history] found: Remember the violet deployment window",
    );
    await send(page, "priority: Never risk customer data");
    expect(JSON.parse(readFileSync(firstPath, "utf8").split("\n")[0]).id).toBe(
      sessionId,
    );
    const nativeHistory = readFileSync(firstPath, "utf8");
    expect(nativeHistory).toContain('"type":"toolCall"');
    expect(nativeHistory).toContain('"toolName":"propose_decision"');
    expect(nativeHistory).toContain("pending, not saved");

    await page.getByRole("button", { name: "Start a new phase chat" }).click();
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await send(
      page,
      "recall: Remember the violet deployment window",
      "[QA native history] absent: Remember the violet deployment window",
    );
    await send(
      page,
      "lookup-decisions",
      "[QA saved Decisions] Never risk customer data",
    );
    const second = await snapshot(page);
    expect(second.selectedChatId).not.toBe(first.selectedChatId);
    const secondPath = join(
      fixture.state,
      "pi-sessions",
      first.application.id,
      `${second.selectedChatId}.jsonl`,
    );
    expect(
      JSON.parse(readFileSync(secondPath, "utf8").split("\n")[0]).id,
    ).not.toBe(sessionId);
    expect(readFileSync(secondPath, "utf8")).toContain(
      '"toolName":"search_decisions"',
    );
  },
);

test(
  "missing native history requires explicit rebuild, survives reload and never retries automatically",
  journey("native-history"),
  async ({ page, fixture }) => {
    const initial = await addApplication(page, "native-recovery");
    await send(page, "priority: Preserve these saved records");
    const before = await snapshot(page);
    const nativePath = join(
      fixture.state,
      "pi-sessions",
      initial.application.id,
      `${initial.selectedChatId}.jsonl`,
    );
    const oldId = JSON.parse(
      readFileSync(nativePath, "utf8").split("\n")[0],
    ).id;
    // Move only this test's generated fixture file; preserve it for evidence.
    renameSync(nativePath, `${nativePath}.qa-preserved`);
    await page
      .getByRole("textbox", { name: "Message Server Guy" })
      .fill("Continue after history loss");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const rebuild = page.getByRole("button", {
      name: "Rebuild conversation from saved chat",
      exact: true,
    });
    await expect(rebuild).toBeVisible();
    const endpoint = `/api/applications/${initial.application.id}/chats/${initial.selectedChatId}/messages`;
    const failed = await (await page.request.get(endpoint)).json();
    expect(failed.runs.at(-1)).toMatchObject({ status: "failed", piCalls: 0 });
    expect((await snapshot(page)).decisions).toEqual(before.decisions);
    expect(existsSync(nativePath)).toBe(false);

    await rebuild.click();
    const confirmation = page.getByRole("dialog");
    await expect(confirmation).toContainText(
      "Saved messages and Decisions are retained.",
    );
    await expect(confirmation).toContainText("Native tool history may be lost");
    await expect(confirmation).toContainText(
      "does not send a message or retry the failed reply",
    );
    await confirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(rebuild).toBeFocused();
    expect(existsSync(nativePath)).toBe(false);
    await rebuild.click();
    await confirmation
      .getByRole("button", { name: "Rebuild conversation", exact: true })
      .click();
    await expect(confirmation).not.toBeVisible();
    await expect(
      page.getByText(
        "Conversation rebuilt from saved chat. Retry the reply when ready.",
        { exact: true },
      ),
    ).toBeVisible();
    const rebuilt = await snapshot(page);
    expect(rebuilt.decisions).toEqual(before.decisions);
    expect(rebuilt.messages).toEqual(failed.messages);
    expect((await (await page.request.get(endpoint)).json()).runs).toEqual(
      failed.runs,
    );
    expect(
      JSON.parse(readFileSync(nativePath, "utf8").split("\n")[0]).id,
    ).not.toBe(oldId);
    expect(existsSync(`${nativePath}.qa-preserved`)).toBe(true);
    await page.reload();
    await expect(rebuild).not.toBeVisible();
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(
      page.getByRole("tabpanel", { name: "Activity", exact: true }),
    ).toContainText("Launch Brief · messages and Decisions kept.");
    await page
      .getByRole("button", { name: "Retry reply", exact: true })
      .click();
    await expect(
      page.getByText("[QA fixture reply] Continue after history loss", {
        exact: true,
      }),
    ).toBeVisible();
    expect((await snapshot(page)).decisions).toEqual(before.decisions);
  },
);
