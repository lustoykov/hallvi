import { openConversation, openHistory } from "./workspace-helpers";
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
  await openConversation(page);
  await page.getByRole("textbox", { name: "Message Server Guy" }).fill(message);
  await openConversation(page);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
}

test(
  "native history continues across reload while separate Chats share only saved Decisions",
  journey("native-history"),
  async ({ page, fixture }, testInfo) => {
    const first = await addApplication(page, "native-continuity");
    // History lists saved requirements; none exist yet and none are asked for.
    await openHistory(page);
    await expect(page.locator("#history-requirements")).toHaveCount(0);
    await expect(
      page.getByText("No extra requirements.", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Tell Server Guy a launch priority", { exact: false }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("default-goals-no-questionnaire.png"),
      fullPage: true,
    });
    const firstPath = join(
      fixture.state,
      "pi-sessions",
      first.application.id,
      `${first.selectedChatId}.jsonl`,
    );
    await openConversation(page);
    await send(page, "Remember the violet deployment window");
    const sessionId = JSON.parse(
      readFileSync(firstPath, "utf8").split("\n")[0],
    ).id;
    await page.reload();
    await openConversation(page);
    await send(
      page,
      "recall: Remember the violet deployment window",
      "[QA native history] found: Remember the violet deployment window",
    );
    // The synthetic provider's priority: prefix exercises the real storage
    // tool; live evals separately verify whether a model should call it.
    await openConversation(page);
    await send(page, "priority: Customer data must stay in the EU");
    await openHistory(page);
    const saved = page.locator("#history-requirements");
    await expect(saved).toContainText("Customer data must stay in the EU");
    await expect(saved).not.toContainText("launch priority");
    await expect(
      page.getByText("No extra requirements.", { exact: false }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("saved-app-requirement.png"),
      fullPage: true,
    });
    expect(JSON.parse(readFileSync(firstPath, "utf8").split("\n")[0]).id).toBe(
      sessionId,
    );
    const nativeHistory = readFileSync(firstPath, "utf8");
    expect(nativeHistory).toContain('"type":"toolCall"');
    expect(nativeHistory).toContain('"toolName":"propose_decision"');
    expect(nativeHistory).toContain("pending, not saved");

    await page.getByRole("button", { name: "New conversation" }).click();
    await openConversation(page);
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await openConversation(page);
    await send(
      page,
      "recall: Remember the violet deployment window",
      "[QA native history] absent: Remember the violet deployment window",
    );
    await openConversation(page);
    await send(
      page,
      "lookup-decisions",
      "[QA saved Decisions] Customer data must stay in the EU",
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
  "missing native history offers a fresh chat without rebuilding or retrying the old one",
  journey("native-history"),
  async ({ page, fixture }, testInfo) => {
    const initial = await addApplication(page, "native-recovery");
    await openConversation(page);
    await send(page, "priority: Preserve these saved records");
    const before = await snapshot(page);
    const nativePath = join(
      fixture.state,
      "pi-sessions",
      initial.application.id,
      initial.selectedChatId + ".jsonl",
    );
    renameSync(nativePath, nativePath + ".qa-preserved");
    await openConversation(page);
    await page
      .getByRole("textbox", { name: "Message Server Guy" })
      .fill("Continue after history loss");
    await openConversation(page);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const startChat = page.getByRole("button", {
      name: "Start a new chat",
      exact: true,
    });
    await expect(startChat).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry reply", exact: true }),
    ).toHaveCount(0);
    const endpoint =
      "/api/applications/" +
      initial.application.id +
      "/chats/" +
      initial.selectedChatId +
      "/messages";
    const failed = await (await page.request.get(endpoint)).json();
    expect(failed.runs.at(-1)).toMatchObject({ status: "failed", piCalls: 0 });
    expect((await snapshot(page)).decisions).toEqual(before.decisions);
    expect(existsSync(nativePath)).toBe(false);
    await page.reload();
    await expect(startChat).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("missing-history-start-new-chat.png"),
      fullPage: true,
    });
    await startChat.click();
    await openConversation(page);
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    const fresh = await snapshot(page);
    expect(fresh.selectedChatId).not.toBe(initial.selectedChatId);
    expect(fresh.decisions).toEqual(before.decisions);
    // A new chat has only the app's welcome note, not imported conversation.
    expect(fresh.messages).toHaveLength(1);
    expect(fresh.messages[0]).toMatchObject({ source: "server-guy" });
    expect((await (await page.request.get(endpoint)).json()).runs).toEqual(
      failed.runs,
    );
    expect(existsSync(nativePath)).toBe(false);
    expect(existsSync(nativePath + ".qa-preserved")).toBe(true);
    await openConversation(page);
    await send(page, "Hello from a new chat");
    await openConversation(page);
    await send(
      page,
      "lookup-decisions",
      "[QA saved Decisions] Preserve these saved records",
    );
  },
);
