import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test(
  "application conversations preserve drafts and messages across navigation and reload",
  journey("application-shell"),
  async ({ page }) => {
    // This journey first compiles creation, chat selection and message routes.
    // Bound each HTTP acceptance separately; keep UI assertions at 10 seconds.
    test.setTimeout(180_000);
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/application-shell");
    await page
      .getByLabel("Application name", { exact: true })
      .fill("Application shell acceptance");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30000,
    });
    const nav = page.getByRole("navigation", { name: "Application workspace" });
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    await expect(
      page.getByRole("button", { name: "Overview", exact: true }),
    ).toHaveCount(1);
    await composer.fill("First conversation draft");
    const chatsUrl = new URL(
      `/api${new URL(page.url()).pathname}/chats`,
      page.url(),
    ).href;
    // The cold Next dev fixture compiles this handler on first use. Wait for
    // HTTP creation before starting the unchanged UI-state assertion budget.
    const [created] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url() === chatsUrl && response.request().method() === "POST",
        { timeout: 30_000 },
      ),
      nav
        .getByRole("button", { name: "New conversation", exact: true })
        .click(),
    ]);
    expect(created.status()).toBe(201);
    const createdView: import("../../src/server/types").OperatorView =
      await created.json();
    const secondChatId = createdView.selectedChatId!;
    const firstChatId = createdView.chats.find(
      (chat) => chat.id !== secondChatId,
    )!.id;
    async function selectConversation(title: string, chatId: string) {
      const url = new URL(`/api${new URL(page.url()).pathname}`, page.url());
      url.searchParams.set("chat", chatId);
      const [selected] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url() === url.href &&
            response.request().method() === "GET",
          { timeout: 30_000 },
        ),
        nav.getByRole("button", { name: title, exact: true }).click(),
      ]);
      expect(selected.status()).toBe(200);
      expect((await selected.json()).selectedChatId).toBe(chatId);
    }
    await expect(composer).toHaveValue("");
    await composer.fill("Second conversation draft");
    await selectConversation("Main operator", firstChatId);
    await expect(composer).toHaveValue("First conversation draft");
    await selectConversation("Conversation 2", secondChatId);
    await expect(composer).toHaveValue("Second conversation draft");
    const messagesUrl = `${chatsUrl}/${secondChatId}/messages`;
    const [accepted] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url() === messagesUrl &&
          response.request().method() === "POST",
        { timeout: 30_000 },
      ),
      page.getByRole("button", { name: "Send", exact: true }).click(),
    ]);
    expect(accepted.status()).toBe(202);
    await expect(
      page.getByText("[QA fixture reply] Second conversation draft", {
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("[QA fixture reply] Second conversation draft", {
        exact: true,
      }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Production", { exact: true }),
    ).not.toBeVisible();
    // Before a deployment records the stack, only the application and care
    // destinations exist; Processes, Database and the rest appear as recorded.
    // A quiet row reveals what the application could run, with the reason
    // each is hidden, and the empty view says what Hallvi would do there.
    await expect(
      nav.getByRole("button", { name: "Database", exact: true }),
    ).toHaveCount(0);
    await nav.getByRole("button", { name: "Show more", exact: true }).click();
    await expect(
      nav.getByRole("button", {
        name: "Jobs after deployment",
        exact: true,
      }),
    ).toBeVisible();
    // Delivery is three destinations: Domains is always listed, while CDN and
    // Security wait until a CDN caches or a host is available to inspect.
    await expect(
      nav.getByRole("button", { name: "Domains", exact: true }),
    ).toHaveCount(1);
    for (const hidden of ["CDN", "Security"])
      await expect(
        nav.getByRole("button", {
          name:
            hidden === "Security"
              ? "Security check firewall rules"
              : "CDN after deployment",
          exact: true,
        }),
      ).toBeVisible();
    await nav
      .getByRole("button", {
        name: "Security check firewall rules",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Security",
        exact: true,
      }),
    ).toBeVisible();
    await nav
      .getByRole("button", { name: "Database after deployment", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Database", exact: true }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Show less", exact: true }).click();
    await expect(
      nav.getByRole("button", {
        name: "Jobs after deployment",
        exact: true,
      }),
    ).toHaveCount(0);
    // The viewed destination stays listed while open, even when hidden.
    await expect(
      nav.getByRole("button", { name: "Database", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    // Command output is inside Activity now, which is shut when you arrive.
    // Opening it is part of reaching the page, so the journey opens it.
    await nav.getByRole("button", { name: "Activity", exact: true }).click();
    for (const section of [
      "Architecture",
      "Deployment",
      "Backups",
      "Command output",
      "Monitoring",
      "Domains",
    ]) {
      await nav.getByRole("button", { name: section, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: section, exact: true }),
      ).toBeVisible();
    }
    // Configuration is gated too now: nothing has named a variable, so it
    // waits in the quiet row with its reason rather than being listed.
    await nav.getByRole("button", { name: "Show more", exact: true }).click();
    await nav
      .getByRole("button", {
        name: "Environment Variables after deployment",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Environment Variables", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Environment Variables", exact: true }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Backups", exact: true }).click();
    // Backups is a designed destination now, and its own empty state says the
    // same thing in its own words: nobody has looked, which is never the same
    // as there being nothing to find.
    await expect(
      page.getByText(/Nothing here has been looked at yet/),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Environment Variables", exact: true }),
    ).toBeVisible();
    await nav
      .getByRole("button", { name: "Architecture", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: "Architecture", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await nav
      .getByRole("button", { name: "Conversation 2", exact: true })
      .click();
    await expect(composer).toBeVisible();
    await expect(
      page.getByText("[QA fixture reply] Second conversation draft", {
        exact: true,
      }),
    ).toBeVisible();
  },
);

test(
  "the same repository can create two independent named applications",
  journey("isolation"),
  async ({ page }) => {
    const ids: string[] = [];
    for (const name of ["My app", "Staging"]) {
      await page.goto("/applications/new");
      await page
        .getByLabel("GitHub repository", { exact: true })
        .fill("https://github.com/qa/same-source");
      await page.getByLabel("Application name", { exact: true }).fill(name);
      await page
        .getByRole("button", { name: "Add application", exact: true })
        .click();
      await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
        timeout: 30000,
      });
      ids.push(new URL(page.url()).pathname);
      // The application's name lives in the top-bar picker; the conversation
      // has no permanent panel repeating it.
      await expect(
        page.getByRole("button", {
          name: `Switch application: ${name}`,
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(ids[0]).not.toBe(ids[1]);
  },
);
