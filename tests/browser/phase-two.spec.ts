import type { Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";

async function addApplication(page: Page, name: string) {
  await page.goto("/applications/new");
  await page
    .getByLabel("GitHub repository", { exact: true })
    .fill(`https://github.com/qa/${name}`);
  await page
    .getByRole("button", { name: "Add application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/[\da-f-]{36}$/, {
    timeout: 30_000,
  });
  return new URL(page.url()).pathname;
}
async function view(page: Page) {
  const url = new URL(page.url());
  return (await page.request.get(`/api${url.pathname}${url.search}`)).json();
}
async function send(page: Page, message: string, answer: RegExp) {
  await page.getByRole("textbox", { name: "Message Server Guy" }).fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(answer)).toBeVisible({ timeout: 45_000 });
}

test(
  "P2-01–P2-08 Continue, inspect, propose, correct, reject, re-inspect and read completed history",
  journey("phase-two-contract"),
  async ({ page, fixture }, testInfo) => {
    test.setTimeout(240_000);
    await addApplication(page, "fastapi-app");
    const record = page.getByRole("complementary", {
      name: "Record",
      exact: true,
    });
    await expect(record.getByText("Launch Brief ready")).toBeVisible();
    // Phase 3 never appears as an option; Phase 2 is only reachable by
    // Continue, which the ready Launch Brief offers.
    const continueButton = page.getByRole("button", {
      name: "Continue to Inspect app",
      exact: true,
    });
    await expect(continueButton).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("phase-two-01-launch-brief-ready.png"),
      fullPage: true,
    });
    await continueButton.click();
    await expect(page).toHaveURL(/\?chat=[\da-f-]{36}$/, { timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "View completed phase 1, Start" }),
    ).toBeVisible();
    await expect(page.locator(".sg-phase.active")).toContainText("Inspect app");
    await expect(
      page.locator(".sg-messages").getByText("Started automatically"),
    ).toBeVisible();
    await expect(
      page
        .locator(".sg-messages")
        .getByText(
          "Inspect the repository and propose the Application Contract.",
          { exact: true },
        ),
    ).toBeVisible();
    // No engineer message was invented: the request is Server Guy's.
    await expect(page.locator(".sg-messages .sg-message-user")).toHaveCount(0);
    await expect(
      page.getByText(/\[QA contract\] Proposed Application Contract v1/),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      record.getByText(/^Application Contract v1 · [0-9a-f]{8}$/),
    ).toBeVisible();
    await expect(record.getByText("Ready for review")).toBeVisible();
    await expect(
      record.locator(".sg-provenance.repository-declared").first(),
    ).toBeVisible();
    await expect(
      record.locator(".sg-provenance.profile-rule").first(),
    ).toBeVisible();
    await expect(
      record.locator(".sg-provenance.inferred").first(),
    ).toBeVisible();
    await expect(
      record.getByText("Open product policies for later gates"),
    ).toBeVisible();
    await expect(record.getByText("Needs your decision")).toHaveCount(0);
    const source = record.locator(".sg-contract-source").first();
    await expect(source).toHaveAttribute(
      "href",
      /github\.com\/qa\/fastapi-app\/blob\/[0-9a-f]{40}\/.+#L\d+$/,
    );
    await page.screenshot({
      path: testInfo.outputPath("phase-two-02-contract-established.png"),
      fullPage: true,
    });
    const established = await view(page);
    expect(established.workspace.phaseKey).toBe("inspect-app");
    expect(established.checks.map((c: { status: string }) => c.status)).toEqual(
      ["passed", "passed", "passed", "passed"],
    );
    expect(established.contract.version).toBe(1);
    expect(established.contract.body.fields).toHaveLength(19);

    // Reload keeps the phase, the contract and the transcript.
    await page.reload();
    await expect(
      record.getByText(/^Application Contract v1 · [0-9a-f]{8}$/),
    ).toBeVisible();
    await expect(page.locator(".sg-phase.active")).toContainText("Inspect app");

    // Phase 1 is completed history: readable, read-only, evidence retained.
    await page
      .getByRole("button", { name: "View completed phase 1, Start" })
      .click();
    await expect(page).toHaveURL(/\?chat=[\da-f-]{36}$/);
    await expect(record.getByText("retained as recorded then")).toBeVisible();
    await expect(
      page.getByText("Phase 1 is complete and its chats are read-only"),
    ).toBeVisible();
    const composer = page.getByRole("textbox", { name: "Message Server Guy" });
    await expect(composer).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Start a new phase chat" }),
    ).toHaveCount(0);
    await expect(page.locator(".sg-phase.viewed")).toContainText("Start");
    await page.screenshot({
      path: testInfo.outputPath("phase-two-03-phase-one-read-only.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "View phase 2, Inspect app" })
      .click();
    await expect(composer).toBeEnabled();

    // The engineer corrects one field: a revision with user-confirmed
    // provenance and one old → new Activity item.
    await send(
      page,
      "contract: correct /healthz",
      /\[QA contract\] Proposed Application Contract v2/,
    );
    await expect(
      record.getByText(/^Application Contract v2 · [0-9a-f]{8}$/),
    ).toBeVisible();
    await expect(record.locator('[data-field="health.path"]')).toContainText(
      "/healthz",
    );
    const healthGroup = record.locator(
      '.sg-contract-group:has([data-field="health.path"])',
    );
    if (!(await healthGroup.evaluate((el) => (el as HTMLDetailsElement).open)))
      await healthGroup.locator("summary").click();
    await expect(
      record.locator(
        '[data-field="health.path"] .sg-provenance.user-confirmed',
      ),
    ).toBeVisible();
    await expect(record.locator('[data-field="health.path"]')).toContainText(
      "You said: “/healthz”",
    );
    await page.getByRole("button", { name: /^History/ }).click();
    const events = page
      .getByRole("region", { name: "History", exact: true })
      .locator(".sg-event");
    await expect(events.nth(0)).toContainText("Application Contract revised");
    await expect(events.nth(0)).toContainText(
      "Health endpoint: /health → /healthz",
    );
    await expect(events.nth(1)).toContainText(
      "Application Contract established",
    );
    await expect(events.nth(2)).toContainText("Repository inspected");
    await expect(events.nth(3)).toContainText("Inspect app started");
    await page.screenshot({
      path: testInfo.outputPath("phase-two-04-revised-activity.png"),
      fullPage: true,
    });

    // An invented source is rejected; the attempt still completes and the
    // saved contract is untouched.
    await send(
      page,
      "contract: invented",
      /\[QA contract\] Proposal rejected; nothing was saved/,
    );
    await expect(
      record.getByText(/^Application Contract v2 · [0-9a-f]{8}$/),
    ).toBeVisible();
    expect((await view(page)).contract.version).toBe(2);

    // Explicit re-inspection at the same commit keeps the contract current;
    // a new push makes it stale until revised.
    await page
      .getByRole("button", { name: /Check 1 Supported application profile/ })
      .click();
    await page
      .getByRole("button", { name: "Re-inspect repository", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Re-inspect repository", exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole("dialog")).toContainText("FastAPI + uv v1");
    await page.keyboard.press("Escape");
    expect(
      (await view(page)).checks.map((c: { status: string }) => c.status),
    ).toEqual(["passed", "passed", "passed", "passed"]);
    // The fixture serves one synthetic commit per repository and revision;
    // a new revision is what a push looks like to the inspection.
    writeFileSync(
      join(fixture.state, "github-scenario.json"),
      JSON.stringify({ revision: "2" }),
    );
    await page
      .getByRole("button", { name: /Check 1 Supported application profile/ })
      .click();
    await page
      .getByRole("button", { name: "Re-inspect repository", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Re-inspect repository", exact: true }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(
      record.getByText(/Check 2.*Application Contract complete/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Check 2 Application Contract complete/,
      }),
    ).toContainText("The repository changed since the contract was built");
    await page.screenshot({
      path: testInfo.outputPath("phase-two-05-stale-after-new-commit.png"),
      fullPage: true,
    });
    await send(
      page,
      "contract: correct /healthz",
      /\[QA contract\] Proposed Application Contract v3/,
    );
    expect(
      (await view(page)).checks.map((c: { status: string }) => c.status),
    ).toEqual(["passed", "passed", "passed", "passed"]);
  },
);

test(
  "P2-09 a missing health endpoint becomes Phase 3 work; SQLite needs a decision",
  journey("phase-two-contract"),
  async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await addApplication(page, "fastapi-nohealth");
    await page
      .getByRole("button", { name: "Continue to Inspect app", exact: true })
      .click();
    await expect(
      page.getByText(
        /\[QA contract\] Proposed Application Contract v1 with 19 fields, 0 blocker\(s\) and 1 conformance item\(s\)/,
      ),
    ).toBeVisible({ timeout: 60_000 });
    const record = page.getByRole("complementary", {
      name: "Record",
      exact: true,
    });
    await expect(
      record.getByText("Conformance work for Phase 3"),
    ).toBeVisible();
    await expect(
      record.locator('[data-field="health.path"] .sg-provenance.conformance'),
    ).toBeVisible();
    await expect(record.getByText("Ready for review")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Continue to Make launch-ready",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("phase-two-06-conformance-work.png"),
      fullPage: true,
    });
    await addApplication(page, "fastapi-sqlite");
    await page
      .getByRole("button", { name: "Continue to Inspect app", exact: true })
      .click();
    await expect(
      page.getByText(
        /\[QA contract\] Proposed Application Contract v1 with 19 fields, 1 blocker\(s\)/,
      ),
    ).toBeVisible({ timeout: 60_000 });
    await expect(record.getByText("Needs your decision")).toBeVisible();
    await expect(record.getByText(/3 of 4 checks complete/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Check 4 No unresolved contract gaps/ }),
    ).toContainText("Database (contradiction");
    await page.screenshot({
      path: testInfo.outputPath("phase-two-07-blocker-needs-decision.png"),
      fullPage: true,
    });
  },
);
