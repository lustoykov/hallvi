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
    const composer = page.getByRole("textbox", { name: "Message Server Guy" });
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
    await selectConversation("Deploy application", firstChatId);
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
    // each is hidden, and the empty view says what Server Guy would do there.
    await expect(
      nav.getByRole("button", { name: "Database", exact: true }),
    ).toHaveCount(0);
    await nav.getByRole("button", { name: "Show more", exact: true }).click();
    await expect(
      nav.getByRole("button", {
        name: "Jobs nothing recorded yet",
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
              : "CDN nothing recorded yet",
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
        name: "Exposure has not been read back",
        exact: true,
      }),
    ).toBeVisible();
    await nav
      .getByRole("button", { name: "Database after deployment", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "No database recorded", exact: true }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Show less", exact: true }).click();
    await expect(
      nav.getByRole("button", {
        name: "Jobs nothing recorded yet",
        exact: true,
      }),
    ).toHaveCount(0);
    // The viewed destination stays listed while open, even when hidden.
    await expect(
      nav.getByRole("button", { name: "Database", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    for (const section of [
      "Architecture",
      "Deployment",
      "Backups",
      "Logs",
      "Monitoring",
      "Domains",
      "Environment Variables",
    ]) {
      await nav.getByRole("button", { name: section, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: section, exact: true }),
      ).toBeVisible();
    }
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Environment Variables", exact: true }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Backups", exact: true }).click();
    await expect(
      page.getByText("Not implemented yet", { exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Environment Variables", exact: true }),
    ).toBeVisible();
    // Architecture is the journeys map: follow a journey, open a part.
    await nav
      .getByRole("button", { name: "Architecture", exact: true })
      .click();
    const journeys = page.getByRole("radiogroup", {
      name: "Follow a journey",
    });
    await expect(journeys).toBeVisible();
    const data = journeys.getByRole("radio", { name: "Your data" });
    await data.click();
    await expect(data).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("button", { name: /^Application shell acceptance, / })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(journeys).toBeInViewport();
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

test(
  "deployment reviews exact checks, refreshes changed prices and recovers a rejection",
  journey("application-shell"),
  async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const { randomUUID } = await import("node:crypto");
    let record:
      import("../../src/server/deployment-types").DeploymentRecord | null =
      null;
    let approvals = 0;
    await page.route("**/api/applications/*/deployment", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: { connected: true, deployment: record } });
      const body = route.request().postDataJSON();
      if (body.action === "prepare") {
        record = {
          id: randomUUID(),
          applicationId: "fixture",
          chatId: body.chatId,
          status: "awaiting-approval",
          repository: "qa/deployment-browser",
          repositoryId: 41,
          recommendationId: randomUUID(),
          revision: "a".repeat(40),
          inspectedRevision: "b".repeat(40),
          plan: {
            summary: "Deploy this static application on your own server.",
            dockerfile: "Dockerfile",
            generatedDockerfile: null,
            context: ".",
            port: 8080,
            command: null,
            environment: [],
            postgres: null,
            missingInputs: [{ name: "API_KEY", reason: "Needed at runtime" }],
            healthPath: "/health",
            checks: [
              {
                name: "Application content",
                method: "GET",
                path: "/",
                body: null,
                expectedStatus: 200,
                contains: "My application",
                captureId: null,
              },
            ],
          },
          offer: {
            serverType: "cx23",
            location: "fsn1",
            cores: 2,
            memory: 4,
            monthly: 5.99,
            hourly: 0.01,
            currency: "EUR",
          },
          authority: null,
          serverId: null,
          serverCreateAttempted: false,
          address: null,
          imageId: null,
          url: null,
          verifiedAt: null,
          error: null,
          logs: "",
          events: [],
          createdAt: "2026-09-08",
          updatedAt: "2026-09-08",
        };
      } else if (body.action === "approve") {
        expect(body.recommendationId).toBe(record!.recommendationId);
        expect(body.inputs.API_KEY).toBe("synthetic-input");
        if (++approvals === 1) {
          record!.offer!.monthly = 6.49;
          record!.recommendationId = randomUUID();
          return route.fulfill({
            status: 400,
            json: {
              error:
                "Hetzner pricing changed. Review the updated recommendation.",
            },
          });
        }
        expect(body.maxMonthly).toBe(6.49);
        record!.status = "failed";
        record!.error =
          "Hetzner rejected creation without creating a server. Setup can be retried or cancelled.";
      } else if (body.action === "logs") {
        record!.logs =
          "Old build output\n--- Application logs ---\nweb | application ready\nweb | GET /health 200";
        record!.logsCollectedAt = new Date().toISOString();
      } else if (body.action === "retry") {
        record!.status = "live";
        record!.serverId = 12;
        record!.error = null;
        record!.url = "http://203.0.113.10";
        record!.verifiedAt = new Date().toISOString();
      }
      // The real store stamps every saved change.
      record!.updatedAt = new Date().toISOString();
      return route.fulfill({ json: { deployment: record } });
    });
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/deployment-browser");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    const nav = page.getByRole("navigation", { name: "Application workspace" });
    // The deployment starts from the Deployment view; the recommendation and
    // its decision live in the receipt inside the conversation that started
    // it, and the view links back there.
    await nav.getByRole("button", { name: "Deployment", exact: true }).click();
    const panel = page.getByRole("region", { name: "Deployment", exact: true });
    await panel
      .getByRole("button", { name: "Deploy application", exact: true })
      .click();
    const activity = page.getByRole("status").filter({
      hasText: "Proposed change · not applied",
    });
    await expect(activity).toBeVisible();
    const deploymentRow = nav.getByRole("button", {
      name: "Deployment",
      exact: true,
    });
    await expect(deploymentRow).toHaveAccessibleDescription(/^Waiting for you/);
    await activity
      .getByRole("button", { name: /^Review and approve in/ })
      .click();
    const receipt = page.getByRole("group", {
      name: /^Waiting for you: Deploy/,
    });
    await expect(receipt).toBeVisible();
    await receipt
      .locator("summary")
      .filter({ hasText: "Review deployment configuration" })
      .click();
    await expect(receipt).toContainText("GET / → HTTP 200");
    await expect(receipt).toContainText(
      "differs from the earlier repository inspection",
    );
    await receipt.getByLabel("API_KEY").fill("synthetic-input");
    await receipt
      .getByRole("button", { name: "Create server and deploy" })
      .click();
    await expect(receipt).toContainText("EUR 6.49 / month");
    await expect(receipt.getByLabel("API_KEY")).toHaveValue("synthetic-input");
    await page.screenshot({
      path: testInfo.outputPath("changed-price-review.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 390);
    await receipt
      .locator("summary")
      .filter({ hasText: "Review deployment configuration" })
      .click();
    const approve = receipt.getByRole("button", {
      name: "Create server and deploy",
    });
    await approve.scrollIntoViewIfNeeded();
    await expect(approve).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath("changed-price-mobile.png"),
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await receipt
      .getByRole("button", { name: "Create server and deploy" })
      .click();
    const failed = page.getByRole("group", { name: /^Failed: Deploy/ });
    await expect(failed).toContainText("Hetzner rejected creation");
    await expect(deploymentRow).toHaveAccessibleDescription(/^Failed/);
    await expect(
      failed.getByRole("button", { name: "Cancel deployment setup" }),
    ).toBeVisible();
    await failed.getByRole("button", { name: "Retry this deployment" }).click();
    const verified = page.getByRole("group", { name: /^Verified: Deploy/ });
    await expect(verified).toContainText("public HTTP checks passed");
    await expect(
      verified.getByRole("button", { name: "Cancel deployment setup" }),
    ).toHaveCount(0);
    await expect(deploymentRow).toHaveAccessibleDescription(/^Updated since/);
    await verified
      .getByRole("button", { name: "Open Deployment", exact: true })
      .click();
    // Transit says what is serving, and how sure Server Guy is.
    await expect(panel).toContainText("is serving revision");
    await expect(panel).toContainText("Verified");
    await expect(page.getByRole("button", { name: /^Back to / })).toBeVisible();
    await expect(deploymentRow).not.toHaveAccessibleDescription(
      /Updated since/,
    );
    await nav.getByRole("button", { name: "Logs", exact: true }).click();
    await page
      .getByRole("button", { name: "Refresh logs", exact: true })
      .click();
    const logs = page.getByLabel("Collected application logs", { exact: true });
    await expect(logs).toContainText("application ready");
    await expect(logs).not.toContainText("Old build output");
    await page.getByPlaceholder("Filter collected logs…").fill("/health");
    await expect(logs).toContainText("GET /health 200");
    await expect(logs).not.toContainText("application ready");
    await nav
      .getByRole("button", { name: "Environment Variables", exact: true })
      .click();
    await expect(page.locator(".sg-section-content")).toContainText("API_KEY");
    await expect(page.locator(".sg-section-content")).not.toContainText(
      "synthetic-input",
    );
  },
);
