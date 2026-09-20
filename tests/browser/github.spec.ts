import { openConversation } from "./workspace-helpers";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test(
  "GitHub consent, exact repository evidence, disconnect and re-verification",
  journey("github-connection"),
  async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.goto("/setup/github");
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Connect GitHub", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("github-choose.png"),
      fullPage: true,
    });
    expect(
      (await (await page.request.get("/api/github/setup")).json()).connection,
    ).toBeNull();
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/github-consent");
    // Public repositories can be added without connecting an account.
    await expect(
      page.getByRole("button", { name: "Add application", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("link", { name: "Connect GitHub", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Connect GitHub", exact: true })
      .click();
    await expect(
      page.getByText("Connected as qa-fixture-user", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Choose repositories on GitHub" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("github-connected.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Back to add application" }).click();
    await expect(
      page.getByLabel("GitHub repository", { exact: true }),
    ).toHaveValue("https://github.com/qa/github-consent");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const path = new URL(page.url()).pathname;
    const before = await (await page.request.get(`/api${path}`)).json();
    expect(before.repository).toMatchObject({
      status: "passed",
      connected: true,
    });
    await page.goto("/setup/github");
    await page.getByRole("button", { name: "Storage & privacy" }).click();
    await expect(
      page.getByRole("heading", { name: "Storage & privacy" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Connect GitHub" }),
    ).toBeVisible();
    const disconnected = await (await page.request.get(`/api${path}`)).json();
    expect(disconnected.repository).toMatchObject({
      status: "not-yet",
      connected: false,
    });
    expect(disconnected.messages).toEqual(before.messages);
    await page.goto(path);
    await openConversation(page);
    // Nothing has been established with the login gone, so the welcome only
    // offers to ask, and never offers to read what it has not opened.
    const welcome = page.getByRole("region", {
      name: "Get to know your application",
    });
    await expect(welcome).toContainText("haven’t been able to check");
    await expect(
      welcome.getByRole("button", { name: "Check repository" }),
    ).toBeEnabled();
    await expect(
      welcome.getByRole("button", { name: "Read repository" }),
    ).toHaveCount(0);
    const composer = page.getByRole("textbox", { name: "Message Hallvi" });
    const draft = "Continue after connecting my repository.";
    await composer.fill(draft);
    await page.screenshot({
      path: testInfo.outputPath("github-recovery-action.png"),
      fullPage: true,
    });
    // Settings still reconnects, and still returns to this conversation.
    await page.goto(
      `/setup/github?application=${before.application.id}&chat=${before.selectedChatId}`,
    );
    let releaseCheck!: () => void;
    const heldCheck = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    await page.route("**/api/github/setup/repositories", async (route) => {
      await heldCheck;
      await route.continue();
    });
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(page.getByText("Connected as qa-fixture-user")).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Checking repository…" }),
    ).toBeVisible();
    const reconnected = await (await page.request.get(`/api${path}`)).json();
    expect(reconnected.repository.status).toBe("not-yet");
    await page.screenshot({
      path: testInfo.outputPath("github-checking-repository.png"),
      fullPage: true,
    });
    releaseCheck();
    await expect(
      page.getByRole("status").filter({ hasText: "Repository checks passed." }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("github-reconnected-checks-passed.png"),
      fullPage: true,
    });
    const refreshed = await (await page.request.get(`/api${path}`)).json();
    expect(refreshed.repository.status).toBe("passed");
    expect(refreshed.messages).toEqual(before.messages);
    await page.reload();
    expect(
      (await (await page.request.get(`/api${path}`)).json()).repository,
    ).toEqual(refreshed.repository);
    await page
      .getByRole("link", { name: "Back to the conversation" })
      .first()
      .click();
    await expect(page).toHaveURL(
      `${new URL(page.url()).origin}${path}?chat=${before.selectedChatId}`,
    );
    await openConversation(page);
    await expect(composer).toHaveValue(draft);
    await expect(
      page.getByRole("region", { name: "Repository access" }),
    ).toHaveCount(0);
    // Ordinary Settings uses the same return contract as connection recovery.
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page
      .getByRole("link", { name: "Back to the conversation" })
      .first()
      .click();
    await expect(composer).toHaveValue(draft);
  },
);

test(
  "GitHub device login cancellation, denied authorization and successful replacement",
  journey("github-connection"),
  async ({ page, fixture }, testInfo) => {
    const scenario = (value: object) =>
      writeFileSync(
        join(fixture.state, "github-scenario.json"),
        JSON.stringify(value),
      );
    const application = await (
      await page.request.post("/api/applications", {
        data: {
          repositoryUrl: "https://github.com/qa/device-reconnect",
          requestKey: crypto.randomUUID(),
        },
      })
    ).json();
    scenario({ login: "pending" });
    await page.goto("/setup/github");
    const before = (await (await page.request.get("/api/github/setup")).json())
      .connection;
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(page.getByText("ABCD-1234", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Using qa-fixture-user until the new sign-in succeeds.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Waiting for sign-in" }),
    ).toHaveText("Waiting for sign-in…");
    await expect(page.getByText(/^Code expires in/)).toBeVisible();
    await expect(page.getByText(/^Code expires in/)).toHaveAttribute(
      "aria-live",
      "off",
    );
    await page.screenshot({
      path: testInfo.outputPath("github-device-code.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel sign-in" }).click();
    expect(
      (await (await page.request.get("/api/github/setup")).json()).connection,
    ).toEqual(before);
    scenario({ login: "denied" });
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "GitHub denied this sign-in." }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/github/setup")).json()).connection,
    ).toEqual(before);
    scenario({ login: "success" });
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(
      page.getByText("Separate login for Hallvi", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Repository checks passed." }),
    ).toBeVisible();
    const rechecked = await (
      await page.request.get(`/api/applications/${application.application.id}`)
    ).json();
    expect(rechecked.repository.status).toBe("passed");
    // The new login checked the repository again.
    expect(Date.parse(rechecked.repository.checkedAt)).toBeGreaterThan(
      Date.parse(application.repository.checkedAt),
    );
    const after = (await (await page.request.get("/api/github/setup")).json())
      .connection;
    expect(after.mode).toBe("app");
    expect(after.id).not.toBe(before.id);
    await expect(
      page.getByRole("link", { name: "Choose repositories on GitHub" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/apps/qa-hallvi-app/installations/new",
    );
    await page.setViewportSize({ width: 1394, height: 1354 });
    await page.screenshot({
      path: testInfo.outputPath("github-app-user-desktop.png"),
      fullPage: true,
    });
  },
);

test(
  "GitHub repository permission denial remains an unmet check and can recover",
  journey("github-connection"),
  async ({ page, fixture }) => {
    await page.goto("/setup/github");
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(
      page.getByText("Separate login for Hallvi", { exact: true }),
    ).toBeVisible();
    writeFileSync(
      join(fixture.state, "github-scenario.json"),
      JSON.stringify({ repository: "missing-scope" }),
    );
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/github-permissions");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/);
    const path = new URL(page.url()).pathname;
    const failed = await (await page.request.get(`/api${path}`)).json();
    expect(failed.repository.status).toBe("blocked");
    expect(failed.repository.result).toContain("read access");
    await page.goto("/setup/github");
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Repository checks finished. Some need attention.",
      }),
    ).toBeVisible();
    const repositoryResult = page.getByRole("listitem").filter({
      has: page.getByRole("link", {
        name: "qa/github-permissions",
        exact: true,
      }),
    });
    await expect(repositoryResult).toContainText("Grant Hallvi read access");
    await expect(repositoryResult).toContainText("choose Check again");
    const afterReconnect = await (await page.request.get(`/api${path}`)).json();
    await page.reload();
    expect(
      (await (await page.request.get(`/api${path}`)).json()).repository,
    ).toEqual(afterReconnect.repository);
    // After the owner grants access, the application checks again.
    writeFileSync(join(fixture.state, "github-scenario.json"), "{}");
    await page.goto(path);
    await openConversation(page);
    // Signed in, but this repository is not among the ones chosen: the card
    // says which of the two is missing, and folds away once the check passes.
    // In an untouched conversation the welcome says it first, and never
    // offers to read a repository it cannot open.
    const welcome = page.getByRole("region", {
      name: "Get to know your application",
    });
    await expect(welcome).toContainText(
      "isn’t among the repositories you picked for Hallvi",
    );
    await expect(
      welcome.getByRole("button", { name: "Read repository" }),
    ).toHaveCount(0);
    await welcome.getByRole("button", { name: "Choose repositories" }).click();
    const card = page.getByRole("region", { name: "Repository access" });
    await expect(card).toContainText("Signed in as qa-fixture-user");
    await expect(card).toContainText("read access");
    await card
      .getByRole("button", { name: "Check again", exact: true })
      .click();
    await expect(
      page.getByText("can read qa/github-permissions", { exact: false }),
    ).toBeVisible();
    await expect(card).toHaveCount(0);
    const passed = await (await page.request.get(`/api${path}`)).json();
    expect(passed.repository.status).toBe("passed");
  },
);

test(
  "GitHub renews expired access without another login and recovers from revoked refresh access",
  journey("github-connection"),
  async ({ page, fixture }, testInfo) => {
    const connectionPath = join(fixture.state, "github-connection.json");
    const expireAccess = () => {
      const saved = JSON.parse(readFileSync(connectionPath, "utf8"));
      saved.expiresAt = new Date(Date.now() - 1000).toISOString();
      writeFileSync(connectionPath, JSON.stringify(saved));
      return saved;
    };
    await page.goto("/setup/github");
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(
      page.getByText("Access renews automatically.", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/renewed-access");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
      timeout: 30_000,
    });
    const appUrl = page.url();
    const appPath = new URL(appUrl).pathname;
    // The application's own check, as its Check again button runs it.
    const checkAgain = () =>
      page.request.post(`/api${appPath}/repository-check`, { data: {} });
    const old = expireAccess();
    await page.reload();
    await openConversation(page);
    await expect(
      page.getByRole("region", { name: "Repository access" }),
    ).toHaveCount(0);
    // Checking again renews the expired access without another login.
    expect((await checkAgain()).status()).toBe(200);
    expect(
      (await (await page.request.get(`/api${appPath}`)).json()).repository
        .status,
    ).toBe("passed");
    await expect
      .poll(() => JSON.parse(readFileSync(connectionPath, "utf8")).token)
      .toBe("ghu_QA-RENEWED");
    const renewed = JSON.parse(readFileSync(connectionPath, "utf8"));
    expect(renewed.id).toBe(old.id);
    expect(renewed.refresh.token).toBe("ghr_QA-RENEWED");
    const publicStatus = await (
      await page.request.get("/api/github/setup")
    ).text();
    expect(publicStatus).not.toMatch(/ghu_|ghr_/);
    await page.goto("/setup/github");
    await expect(
      page.getByText("Access renews automatically.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("github-automatic-renewal.png"),
      fullPage: true,
    });
    expireAccess();
    writeFileSync(
      join(fixture.state, "github-scenario.json"),
      JSON.stringify({ refresh: "revoked" }),
    );
    await checkAgain();
    await page.goto("/setup/github");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Sign in again",
    );
    await expect(page.getByRole("main").getByRole("alert")).not.toContainText(
      "QA-SECRET",
    );
    await page.getByRole("button", { name: "Connect GitHub" }).click();
    await expect(
      page.getByText("Access renews automatically.", { exact: true }),
    ).toBeVisible();
    expect(JSON.parse(readFileSync(connectionPath, "utf8")).id).not.toBe(
      old.id,
    );
  },
);
