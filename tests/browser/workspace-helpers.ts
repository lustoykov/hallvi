import { expect, type Page } from "@playwright/test";

// Opens the Deployment destination; it parks the conversation until
// openConversation.
export async function openDashboard(page: Page) {
  const button = page.getByRole("button", { name: "Deployment", exact: true });
  if ((await button.getAttribute("aria-current")) !== "page")
    await button.click();
}
export async function openConversation(page: Page) {
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}(?:[?#].*)?$/, {
    timeout: 30_000,
  });
  if (await page.locator(".hv-chat-column").isVisible()) return;
  const url = new URL(page.url());
  const view = await (
    await page.request.get(`/api${url.pathname}${url.search}`)
  ).json();
  const chat = view.chats.find(
    (c: { id: string }) => c.id === view.selectedChatId,
  );
  await page
    .getByRole("navigation", { name: "Application workspace" })
    .getByRole("button", {
      name: chat.title + (chat.archivedAt ? " Archived" : ""),
      exact: true,
    })
    .click();
  await expect(page.locator(".hv-chat-column")).toBeVisible();
}
