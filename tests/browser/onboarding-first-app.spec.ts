import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { openConversation } from "./workspace-helpers";

test.use({ freshSetup: true, isolatedApp: true });

// Wait for the actual login request before trusting the click: the setup
// route can still be hydrating when its server-rendered button appears.
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

test("the first application connects ChatGPT and starts one explicitly requested inspection", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/applications/new");
  const repository = page.getByLabel("GitHub repository", { exact: true });
  await expect(repository).toBeEnabled();
  await repository.fill("https://github.com/qa/onboarding-first-app");
  const add = page.getByRole("button", {
    name: "Add application",
    exact: true,
  });

  // The previous inherited desktop minimum width hid the field and action.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeInViewport();
    const bounds = await add.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await add.click();
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
    timeout: 30_000,
  });
  await openConversation(page);
  await expect(
    page.getByRole("heading", {
      name: "Let’s get to know onboarding-first-app.",
    }),
  ).toBeVisible();
  const applicationPath = new URL(page.url()).pathname;
  const connect = page.getByRole("link", {
    name: "Connect ChatGPT",
    exact: true,
  });
  const setupUrl = new URL((await connect.getAttribute("href"))!, page.url());
  const applicationId = applicationPath.split("/")[2];
  const chatId = setupUrl.searchParams.get("chat");
  expect(setupUrl.pathname).toBe("/setup/pi");
  expect(setupUrl.searchParams.get("application")).toBe(applicationId);
  expect(setupUrl.searchParams.get("onboarding")).toBe("1");
  expect(chatId).toMatch(/^[\da-f-]{36}$/);
  const endpoint = `/api/applications/${applicationId}/chats/${chatId}/messages`;
  const userMessages = async () => {
    const response = await page.request.get(endpoint);
    expect(response.ok()).toBe(true);
    const snapshot = await response.json();
    return snapshot.messages.filter(
      (message: { role: string }) => message.role === "user",
    );
  };
  const connectionsUrl = `**/api/applications/${applicationId}/connections`;
  await page.route(connectionsUrl, (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.reload();
  await openConversation(page);
  await expect(
    page.getByRole("link", { name: "Open Settings", exact: true }),
  ).toBeVisible();
  await page.unroute(connectionsUrl);
  await page.reload();
  await openConversation(page);
  await expect(connect).toBeVisible();

  const sends: { message: string; requestKey: string }[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === endpoint
    )
      sends.push(request.postDataJSON());
  });

  await connect.click();
  await page.waitForURL(/\/setup\/pi\?.*onboarding=1/, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Let’s get to know onboarding-first-app.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Model", { exact: true })).toBeHidden();
  const read = page.getByRole("button", {
    name: "Read repository",
    exact: true,
  });
  await expect(read).toBeDisabled();
  expect(await userMessages()).toHaveLength(0);
  await startSignIn(page);
  await expect(page.getByText("Login saved", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(read).toBeEnabled();
  // Saving credentials must not itself authorize a model turn.
  expect(sends).toHaveLength(0);
  expect(await userMessages()).toHaveLength(0);

  const accepted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === endpoint,
  );
  await read.click();
  expect((await accepted).status()).toBe(202);
  await page.waitForURL(
    (url) =>
      url.pathname === applicationPath &&
      url.searchParams.get("chat") === chatId,
    { timeout: 60_000 },
  );
  await openConversation(page);
  expect(sends).toHaveLength(1);
  expect(sends[0].requestKey).toBe(chatId);
  // The action authorizes inspection, not provisioning or deployment.
  expect(sends[0].message).toMatch(/read this repository/i);
  expect(sends[0].message).toContain(
    "Do not rent a server, deploy, or change anything yet.",
  );
  const messages = await userMessages();
  expect(messages).toHaveLength(1);
  expect(messages[0].body).toBe(sends[0].message);

  await page.reload();
  await openConversation(page);
  expect(await userMessages()).toHaveLength(1);
  expect(sends).toHaveLength(1);
});
