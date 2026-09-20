import { openConversation } from "./workspace-helpers";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";
import type { Locator } from "@playwright/test";

// ChatGPT is not connected here: this is what a first run looks like.
test.use({ freshSetup: true });

/**
 * Starts the device sign-in and waits until the request has actually left
 * the page. A click that lands before this page hydrates is simply lost, so
 * the one retry covers it; repeating blindly would restart the sign-in.
 */
async function startSignIn(card: Locator, name = "Connect ChatGPT") {
  const page = card.page();
  const connect = card.getByRole("button", { name, exact: true });
  const begun = () =>
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/pi/setup/login") &&
        response.request().method() === "POST",
      { timeout: 45_000 },
    );
  await expect(connect).toBeEnabled({ timeout: 60_000 });
  const first = begun();
  await connect.click();
  try {
    await first;
  } catch {
    const again = begun();
    await connect.click();
    await again;
  }
  await expect(page.getByText("QA-1234", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * The composer that cannot send yet is where most people meet setup, and it
 * used to be a dead end in both directions — nothing could be typed into it,
 * and "Open Settings" led to a page with no way back to the application the
 * question was about. Connecting ended on the applications list.
 *
 * What this protects: the question can be written before the connection
 * exists, connecting happens in that same conversation without leaving it,
 * and the draft is still there — whether the sign-in was saved or cancelled.
 */
test(
  "connecting ChatGPT in the conversation keeps the draft intact",
  journey("connect-and-return"),
  async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/connect-and-return");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const conversation = page.url();
    await openConversation(page);

    const composer = page.getByRole("textbox", {
      name: "Message Hallvi",
      exact: true,
    });
    const send = page.getByRole("button", { name: "Send", exact: true });
    // Writable without a connection; only sending waits for one.
    await expect(composer).toBeEnabled();
    await composer.fill("Does this need a bigger server before the weekend?");
    await expect(send).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath("before-setup.png"),
      fullPage: true,
    });

    // Connecting happens here, so the draft never has to travel anywhere.
    const draft = "Does this need a bigger server before the weekend?";
    await page
      .locator(".hv-pi-required")
      .getByRole("button", { name: "Connect ChatGPT", exact: true })
      .click();
    const card = page.getByRole("region", { name: "Connect ChatGPT" });
    await expect(card).toBeVisible();

    // Hold an already-issued poll across cancellation: its old waiting result
    // must not bring the cancelled card back to life.
    let releasePoll!: () => void;
    const held = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });
    let sawPoll!: () => void;
    const polling = new Promise<void>((resolve) => {
      sawPoll = resolve;
    });
    const pollPath = "**/api/pi/setup/login/*";
    await page.route(pollPath, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      const result = await response.json();
      sawPoll();
      await held;
      await route.fulfill({ json: { ...result, state: "awaiting-user" } });
    });
    await startSignIn(card);
    await polling;
    await card
      .getByRole("button", { name: "Cancel sign-in", exact: true })
      .click();
    await expect(card).toContainText("Nothing was saved");
    const staleResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/pi/setup/login/") &&
        response.request().method() === "GET",
    );
    releasePoll();
    await staleResponse;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(card).toContainText("Sign-in cancelled");
    await page.unroute(pollPath);
    expect(page.url()).toBe(conversation);
    await expect(composer).toHaveValue(draft);
    await expect(send).toBeDisabled();

    // An attempt the controller no longer holds — it restarted, or the code
    // ran out long ago — ends the waiting instead of spinning on it forever.
    const lost = "**/api/pi/setup/login/*";
    await page.route(lost, (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Gone" }),
      }),
    );
    await startSignIn(card, "Get a new code");
    await expect(card).toContainText("This code is no longer valid", {
      timeout: 30_000,
    });
    await expect(
      card.getByRole("button", { name: "Cancel sign-in", exact: true }),
    ).toHaveCount(0);
    await page.unroute(lost);

    // Retry, this time to a saved login. Saved is not verified, and says so.
    await startSignIn(card, "Get a new code");
    await expect(
      page.getByText("ChatGPT login saved · checked with your first message"),
    ).toBeVisible({ timeout: 60_000 });
    expect(page.url()).toBe(conversation);
    await expect(composer).toHaveValue(draft);
    await expect(send).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("after-setup.png"),
      fullPage: true,
    });

    // The draft belongs to this conversation, and goes when it is sent.
    await composer.press("Enter");
    await openConversation(page);
    await expect(composer).toHaveValue("");
    await page.reload();
    await openConversation(page);
    await expect(composer).toHaveValue("");
  },
);
