import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test("chat drafts stay separate, selection survives refresh, and archived chats explain their state", journey("chat-navigation"), async ({ page }) => {
  await page.goto("/applications/new");
  await page.getByLabel("GitHub repository", { exact: true }).fill("https://github.com/qa/chat-navigation");
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, { timeout: 30_000 });
  const composer = page.getByRole("textbox", { name: "Message Pi", exact: true });
  await composer.fill("Main chat draft");
  await page.getByRole("button", { name: "Start a new phase chat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Archive chat", exact: true })).toBeEnabled();
  await expect(composer).toHaveValue("");
  await composer.fill("Separate chat draft");
  const secondChatUrl = page.url();
  expect(new URL(secondChatUrl).searchParams.get("chat")).toMatch(/^[\da-f-]{36}$/);
  await page.getByRole("button", { name: /Pi Launch Brief Main phase chat/ }).click();
  await expect(composer).toHaveValue("Main chat draft");
  await page.getByRole("button", { name: /Pi Launch question 2 Separate transcript/ }).click();
  await expect(composer).toHaveValue("Separate chat draft");
  await composer.press("Enter");
  await expect(page.getByText("[QA fixture reply] Separate chat draft", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("[QA fixture reply] Separate chat draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive chat", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /Check 2 Repository readable/ }).click();
  await page.getByRole("button", { name: "Re-run repository check", exact: true }).click();
  await expect(page.getByRole("button", { name: "Re-run repository check", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(secondChatUrl);
  await expect(page.getByRole("button", { name: "Archive chat", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Archive chat", exact: true }).click();
  const archivedChat = page.getByRole("button", { name: /Pi Launch question 2 Separate transcript Archived/ });
  await archivedChat.click();
  await expect(composer).toBeDisabled();
  await expect(page.getByText("This chat is archived and read-only. Choose an active chat or start a new one.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveAttribute("placeholder", "This chat is archived");
  await expect(page.getByText("[QA fixture reply] Separate chat draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Check 1 Application identity/ }).click();
  await page.getByRole("button", { name: "Ask Pi about this check", exact: true }).click();
  await expect(composer).toBeEnabled();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("Explain “Application identity recorded”, its current result, and what I can verify myself.");
});

test("Record tabs support keyboard navigation and long Decisions fit the desktop inspector", journey("chat-navigation"), async ({ page }, testInfo) => {
  await page.goto("/applications/new");
  await page.getByLabel("GitHub repository", { exact: true }).fill("https://github.com/qa/inspector-navigation");
  await page.getByRole("button", { name: "Add application", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, { timeout: 30_000 });
  const tabs = page.getByRole("tablist", { name: "Application record views" });
  await tabs.getByRole("tab", { name: "Record", exact: true }).focus();
  for (const name of ["Activity", "Changes", "Receipts", "Record"]) {
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name, exact: true })).toBeFocused();
    await expect(tabs.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Receipts", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: "Record", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Record", exact: true }).getByText(/Hetzner access|Cloudflare access|Domain starting state|Later phases/)).toHaveCount(0);
  const message = `priority: ${"reliability-".repeat(24)}`;
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill(message);
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toHaveValue(message);
  await expect(page.getByText("Pending", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(`[QA fixture reply] ${message}`, { exact: true })).toBeVisible();
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".sg-decision-list strong")).toBeVisible();
    const fits = await page.locator(".sg-inspector-body").evaluate((element) => element.scrollWidth <= element.clientWidth);
    expect(fits).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`inspector-${width}.png`) });
  }
});
