import { openConversation, openDashboard } from "./workspace-helpers";
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
  await openConversation(page);
  await page.getByRole("textbox", { name: "Message Server Guy" }).fill(message);
  await openConversation(page);
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
      await openConversation(page);
      await page
        .getByRole("textbox", { name: "Message Server Guy" })
        .fill("Acceptance race");
      await openConversation(page);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await openConversation(page);
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
  "Chat keeps reply states while Activity records only application events, across refresh, cancellation and retry",
  journey("activity-history"),
  async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await addApplication(page, "activity-history");
    const activityTab = page.getByRole("button", { name: /^History/ });
    await openDashboard(page);
    await activityTab.click();
    const activity = page.getByRole("region", { name: "History", exact: true });
    const events = activity.locator(".sg-event");
    await openDashboard(page);
    await expect(events).toHaveCount(2);
    await openDashboard(page);
    await expect(events.nth(0)).toContainText("Repository identity recorded");
    await openDashboard(page);
    await expect(events.nth(1)).toContainText("Application workspace created");
    // An ordinary answer is conversation, not application Activity.
    await openConversation(page);
    await send(page, "hello there");
    await expect(page.getByText("Reply details", { exact: true })).toHaveCount(
      0,
    );
    await openDashboard(page);
    await expect(events).toHaveCount(2);

    // A saved requirement produces one event.
    await openConversation(page);
    await send(page, "priority: Data stays in the EU");
    await openDashboard(page);
    await expect(events).toHaveCount(3);
    await openDashboard(page);
    await expect(events.nth(0)).toContainText("Requirement saved");
    await openDashboard(page);
    await expect(events.nth(0)).toContainText("Data stays in the EU");
    await openDashboard(page);
    await expect(activityTab).toHaveAttribute("aria-expanded", "true");

    // A replacement: one old → new event, no extra per-reply item.
    await openConversation(page);
    await send(page, "replace-priority: Data stays in Germany");
    await openDashboard(page);
    await expect(events).toHaveCount(4);
    await openDashboard(page);
    await expect(events.nth(0)).toContainText("Requirement changed");
    await openDashboard(page);
    await expect(events.nth(0)).toContainText(
      "Data stays in the EU → Data stays in Germany",
    );
    await page.screenshot({
      path: testInfo.outputPath("activity-feed.png"),
      fullPage: true,
    });

    // Reload reconstructs saved conversation and Activity from product records.
    await page.reload();
    await openDashboard(page);
    await activityTab.click();
    await openDashboard(page);
    await expect(events).toHaveCount(4);
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] hello there", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Reply details", { exact: true })).toHaveCount(
      0,
    );

    // Compile this dev-server route before the six-second synthetic reply.
    // GET cannot cancel anything; otherwise cold compilation can outlast it.
    await page.request.get(
      "/api/applications/fixture/chats/fixture/runs/fixture/cancel",
    );

    // Cancellation is recorded with that attempt, never in Activity.
    await openConversation(page);
    await page
      .getByRole("textbox", { name: "Message Server Guy" })
      .fill("[slow-cancel] hello");
    await openConversation(page);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Replying…", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel request", exact: true })
      .click();
    await expect(
      page.getByText("Reply cancelled.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry reply", exact: true }),
    ).toBeVisible();
    await openDashboard(page);
    await expect(events).toHaveCount(4);
    await page.screenshot({
      path: testInfo.outputPath("reply-cancelled.png"),
      fullPage: true,
    });

    // Retry produces a saved answer, still no feed item.
    await openConversation(page);
    await page
      .getByRole("button", { name: "Retry reply", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.getByText("[QA fixture reply] [slow-cancel] hello", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: "Retry reply", exact: true }),
    ).toHaveCount(0);
    await openDashboard(page);
    await expect(events).toHaveCount(4);
  },
);

test(
  "a GitHub disconnect records one verification invalidation per application; reconnecting rechecks it",
  journey("activity-history"),
  async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const path = await addApplication(page, "activity-invalidation");
    const activityTab = page.getByRole("button", { name: /^History/ });
    const events = page
      .getByRole("region", { name: "History", exact: true })
      .locator(".sg-event");
    await openDashboard(page);
    await activityTab.click();
    await openDashboard(page);
    await expect(events).toHaveCount(2);

    // Chat administration stays in the chat list, not in Activity.
    await page.getByRole("button", { name: "New conversation" }).click();
    await openConversation(page);
    await page
      .getByRole("button", { name: "Archive chat", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.getByRole("button", { name: "Archive chat", exact: true }),
    ).toHaveCount(0);
    await openDashboard(page);
    await expect(events).toHaveCount(2);

    await page.goto("/setup/github");
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Connect GitHub", exact: true }),
    ).toBeVisible();
    await page.goto(path);
    await openDashboard(page);
    await activityTab.click();
    await openDashboard(page);
    await expect(events).toHaveCount(3);
    await openDashboard(page);
    await expect(events.nth(0)).toContainText(
      "Repository verification invalidated",
    );
    await openDashboard(page);
    await expect(events.nth(0)).toContainText(
      "does not show that access was lost",
    );
    await page.screenshot({
      path: testInfo.outputPath("activity-invalidated.png"),
      fullPage: true,
    });
    // The check itself is no longer current, without claiming lost access.
    await openDashboard(page);
    await expect(
      page.getByRole("button", {
        name: /Check 2 GitHub repository access.*Not yet/,
      }),
    ).toBeVisible();

    // Reloading and re-reading do not repeat the transition.
    await page.reload();
    await openDashboard(page);
    await activityTab.click();
    await openDashboard(page);
    await expect(events).toHaveCount(3);

    // Reconnecting rechecks the repository; the fresh result is its own event.
    await page.goto("/setup/github");
    await page
      .getByRole("button", { name: "Connect GitHub", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Repository checks passed." }),
    ).toBeVisible();
    await page.goto(path);
    await openDashboard(page);
    await activityTab.click();
    await openDashboard(page);
    await expect(events).toHaveCount(4);
    await openDashboard(page);
    await expect(events.nth(0)).toContainText("Repository identity recorded");
    await openDashboard(page);
    await expect(
      events.filter({ hasText: "Repository verification invalidated" }),
    ).toHaveCount(1);
    await openDashboard(page);
    await expect(
      page.getByRole("button", {
        name: /Check 2 GitHub repository access.*Passed/,
      }),
    ).toBeVisible();
  },
);
