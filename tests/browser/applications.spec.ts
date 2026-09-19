import { openConversation } from "./workspace-helpers";
import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { journey } from "./journeys";

async function addApplication(page: Page, name: string) {
  await page.goto("/applications/new");
  await page
    .getByLabel("GitHub repository", { exact: true })
    .fill(`https://github.com/qa/${name}`);
  await page
    .getByRole("button", { name: "Add application", exact: true })
    .click();
  // The disposable Next dev server may compile creation and destination routes
  // on first use.
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
    timeout: 30_000,
  });
  return new URL(page.url()).pathname;
}
async function view(page: Page) {
  return (await page.request.get(`/api${new URL(page.url()).pathname}`)).json();
}
async function send(page: Page, message: string) {
  await page.getByRole("textbox", { name: "Message Hallvi" }).fill(message);
  const applicationUrl = new URL(page.url());
  // First-use dev compilation belongs to HTTP acceptance, not the reply budget.
  const [accepted] = await Promise.all([
    page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "POST" &&
          url.origin === applicationUrl.origin &&
          url.pathname.startsWith(`/api${applicationUrl.pathname}/chats/`) &&
          /\/chats\/[\da-f-]{36}\/messages$/.test(url.pathname)
        );
      },
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Send", exact: true }).click(),
  ]);
  expect(accepted.status()).toBe(202);
  await openConversation(page);
  await expect(
    page.getByText(`[QA fixture reply] ${message}`, { exact: true }),
  ).toBeVisible();
}

test(
  "P1-20 durable acceptance, reconnect, Stop and sending again",
  journey("durable-requests"),
  async ({ page }, testInfo) => {
    await addApplication(page, "durable-app");
    const before = await view(page);
    const route = `${new URL(page.url()).pathname}?chat=${before.selectedChatId}`;
    const endpoint = `/api/applications/${before.application.id}/chats/${before.selectedChatId}/messages`;
    const data = { message: "Hello [slow]", requestKey: crypto.randomUUID() };
    const response = await page.request.post(endpoint, { data });
    // Answered once Pi has durably taken the message.
    expect(response.status()).toBe(201);
    const sent = (snapshot: { messages: { requestKey?: string }[] }) =>
      snapshot.messages.filter((m) => m.requestKey === data.requestKey);
    expect(sent(await response.json())).toHaveLength(1);
    // The same send again, as after a lost answer, is still one message.
    const duplicate = await page.request.post(endpoint, { data });
    expect(sent(await duplicate.json())).toHaveLength(1);
    expect(
      (
        await page.request.post(endpoint, {
          data: { ...data, message: "Different" },
        })
      ).status(),
    ).toBe(409);
    await page.goto("/applications"); // Closes the stream, not the accepted work.
    await expect
      .poll(async () => {
        const snapshot = await (await page.request.get(endpoint)).json();
        return snapshot.messages.at(-1).status;
      })
      .toBe("completed");
    await page.goto(route);
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] Hello [slow]", { exact: true }),
    ).toBeVisible();
    await openConversation(page);
    await expect(
      page.locator(".hv-messages").getByText("Hello [slow]", { exact: true }),
    ).toHaveCount(1);

    await page
      .getByRole("textbox", { name: "Message Hallvi" })
      .fill("Cancel **me** [slow-cancel]");
    await openConversation(page);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await openConversation(page);
    await expect(page.locator(".hv-did").last()).toContainText(
      "[QA fixture reply]",
    );
    // The HTTP acceptance has finished, but Pi is still writing its reply.
    await expect(
      page.getByRole("textbox", { name: "Message Hallvi" }),
    ).toBeEnabled();
    await expect(page.locator(".hv-still-working")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("durable-reply-in-progress.png"),
      fullPage: true,
    });
    const cancellation = page.waitForResponse(
      (response) =>
        response.url().endsWith("/stop") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Stop" }).click();
    expect((await (await cancellation).json()).status).toBe("idle");
    await page.reload();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator(".hv-still-working")).toHaveCount(0);
    await page.getByText("Show unfinished draft", { exact: true }).click();
    await openConversation(page);
    await expect(page.locator(".hv-run-progress details")).toContainText(
      "[QA fixture reply]",
    );
    await page.getByText("Show unfinished draft", { exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("durable-cancelled-reply.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Try again" }).click();
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] Cancel me [slow-cancel]", {
        exact: true,
      }),
      // The synthetic reply alone takes six seconds.
    ).toBeVisible({ timeout: 20_000 });
    await openConversation(page);
    // Trying again sends the instruction again, as Pi's own history has it.
    await expect(
      page
        .locator(".hv-messages")
        .getByText("Cancel me [slow-cancel]", { exact: true }),
    ).toHaveCount(2);
    const saved = await (await page.request.get(endpoint)).json();
    const statuses = (role: string) =>
      saved.messages
        .filter((m: { role: string; source: string }) => m.role === role)
        .slice(-3)
        .map((m: { status: string }) => m.status);
    expect(statuses("user")).toEqual(["delivered", "delivered", "delivered"]);
    expect(statuses("assistant")).toEqual([
      "completed",
      "cancelled",
      "completed",
    ]);
    await page.screenshot({
      path: testInfo.outputPath("durable-retried-reply.png"),
      fullPage: true,
    });
    await openConversation(page);
    await send(page, "Continue after cancellation");
  },
);

test(
  "add an application, send a message and reload",
  journey("add-application"),
  async ({ page }) => {
    // Cold CI navigation took ~60s; leave room for 30s HTTP acceptance and the
    // unchanged 10s reply assertion, plus the final reload and state check.
    test.setTimeout(120_000);
    await page.goto("/");
    // The fixture is worker-scoped: another smoke journey may already have
    // created an application, but the root must always enter applications.
    await expect(page).toHaveURL(/\/applications(?:\/new)?$/);
    await addApplication(page, "smoke-app");
    await openConversation(page);
    const message = "What should we check before deploying?";
    await send(page, message);
    await page.reload();
    const saved = await view(page);
    expect(saved.messages.at(-2).body).toBe(message);
    await openConversation(page);
    await expect(
      page.getByText(`[QA fixture reply] ${message}`, { exact: true }),
    ).toBeVisible();
  },
);

test(
  "P1-03/11 settings help, cancellation and persisted effort",
  journey("settings"),
  async ({ page }) => {
    await page.goto("/setup/pi");
    await page.getByRole("button", { name: "Storage & privacy" }).click();
    await expect(
      page.getByRole("heading", { name: "Storage & privacy" }),
    ).toBeVisible();
    const setupStatus = await (await page.request.get("/api/pi/setup")).json();
    await expect(
      page.getByText(setupStatus.diagnosticLogPath, { exact: true }),
    ).toBeVisible();
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copy log path", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Path copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      setupStatus.diagnosticLogPath,
    );
    await expect(
      page.getByText(setupStatus.localTracePath, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Off. Traces stay local.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy trace path", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      setupStatus.localTracePath,
    );
    await page.keyboard.press("Escape");
    const disconnect = page.getByRole("button", {
      name: "Disconnect",
      exact: true,
    });
    await disconnect.click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(disconnect).toBeFocused();
    await page.getByLabel("Reasoning effort").selectOption("medium");
    await page.getByRole("button", { name: "View applications" }).click();
    await expect(page).toHaveURL(/\/applications(?:\/new)?$/);
    await page.goto("/setup/pi");
    await expect(page.getByLabel("Reasoning effort")).toHaveValue("medium");
  },
);

test(
  "P1-07 provider failure preserves accepted intent and trying again works",
  journey("provider-failure"),
  async ({ page }) => {
    await addApplication(page, "failure-app");
    const before = await view(page);
    await page
      .getByRole("textbox", { name: "Message Hallvi" })
      .fill("Hello [fail-once]");
    await openConversation(page);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // The failed reply offers another go; the provider's words stay out of
    // the conversation.
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("QA simulated provider failure.")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("textbox", { name: "Message Hallvi" }),
    ).toHaveValue("");
    await openConversation(page);
    await expect(
      page
        .locator(".hv-messages")
        .getByText("Hello [fail-once]", { exact: true }),
    ).toHaveCount(1);
    expect((await view(page)).messages).toHaveLength(
      before.messages.length + 2,
    );
    await page.reload();
    await page.getByRole("button", { name: "Try again" }).click();
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] Hello [fail-once]", { exact: true }),
    ).toBeVisible();
    await openConversation(page);
    await expect(
      page
        .locator(".hv-messages")
        .getByText("Hello [fail-once]", { exact: true }),
    ).toHaveCount(2);
    expect((await view(page)).messages).toHaveLength(
      before.messages.length + 4,
    );
  },
);

test(
  "P1-05 applications isolate messages and unsent drafts",
  journey("isolation"),
  async ({ page }) => {
    const first = await addApplication(page, "isolation-first");
    await openConversation(page);
    await send(page, "First app only");
    await page
      .getByRole("textbox", { name: "Message Hallvi" })
      .fill("Unsent draft");
    await addApplication(page, "isolation-second");
    await expect(
      page.getByRole("textbox", { name: "Message Hallvi" }),
    ).toHaveValue("");
    expect((await view(page)).messages).not.toContainEqual(
      expect.objectContaining({ body: "First app only" }),
    );
    await page.goto(first);
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] First app only", { exact: true }),
    ).toBeVisible();
  },
);

test(
  "P1-09 confirmed removal permits a genuinely fresh application",
  journey("removal"),
  async ({ page }) => {
    const oldPath = await addApplication(page, "removal-app");
    await openConversation(page);
    await send(page, "Disposable message");
    await page
      .getByRole("button", { name: "Switch application: removal-app" })
      .click();
    await page.getByRole("button", { name: "Remove application…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("wrong/repository");
    await expect(
      dialog.getByRole("button", { name: "Remove application", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("textbox").fill("qa/removal-app");
    await dialog
      .getByRole("button", { name: "Remove application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/new$/);
    const freshPath = await addApplication(page, "removal-app");
    expect(freshPath).not.toBe(oldPath);
    expect((await view(page)).messages).not.toContainEqual(
      expect.objectContaining({ body: "Disposable message" }),
    );
    expect((await page.request.get(`/api${oldPath}`)).status()).toBe(404);
  },
);

test(
  "P1-10 disconnect preserves application history and requires consent to reuse",
  journey("disconnect"),
  async ({ page }) => {
    const path = await addApplication(page, "disconnect-app");
    await openConversation(page);
    await send(page, "Hello before disconnect");
    const before = await view(page);
    await page.goto("/setup/pi");
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Use existing login" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "View applications" }),
    ).toBeDisabled();
    await page.goto(path);
    // A draft can still be written; it cannot be sent until ChatGPT is back.
    await page
      .getByRole("textbox", { name: "Message Hallvi" })
      .fill("Hello after disconnect");
    await expect(
      page.getByRole("button", { name: "Send", exact: true }),
    ).toBeDisabled();
    expect((await view(page)).messages).toEqual(before.messages);
  },
);

test(
  "P1-13 shows a pending message immediately; double Enter saves one pair and keeps a newer draft",
  journey("slow-reply"),
  async ({ page }, testInfo) => {
    await addApplication(page, "slow-send-app");
    const before = await view(page);
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    let release!: () => void;
    let requests = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/applications/*/chats/*/messages",
      async (route) => {
        requests++;
        await held;
        await route.continue();
      },
    );
    try {
      await openConversation(page);
      await composer.fill("Hello [slow]");
      await openConversation(page);
      await composer.press("Enter");
      await openConversation(page);
      await composer.press("Enter");
      await openConversation(page);
      await expect(
        page.locator(".hv-messages").getByText("Hello [slow]", { exact: true }),
      ).toBeVisible();
      await openConversation(page);
      await expect(
        page.locator(".hv-messages").getByText("Pending", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("status").filter({ hasText: "Saving message" }),
      ).toBeVisible();
      await openConversation(page);
      await expect(
        page.getByText("[QA fixture reply] Hello [slow]", { exact: true }),
      ).toHaveCount(0);
      await openConversation(page);
      await expect(composer).toHaveValue("");
      await openConversation(page);
      await composer.fill("Next unsent draft");
      await expect.poll(() => requests).toBe(1);
      expect((await view(page)).messages).toEqual(before.messages);
      await page.screenshot({
        path: testInfo.outputPath("pending-chat-message.png"),
        fullPage: true,
      });
    } finally {
      release();
    }
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] Hello [slow]", { exact: true }),
    ).toBeVisible();
    await openConversation(page);
    await expect(
      page.locator(".hv-messages").getByText("Hello [slow]", { exact: true }),
    ).toHaveCount(1);
    await openConversation(page);
    await expect(
      page.locator(".hv-messages").getByText("Pending", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Saving message" }),
    ).toHaveCount(0);
    await openConversation(page);
    await expect(composer).toHaveValue("Next unsent draft");
    expect(requests).toBe(1);
    expect((await view(page)).messages).toHaveLength(
      before.messages.length + 2,
    );
  },
);

test(
  "SSE acceptance removes the pending copy even before the send response arrives",
  journey("slow-reply"),
  async ({ page }) => {
    await addApplication(page, "acceptance-race");
    let release: () => void = () => {};
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/messages", async (route) => {
      const response = await route.fetch();
      await delayed;
      await route.fulfill({ response });
    });
    try {
      await openConversation(page);
      await page
        .getByRole("textbox", { name: "Message Hallvi" })
        .fill("Acceptance race");
      await openConversation(page);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await openConversation(page);
      await expect(
        page.getByText("[QA fixture reply] Acceptance race", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByText("Acceptance race", { exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByText("Saving message…", { exact: false }),
      ).toHaveCount(0);
    } finally {
      release();
    }
  },
);
