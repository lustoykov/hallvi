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
      name: "Message Server Guy",
      exact: true,
    });
    await composer.fill("Main chat draft");
    await page
      .getByRole("button", { name: "Start a new phase chat", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await expect(composer).toHaveValue("");
    await composer.fill("Separate chat draft");
    const secondChatUrl = page.url();
    expect(new URL(secondChatUrl).searchParams.get("chat")).toMatch(
      /^[\da-f-]{36}$/,
    );
    await page
      .getByRole("button", { name: /SG Launch Brief Main phase chat/ })
      .click();
    await expect(composer).toHaveValue("Main chat draft");
    await page
      .getByRole("button", { name: /SG Launch question 2 Separate transcript/ })
      .click();
    await expect(composer).toHaveValue("Separate chat draft");
    await composer.press("Enter");
    await expect(
      page.getByText("[QA fixture reply] Separate chat draft", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("[QA fixture reply] Separate chat draft", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: /Check 2 GitHub repository access/ })
      .click();
    await page
      .getByRole("button", { name: "Re-run repository check", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Re-run repository check",
        exact: true,
      }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(secondChatUrl);
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Archive chat", exact: true })
      .click();
    const archivedChat = page.getByRole("button", {
      name: /SG Launch question 2 Separate transcript Archived/,
    });
    await archivedChat.click();
    await expect(composer).toBeDisabled();
    await expect(
      page.getByText(
        "This chat is archived and read-only. Choose an active chat or start a new one.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await expect(composer).toBeDisabled();
    await expect(composer).toHaveAttribute(
      "placeholder",
      "This chat is archived",
    );
    await expect(
      page.getByText("[QA fixture reply] Separate chat draft", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Check 1 Application details/ })
      .click();
    await page
      .getByRole("button", { name: "Ask about this check", exact: true })
      .click();
    await expect(composer).toBeEnabled();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue(
      "Explain “Application details”, its current result, and what I can verify myself.",
    );
  },
);

test(
  "Record sections open from the jump nav and long Decisions fit the desktop inspector",
  journey("chat-navigation"),
  async ({ page }, testInfo) => {
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/inspector-navigation");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    // The Record is one outline: Checks open by default, History collapsed;
    // the jump nav opens a section and its header toggles it.
    const record = page.getByRole("complementary", {
      name: "Record",
      exact: true,
    });
    const sections = record.getByRole("combobox", { name: "Find in Record" });
    await expect(
      record.getByRole("region", { name: "Checks", exact: true }),
    ).toBeVisible();
    await expect(
      record.getByRole("region", { name: "History", exact: true }),
    ).toHaveCount(0);
    await sections.selectOption("history");
    await expect(
      record.getByRole("region", { name: "History", exact: true }),
    ).toBeVisible();
    const historyToggle = record.getByRole("button", { name: /^History/ });
    await expect(historyToggle).toHaveAttribute("aria-expanded", "true");
    await historyToggle.click();
    await expect(
      record.getByRole("region", { name: "History", exact: true }),
    ).toHaveCount(0);
    await expect(historyToggle).toHaveAttribute("aria-expanded", "false");
    // The reader chooses the width; hiding preserves selected content.
    await sections.selectOption("history");
    const originalWidth = (await record.boundingBox())!.width;
    await record
      .getByRole("button", { name: "Widen Record", exact: true })
      .click();
    expect((await record.boundingBox())!.width).toBeGreaterThan(originalWidth);
    await record
      .getByRole("button", { name: "Hide Record", exact: true })
      .click();
    const showRecord = page.getByRole("button", {
      name: "Record",
      exact: true,
    });
    await expect(showRecord).toBeFocused();
    await expect(record).not.toBeVisible();
    await showRecord.click();
    await expect(historyToggle).toHaveAttribute("aria-expanded", "true");
    await record
      .getByRole("button", { name: "Narrow Record", exact: true })
      .click();
    await historyToggle.click();

    await expect(
      record.getByText(
        /Hetzner access|Cloudflare access|Domain starting state|Later phases/,
      ),
    ).toHaveCount(0);
    const message = `priority: ${"reliability-".repeat(24)}`;
    await page
      .getByRole("textbox", { name: "Message Server Guy", exact: true })
      .fill(message);
    await page
      .getByRole("textbox", { name: "Message Server Guy", exact: true })
      .dispatchEvent("keydown", {
        key: "Enter",
        code: "Enter",
        isComposing: true,
      });
    await expect(
      page.getByRole("textbox", { name: "Message Server Guy", exact: true }),
    ).toHaveValue(message);
    await expect(page.getByText("Pending", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByText(`[QA fixture reply] ${message}`, { exact: true }),
    ).toBeVisible();
    // Saved requirements sit behind a closed disclosure; open it once, then
    // check the long value fits at both desktop widths.
    await page.getByText(/^Saved requirements \(1\)$/).click();
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".sg-decision-list strong")).toBeVisible();
      const fits = await page
        .locator(".sg-inspector-body")
        .evaluate((element) => element.scrollWidth <= element.clientWidth);
      expect(fits).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`inspector-${width}.png`),
      });
    }
  },
);
