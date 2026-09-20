import { openConversation } from "./workspace-helpers";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test(
  "chat drafts stay separate, selection survives refresh, and archived chats explain their state",
  journey("chat-navigation"),
  async ({ page }, testInfo) => {
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
      name: "Message Hallvi",
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
    await page.getByRole("button", { name: "Main operator" }).click();
    await openConversation(page);
    await expect(composer).toHaveValue("Main chat draft");
    await page
      .getByRole("button", { name: "Conversation 2", exact: true })
      .click();
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
    // Archive a different side chat without navigating or losing the draft.
    await page
      .getByRole("button", { name: "New conversation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Conversation 2", exact: true })
      .click();
    await expect(page).toHaveURL(secondChatUrl);
    await expect(
      page.getByRole("button", { name: "Conversation 2", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(composer).toBeEnabled();
    await composer.fill("Keep this draft while archiving another chat");
    const selectedUrl = page.url();
    const third = page.getByRole("button", {
      name: "Conversation 3",
      exact: true,
    });
    const archiveThird = page.getByRole("button", {
      name: "Archive Conversation 3",
      exact: true,
    });
    await page
      .getByRole("button", { name: "Main operator", exact: true })
      .hover();
    await expect(archiveThird).toHaveCSS("opacity", "0");
    await expect(
      page.getByRole("button", { name: "Archive Main operator", exact: true }),
    ).toHaveCount(0);
    await third.hover();
    await expect(archiveThird).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: testInfo.outputPath("sidebar-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath("sidebar-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await third.hover();
    await archiveThird.click();
    await expect(
      page.getByRole("button", {
        name: "Conversation 3 Archived",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(selectedUrl);
    await expect(composer).toHaveValue(
      "Keep this draft while archiving another chat",
    );
    await expect(archiveThird).toHaveCount(0);

    // Keyboard focus exposes the same direct action for the selected chat.
    await page
      .getByRole("button", { name: "Main operator", exact: true })
      .hover();
    await page
      .getByRole("button", { name: "Conversation 2", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    const archiveSecond = page.getByRole("button", {
      name: "Archive Conversation 2",
      exact: true,
    });
    await expect(archiveSecond).toBeFocused();
    await expect(archiveSecond).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
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
  "IME composition does not send",
  journey("chat-navigation"),
  async ({ page }) => {
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/ime-composition");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const message = "Composed text";
    const composer = page.getByRole("textbox", {
      name: "Message Hallvi",
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
  },
);
