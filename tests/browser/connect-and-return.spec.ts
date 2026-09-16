import { openConversation } from "./workspace-helpers";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";
import type { Page } from "@playwright/test";

// ChatGPT is not connected here: this is what a first run looks like.
test.use({ freshSetup: true });

/**
 * Starts the device sign-in and waits until the request has actually left
 * the page. A click that lands before this page hydrates is simply lost, so
 * the one retry covers it; repeating blindly would restart the sign-in.
 */
async function startSignIn(page: Page) {
  const connect = page.getByRole("button", {
    name: "Connect ChatGPT",
    exact: true,
  });
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
 * exists, setup returns to the exact conversation, and the draft is still
 * there — whether the sign-in was saved or cancelled.
 */
test(
  "connecting ChatGPT returns to the conversation with the draft intact",
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
      name: "Message Server Guy",
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

    // The way to setup carries this conversation, and nothing else.
    const toSettings = page.getByRole("link", { name: "Open Settings" });
    const settingsUrl = new URL(
      (await toSettings.getAttribute("href"))!,
      page.url(),
    );
    expect(settingsUrl.pathname).toBe("/setup/pi");
    expect(settingsUrl.searchParams.get("application")).toBe(
      new URL(conversation).pathname.split("/")[2],
    );
    expect(settingsUrl.searchParams.get("chat")).toMatch(/^[\da-f-]{36}$/);
    // The draft itself never travels.
    expect(settingsUrl.search).not.toContain("weekend");

    await toSettings.click();
    // Routes compile on first visit in this development fixture.
    await page.waitForURL(/\/setup\/pi\?/, { timeout: 60_000 });

    // A cancelled sign-in still has a way home, and it is the conversation.
    await startSignIn(page);
    await page
      .getByRole("button", { name: "Cancel sign-in", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Back to the conversation" })
      .first()
      .click();
    await page.waitForURL(/\/applications\/[\da-f-]{36}\?chat=/, {
      timeout: 60_000,
    });
    await openConversation(page);
    await expect(composer).toHaveValue(
      "Does this need a bigger server before the weekend?",
    );
    await expect(send).toBeDisabled();

    // Retry, this time to a saved login.
    await page.getByRole("link", { name: "Open Settings" }).click();
    await page.waitForURL(/\/setup\/pi\?/, { timeout: 60_000 });
    await startSignIn(page);
    await expect(page.getByText("Login saved", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Back to the conversation" })
      .click();
    await page.waitForURL(/\/applications\/[\da-f-]{36}\?chat=[\da-f-]{36}/, {
      timeout: 60_000,
    });
    await openConversation(page);
    await expect(composer).toHaveValue(
      "Does this need a bigger server before the weekend?",
    );
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
