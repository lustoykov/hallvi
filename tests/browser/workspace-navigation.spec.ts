import { openConversation, openHistory } from "./workspace-helpers";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test(
  "chat drafts stay separate, selection survives refresh, and archived chats explain their state",
  journey("chat-navigation"),
  async ({ page }) => {
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/chat-navigation");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const composer = page.getByRole("textbox", {
      name: "Message Haldur",
      exact: true,
    });
    await openConversation(page);
    await composer.fill("Main chat draft");
    await page
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await openConversation(page);
    await expect(composer).toHaveValue("");
    await openConversation(page);
    await composer.fill("Separate chat draft");
    const secondChatUrl = page.url();
    expect(new URL(secondChatUrl).searchParams.get("chat")).toMatch(
      /^[\da-f-]{36}$/,
    );
    await page.getByRole("button", { name: "Deploy application" }).click();
    await openConversation(page);
    await expect(composer).toHaveValue("Main chat draft");
    await page.getByRole("button", { name: "Conversation 2" }).click();
    await openConversation(page);
    await expect(composer).toHaveValue("Separate chat draft");
    await openConversation(page);
    await composer.press("Enter");
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] Separate chat draft", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] Separate chat draft", { exact: true }),
    ).toBeVisible();
    await openConversation(page);
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await openConversation(page);
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await openConversation(page);
    await page
      .getByRole("button", { name: "Archive chat", exact: true })
      .click();
    const archivedChat = page.getByRole("button", {
      name: "Conversation 2 Archived",
    });
    await archivedChat.click();
    await openConversation(page);
    await expect(composer).toBeDisabled();
    await expect(
      page.getByText(
        "This chat is archived and read-only. Choose an active chat or start a new one.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await openConversation(page);
    await expect(composer).toBeDisabled();
    await openConversation(page);
    await expect(composer).toHaveAttribute(
      "placeholder",
      "This chat is archived",
    );
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] Separate chat draft", { exact: true }),
    ).toBeVisible();
  },
);

test(
  "a long saved requirement fits History at desktop widths, and IME composition does not send",
  journey("chat-navigation"),
  async ({ page }, testInfo) => {
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/history-navigation");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const message = `priority: ${"reliability-".repeat(24)}`;
    const composer = page.getByRole("textbox", {
      name: "Message Haldur",
      exact: true,
    });
    await openConversation(page);
    await composer.fill(message);
    await composer.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
    });
    await expect(composer).toHaveValue(message);
    await expect(page.getByText("Pending", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText(`[QA fixture reply] ${message}`, { exact: true }),
    ).toBeVisible();
    // The saved requirement is listed in History, and a long value wraps.
    await openHistory(page);
    const saved = page.locator("#history-requirements");
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(saved.locator(".hd-history-records strong")).toBeVisible();
      const fits = await saved.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      );
      expect(fits).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`history-${width}.png`),
      });
    }
  },
);
