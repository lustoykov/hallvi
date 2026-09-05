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
  await page.getByRole("textbox").fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(`[QA fixture reply] ${message}`, { exact: true }),
  ).toBeVisible();
}

test(
  "P1-04/06 add an application, record a priority, reload",
  journey("add-application"),
  async ({ page }) => {
    // This first journey compiles the dev routes; CI spent ~60s before its
    // final state check.
    test.setTimeout(90_000);
    await page.goto("/");
    await expect(page).toHaveURL(/\/applications$/);
    await addApplication(page, "smoke-app");
    await send(page, "priority: Fast recovery matters most");
    await page.reload();
    const saved = await view(page);
    expect(saved.decisions).toHaveLength(1);
    expect(saved.decisions[0].value).toBe("Fast recovery matters most");
    expect(saved.decisions[0].sourceMessageId).toBe(saved.messages.at(-2).id);
    await expect(
      page.getByText(
        "[QA fixture reply] priority: Fast recovery matters most",
        { exact: true },
      ),
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
    await expect(page).toHaveURL(/\/applications$/);
    await page.goto("/setup/pi");
    await expect(page.getByLabel("Reasoning effort")).toHaveValue("medium");
  },
);

test(
  "P1-07 provider failure leaves no partial turn and retry works",
  journey("provider-failure"),
  async ({ page }) => {
    await addApplication(page, "failure-app");
    const before = await view(page);
    await page.getByRole("textbox").fill("Hello [fail-once]");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "QA simulated provider failure" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveValue("Hello [fail-once]");
    await expect(
      page.getByRole("status").filter({ hasText: "Waiting for Pi" }),
    ).toHaveCount(0);
    await expect(
      page
        .locator(".sg-messages")
        .getByText("Hello [fail-once]", { exact: true }),
    ).toHaveCount(0);
    expect((await view(page)).messages).toEqual(before.messages);
    await send(page, "Hello [fail-once]");
    await expect(
      page
        .locator(".sg-messages")
        .getByText("Hello [fail-once]", { exact: true }),
    ).toHaveCount(1);
    expect((await view(page)).messages).toHaveLength(
      before.messages.length + 2,
    );
  },
);

test(
  "P1-05 applications isolate Decisions and unsent drafts",
  journey("isolation"),
  async ({ page }) => {
    const first = await addApplication(page, "isolation-first");
    await send(page, "priority: First app only");
    await page.getByRole("textbox").fill("Unsent draft");
    await addApplication(page, "isolation-second");
    await expect(page.getByRole("textbox")).toHaveValue("");
    expect((await view(page)).decisions).toEqual([]);
    await page.goto(first);
    expect((await view(page)).decisions[0].value).toBe("First app only");
  },
);

test(
  "P1-06/07 revision replaces exactly; fabricated replacement rolls back",
  journey("revision"),
  async ({ page }) => {
    await addApplication(page, "revision-app");
    await send(page, "priority: Lowest cost");
    const oldId = (await view(page)).decisions[0].id;
    await send(page, "replace-priority: Fast recovery");
    const revised = await view(page);
    expect(revised.decisions).toHaveLength(1);
    expect(revised.decisions[0].id).not.toBe(oldId);
    expect(revised.decisions[0].value).toBe("Fast recovery");
    await page.getByRole("textbox").fill("invalid-replacement: reject this");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator(".sg-error[role=alert]")).toBeVisible();
    expect((await view(page)).messages).toEqual(revised.messages);
    expect((await view(page)).decisions).toEqual(revised.decisions);
  },
);

test(
  "P1-09 confirmed removal permits a genuinely fresh application",
  journey("removal"),
  async ({ page }) => {
    const oldPath = await addApplication(page, "removal-app");
    await send(page, "priority: Disposable decision");
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
    expect((await view(page)).decisions).toEqual([]);
    expect((await page.request.get(`/api${oldPath}`)).status()).toBe(404);
  },
);

test(
  "P1-10 disconnect preserves application history and requires consent to reuse",
  journey("disconnect"),
  async ({ page }) => {
    const path = await addApplication(page, "disconnect-app");
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
    await expect(page.getByRole("textbox")).toBeDisabled();
    expect((await view(page)).messages).toEqual(before.messages);
  },
);

test(
  "P1-13 shows a pending message immediately; double Enter saves one pair and keeps a newer draft",
  journey("slow-reply"),
  async ({ page }, testInfo) => {
    await addApplication(page, "slow-send-app");
    const before = await view(page);
    const composer = page.getByRole("textbox");
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
      await composer.fill("Hello [slow]");
      await composer.press("Enter");
      await composer.press("Enter");
      await expect(
        page.locator(".sg-messages").getByText("Hello [slow]", { exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".sg-messages").getByText("Pending", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("status").filter({ hasText: "Waiting for Pi" }),
      ).toBeVisible();
      await expect(
        page.getByText("[QA fixture reply] Hello [slow]", { exact: true }),
      ).toHaveCount(0);
      await expect(composer).toHaveValue("");
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
    await expect(
      page.getByText("[QA fixture reply] Hello [slow]", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".sg-messages").getByText("Hello [slow]", { exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(".sg-messages").getByText("Pending", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Waiting for Pi" }),
    ).toHaveCount(0);
    await expect(composer).toHaveValue("Next unsent draft");
    expect(requests).toBe(1);
    expect((await view(page)).messages).toHaveLength(
      before.messages.length + 2,
    );
  },
);
