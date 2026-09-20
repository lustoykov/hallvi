import { test, expect } from "./fixtures";
test.use({ freshSetup: true, isolatedApp: true });

test("Settings status can retry and account management returns to its chat", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/applications/new");
  await page
    .getByLabel("GitHub repository", { exact: true })
    .fill("https://github.com/qa/settings-return");
  await page
    .getByRole("button", { name: "Add application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
    timeout: 30_000,
  });
  const appPath = new URL(page.url()).pathname;
  const view = await (await page.request.get(`/api${appPath}`)).json();
  const query = `?application=${view.application.id}&chat=${view.selectedChatId}`;
  await page.goto(`/setup/connections${query}`);
  const chatgpt = page
    .locator(".hv-connection")
    .filter({ has: page.getByRole("heading", { name: "ChatGPT" }) });
  const statusPath = "**/api/pi/setup";
  await page.route(statusPath, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Temporary status failure" },
    }),
  );
  await chatgpt
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  const card = page.getByRole("region", { name: "Connect ChatGPT" });
  await expect(card).toContainText("Temporary status failure");
  await page.unroute(statusPath);
  await card.getByRole("button", { name: "Try again", exact: true }).click();
  await card
    .getByRole("button", { name: "Connect ChatGPT", exact: true })
    .click();
  const change = chatgpt.getByRole("link", { name: "Change", exact: true });
  await expect(change).toHaveAttribute("href", `/setup/pi${query}`, {
    timeout: 60_000,
  });
  await change.click();
  await expect(page).toHaveURL(
    new RegExp(`/setup/pi\\?application=${view.application.id}`),
  );
  await expect(
    page.getByRole("button", { name: "Disconnect", exact: true }),
  ).toBeVisible();
  const back = page
    .getByRole("link", { name: "Back to the conversation", exact: true })
    .first();
  await expect(back).toHaveAttribute(
    "href",
    `${appPath}?chat=${view.selectedChatId}`,
  );
  await back.click();
  await expect(page).toHaveURL(
    `${new URL(page.url()).origin}${appPath}?chat=${view.selectedChatId}`,
  );
});
