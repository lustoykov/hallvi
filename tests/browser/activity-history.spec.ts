import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test(
  "SSE acceptance removes the pending copy even before the send response arrives",
  journey("activity-history"),
  async ({ page }) => {
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/acceptance-race");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
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
  "Activity records real SDK steps, saves and failures across refresh",
  journey("activity-history"),
  async ({ page }, testInfo) => {
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/activity-history");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message Server Guy" })
      .fill("priority: Data stays in the EU");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const execution = page.locator(".sg-execution").first();
    await expect(execution.locator(":scope > summary")).toContainText(
      "Reply saved",
    );
    await expect(
      page.getByRole("tab", { name: "Activity", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await execution.locator(":scope > summary").click();
    await expect(execution).toContainText("Generate response");
    await expect(execution).toContainText("Prepare requirement");
    await expect(execution).toContainText(
      "Validate and save reply and requirements",
    );
    await expect(
      execution.getByRole("link", { name: "Saved requirement 1" }),
    ).toBeVisible();
    await execution.getByText("Technical details", { exact: true }).click();
    await expect(execution).toContainText("Content is omitted");
    await expect(execution).toContainText("Langfuse export is not configured");
    await page.screenshot({
      path: testInfo.outputPath("activity-expanded.png"),
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await execution.locator(":scope > summary").click();
    await expect(
      execution.getByRole("link", { name: "Saved requirement 1" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message Server Guy" })
      .fill("[slow-cancel] hello");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(execution.locator(":scope > summary")).toContainText(
      "Working",
    );
    await page
      .getByRole("button", { name: "Cancel request", exact: true })
      .click();
    await expect(execution.locator(":scope > summary")).toContainText(
      "Cancelled",
    );
    await execution.locator(":scope > summary").click();
    await expect(execution).toContainText(
      "did not save a reply or requirements",
    );
    await expect(
      execution.getByRole("link", { name: "Saved requirement 1" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("activity-cancelled.png"),
      fullPage: true,
    });
  },
);
