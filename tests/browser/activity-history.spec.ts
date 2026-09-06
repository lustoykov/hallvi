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
  return new URL(page.url()).pathname;
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
  "SSE acceptance removes the pending copy even before the send response arrives",
  journey("activity-history"),
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
      await page
        .getByRole("textbox", { name: "Message Server Guy" })
        .fill("Acceptance race");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(
        page.getByText("[QA fixture reply] Acceptance race", { exact: true }),
      ).toBeVisible();
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

test(
  "reply details stay with each reply while Activity records only application events, across refresh, cancellation and retry",
  journey("activity-history"),
  async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await addApplication(page, "activity-history");
    const activityTab = page.getByRole("tab", {
      name: "Activity",
      exact: true,
    });
    await activityTab.click();
    const activity = page.getByRole("tabpanel", {
      name: "Activity",
      exact: true,
    });
    const events = activity.locator(".sg-event");
    await expect(events).toHaveCount(2);
    await expect(events.nth(0)).toContainText("Repository identity recorded");
    await expect(events.nth(1)).toContainText("Application workspace created");
    const replies = page.locator(".sg-execution");

    // An ordinary reply: details beside the reply, no application event.
    await send(page, "hello there");
    await expect(replies).toHaveCount(1);
    await expect(replies.nth(0).locator(":scope > summary")).toContainText(
      "Completed in",
    );
    await expect(events).toHaveCount(2);

    // A saved requirement: one event; the reply's own details link the record.
    await send(page, "priority: Data stays in the EU");
    const saved = replies.nth(1);
    await expect(saved.locator(":scope > summary")).toContainText(
      "Completed in",
    );
    await expect(events).toHaveCount(3);
    await expect(events.nth(0)).toContainText("Requirement saved");
    await expect(events.nth(0)).toContainText("Data stays in the EU");
    await expect(activity).not.toContainText("Reply details");
    await expect(activityTab).toHaveAttribute("aria-selected", "true");
    expect(await saved.getAttribute("open")).toBeNull();
    // The disclosure is a native control: keyboard opens and closes it.
    await saved.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(saved).toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    expect(await saved.getAttribute("open")).toBeNull();
    await saved.locator(":scope > summary").click();
    await expect(saved).toContainText("Reply saved · 1 requirement saved");
    await expect(saved).toContainText("Generate response");
    await expect(saved).toContainText("Prepare requirement");
    await expect(saved).toContainText(
      "Validate and save reply and requirements",
    );
    await expect(
      saved.getByRole("link", { name: "Saved requirement 1" }),
    ).toBeVisible();
    await saved.getByText("Technical details", { exact: true }).click();
    await expect(saved).toContainText("Content is omitted");
    await expect(saved).toContainText("Langfuse export is not configured");
    await page.screenshot({
      path: testInfo.outputPath("reply-details-expanded.png"),
      fullPage: true,
    });

    // A replacement: one old → new event, no extra per-reply item.
    await send(page, "replace-priority: Data stays in Germany");
    await expect(events).toHaveCount(4);
    await expect(events.nth(0)).toContainText("Requirement changed");
    await expect(events.nth(0)).toContainText(
      "Data stays in the EU → Data stays in Germany",
    );
    await page.screenshot({
      path: testInfo.outputPath("activity-feed.png"),
      fullPage: true,
    });

    // Refresh keeps both surfaces.
    await page.reload();
    await activityTab.click();
    await expect(events).toHaveCount(4);
    await expect(replies).toHaveCount(3);
    await replies.nth(1).locator(":scope > summary").click();
    await expect(
      replies.nth(1).getByRole("link", { name: "Saved requirement 1" }),
    ).toBeVisible();

    // Cancellation is recorded with that attempt, never in Activity.
    await page
      .getByRole("textbox", { name: "Message Server Guy" })
      .fill("[slow-cancel] hello");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const cancelled = replies.nth(3);
    await expect(cancelled.locator(":scope > summary")).toContainText("…");
    await page
      .getByRole("button", { name: "Cancel request", exact: true })
      .click();
    await expect(cancelled.locator(":scope > summary")).toContainText(
      "Cancelled after",
    );
    await cancelled.locator(":scope > summary").click();
    await expect(cancelled).toContainText(
      "Nothing was saved from this attempt",
    );
    await expect(cancelled).toContainText("Not completed");
    await expect(
      cancelled.getByRole("link", { name: "Saved requirement 1" }),
    ).toHaveCount(0);
    await expect(events).toHaveCount(4);
    await page.screenshot({
      path: testInfo.outputPath("reply-details-cancelled.png"),
      fullPage: true,
    });

    // Retry: a linked attempt with its own details, still no feed item.
    await page
      .getByRole("button", { name: "Retry reply", exact: true })
      .click();
    await expect(
      page.getByText("[QA fixture reply] [slow-cancel] hello", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    const retried = replies.nth(4);
    await retried.locator(":scope > summary").click();
    await expect(
      retried.getByRole("link", { name: "earlier attempt" }),
    ).toHaveAttribute("href", /^#reply-/);
    await expect(retried).toContainText("Reply saved · no requirements saved");
    await expect(events).toHaveCount(4);
  },
);

test(
  "a GitHub disconnect records one verification invalidation per application; reconnecting rechecks it",
  journey("activity-history"),
  async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const path = await addApplication(page, "activity-invalidation");
    const activityTab = page.getByRole("tab", {
      name: "Activity",
      exact: true,
    });
    const events = page
      .getByRole("tabpanel", { name: "Activity", exact: true })
      .locator(".sg-event");
    await activityTab.click();
    await expect(events).toHaveCount(2);

    // Chat administration stays in the chat list, not in Activity.
    await page.getByRole("button", { name: "Start a new phase chat" }).click();
    await page
      .getByRole("button", { name: "Archive chat", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toHaveCount(0);
    await expect(events).toHaveCount(2);

    await page.goto("/setup/github");
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Use existing login", exact: true }),
    ).toBeVisible();
    await page.goto(path);
    await activityTab.click();
    await expect(events).toHaveCount(3);
    await expect(events.nth(0)).toContainText(
      "Repository verification invalidated",
    );
    await expect(events.nth(0)).toContainText(
      "does not show that access was lost",
    );
    await page.screenshot({
      path: testInfo.outputPath("activity-invalidated.png"),
      fullPage: true,
    });
    // The check itself is no longer current, without claiming lost access.
    await page.getByRole("tab", { name: "Record", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: /Check 2 GitHub repository access.*Not yet/,
      }),
    ).toBeVisible();

    // Reloading and re-reading do not repeat the transition.
    await page.reload();
    await activityTab.click();
    await expect(events).toHaveCount(3);

    // Reconnecting rechecks the repository; the fresh result is its own event.
    await page.goto("/setup/github");
    await page
      .getByRole("button", { name: "Use existing login", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Repository checks passed." }),
    ).toBeVisible();
    await page.goto(path);
    await activityTab.click();
    await expect(events).toHaveCount(4);
    await expect(events.nth(0)).toContainText("Repository identity recorded");
    await expect(
      events.filter({ hasText: "Repository verification invalidated" }),
    ).toHaveCount(1);
    await page.getByRole("tab", { name: "Record", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: /Check 2 GitHub repository access.*Passed/,
      }),
    ).toBeVisible();
  },
);
