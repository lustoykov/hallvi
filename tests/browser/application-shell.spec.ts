import { test, expect } from "./fixtures";
import { journey } from "./journeys";
import { openConversation } from "./workspace-helpers";

test(
  "application conversations preserve drafts and messages across navigation and reload",
  journey("application-shell"),
  async ({ page }, testInfo) => {
    // This journey first compiles creation, chat selection and message routes.
    // Bound each HTTP acceptance separately; the first route transition also
    // waits for a cold Next dev compilation on shared CI runners.
    test.setTimeout(240_000);
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/application-shell");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 90_000,
    });
    const nav = page.getByRole("navigation", { name: "Application workspace" });
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    const overview = page.getByRole("heading", {
      name: "Overview",
      exact: true,
    });
    await expect(overview).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    const conversation = page.locator(".hv-chat-column:not(.hv-chat-parked)");
    await expect(conversation).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("default-overview.png"),
    });
    await page.reload();
    await expect(overview).toBeVisible();
    await openConversation(page);
    expect(new URL(page.url()).searchParams.get("chat")).toMatch(
      /^[\da-f-]{36}$/,
    );
    await page.goBack();
    await expect(overview).toBeVisible();
    await page.goForward();
    await expect(conversation).toBeVisible();
    await page.reload();
    await expect(conversation).toBeVisible();
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
    // The sidebar grows with the application: only the pages every
    // application has, plus Access, are listed until a record gives one
    // content. A quiet row reveals the rest, each saying why it is down
    // there, and the empty view says what Hallvi would do on it.
    await expect(
      nav.getByRole("button", { name: "Database", exact: true }),
    ).toHaveCount(0);
    await nav.getByRole("button", { name: "Show more", exact: true }).click();
    await expect(
      nav.getByRole("button", { name: "Jobs not checked", exact: true }),
    ).toBeVisible();
    // Access is listed whatever the records say, because its unknowns are the
    // point. CDN waits, and says its emptiness is a decision rather than a
    // gap in looking.
    await expect(
      nav.getByRole("button", { name: "Access not checked", exact: true }),
    ).toHaveCount(1);
    await expect(
      nav.getByRole("button", { name: "CDN not set up", exact: true }),
    ).toBeVisible();
    await nav
      .getByRole("button", { name: "Database not checked", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Database", exact: true }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Show less", exact: true }).click();
    await expect(
      nav.getByRole("button", { name: "Jobs not checked", exact: true }),
    ).toHaveCount(0);
    // The viewed destination stays listed while open, even when nothing has
    // recorded it, and it keeps saying so on its row while it is open.
    await expect(
      nav.getByRole("button", { name: "Database not checked", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    // Command output is inside Activity now, which is shut when you arrive.
    // Opening it is part of reaching the page, so the journey opens it.
    await nav.getByRole("button", { name: "Activity", exact: true }).click();
    for (const section of ["Architecture", "Deployment", "Command output"]) {
      await nav.getByRole("button", { name: section, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: section, exact: true }),
      ).toBeVisible();
    }
    // Access is listed whatever the records say, and says so on its row. On
    // an application nothing has looked at it takes its empty state rather
    // than drawing boards about nothing, and offers the question that would
    // change it.
    await nav
      .getByRole("button", { name: "Access not checked", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Nothing here has been looked at yet.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Ask Hallvi what can reach it",
        exact: true,
      }),
    ).toBeVisible();
    // Nothing has arranged a copy or a watcher, and nothing has named a
    // variable, so all three wait in the quiet row with their reason. Each is
    // still one press away.
    await nav.getByRole("button", { name: "Show more", exact: true }).click();
    for (const [name, heading] of [
      ["Backups not set up", "Backups"],
      ["Monitoring not set up", "Monitoring"],
    ]) {
      await nav.getByRole("button", { name, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await nav
      .getByRole("button", {
        name: "Environment Variables not checked",
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
    // A reload shuts the quiet row again, so the rest are one press away.
    await nav.getByRole("button", { name: "Show more", exact: true }).click();
    await nav
      .getByRole("button", { name: "Backups not set up", exact: true })
      .click();
    // Unknown inventory and missing protection are stated separately: neither
    // is presented as proof that there is nothing to back up.
    await expect(
      page.getByText(
        "Hallvi has not established what this application keeps on disk.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("No plan has been established", { exact: true }),
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
  async ({ page }, testInfo) => {
    const ids: string[] = [];
    for (const name of ["My app", "Staging"]) {
      await page.goto("/applications/new");
      await page
        .getByLabel("GitHub repository", { exact: true })
        .fill("https://github.com/qa/same-source");
      await page
        .getByRole("button", { name: "Add application", exact: true })
        .click();
      await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
        timeout: 30000,
      });
      ids.push(new URL(page.url()).pathname);
      // The name comes from the repository; the owner's own name for it is
      // given afterwards, from the application's menu.
      await page
        .getByRole("button", { name: "Switch application: same-source" })
        .click();
      await page
        .getByRole("button", { name: "Rename application…", exact: true })
        .click();
      await page.getByLabel("Application name", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Rename", exact: true }).click();
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
    // Independently named deployments of one repository must stay
    // distinguishable at the point where the owner chooses a target.
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    await openConversation(page);
    await composer.fill("Only staging should receive this draft.");
    await page
      .getByRole("button", { name: "Switch application: Staging", exact: true })
      .click();
    const picker = page.getByRole("navigation", {
      name: "Applications",
      exact: true,
    });
    await page.screenshot({
      path: testInfo.outputPath("named-application-picker.png"),
      fullPage: true,
    });
    const first = picker.getByRole("link", {
      name: "My app qa/same-source",
      exact: true,
    });
    await expect(first).toHaveAttribute("href", ids[0]);
    await expect(
      picker.getByRole("link", {
        name: "Staging qa/same-source Current application",
        exact: true,
      }),
    ).toHaveAttribute("href", ids[1]);
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${ids[0]}$`));
    await expect(
      page.getByRole("button", {
        name: "Switch application: My app",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await openConversation(page);
    await expect(composer).toHaveValue("");
    await page
      .getByRole("button", { name: "Switch application: My app", exact: true })
      .click();
    await picker
      .getByRole("link", { name: "Staging qa/same-source", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${ids[1]}$`));
    await openConversation(page);
    await expect(composer).toHaveValue(
      "Only staging should receive this draft.",
    );
    await page.reload();
    await expect(composer).toHaveValue(
      "Only staging should receive this draft.",
    );
  },
);
