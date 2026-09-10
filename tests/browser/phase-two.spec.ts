import {
  openConversation,
  openDashboard,
  openPreparation,
} from "./workspace-helpers";
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
  await openConversation(page);
  await page.getByRole("textbox", { name: "Message Server Guy" }).fill(message);
  await openConversation(page);
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
    await openDashboard(page);
    await expect(record.getByText("Launch Brief ready")).toBeVisible();
    // Phase 3 never appears as an option; Phase 2 is only reachable by
    // Continue, which the ready Launch Brief offers.
    const continueButton = page.getByRole("button", {
      name: "Inspect application",
      exact: true,
    });
    await openPreparation(page);
    await expect(continueButton).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("phase-two-01-launch-brief-ready.png"),
      fullPage: true,
    });
    await openPreparation(page);
    await continueButton.click();
    await expect(page).toHaveURL(/\?chat=[\da-f-]{36}$/, { timeout: 30_000 });

    await openConversation(page);
    await expect(
      page.locator(".sg-messages").getByText("Started automatically").last(),
    ).toBeVisible();
    await openConversation(page);
    await expect(
      page
        .locator(".sg-messages")
        .getByText(
          "Inspect the repository and propose the Application Contract.",
          { exact: true },
        ),
    ).toBeVisible();
    // No engineer message was invented: the request is Server Guy's.
    await openConversation(page);
    await expect(page.locator(".sg-messages .sg-message-user")).toHaveCount(0);
    await openConversation(page);
    await expect(
      page.getByText(/\[QA contract\] Proposed Application Contract v1/),
    ).toBeVisible({ timeout: 60_000 });
    await openDashboard(page);
    await expect(
      record.getByText(/^Application Contract v1 · [0-9a-f]{8}$/),
    ).toBeVisible();
    await openDashboard(page);
    await expect(record.getByText("Ready for review")).toBeVisible();
    await openDashboard(page);
    await record.locator(".sg-contract-group").evaluateAll((groups) =>
      groups.forEach((group) => {
        (group as HTMLDetailsElement).open = true;
      }),
    );
    await openDashboard(page);
    await expect(
      record.locator(".sg-provenance.repository-declared").first(),
    ).toBeVisible();
    await openDashboard(page);
    await expect(
      record.locator(".sg-provenance.profile-rule").first(),
    ).toBeVisible();
    await openDashboard(page);
    await expect(
      record.locator(".sg-provenance.inferred").first(),
    ).toBeVisible();
    await openDashboard(page);
    await expect(
      record.getByText("Open product policies for later gates"),
    ).toBeVisible();
    await openDashboard(page);
    await expect(record.getByText("Needs your decision")).toHaveCount(0);
    const source = record.locator(".sg-contract-source").first();
    // Synthetic repository: the citation names the file and line, and the
    // invented GitHub page is labelled as demo rather than linked.
    await expect(source).toContainText(/[\w.\/-]+:\d+/);
    await expect(source).toContainText("demo · not a real link");
    await expect(source.locator("a")).toHaveCount(0);
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
    await openDashboard(page);
    await expect(
      record.getByText(/^Application Contract v1 · [0-9a-f]{8}$/),
    ).toBeVisible();

    // Earlier conversations stay available under application ownership.
    await openConversation(page);
    await expect(
      page.getByRole("textbox", { name: "Message Server Guy" }),
    ).toBeEnabled();

    // The engineer corrects one field: a revision with user-confirmed
    // provenance and one old → new Activity item.
    await openConversation(page);
    await send(
      page,
      "contract: correct /healthz",
      /\[QA contract\] Proposed Application Contract v2/,
    );
    await openDashboard(page);
    await expect(
      record.getByText(/^Application Contract v2 · [0-9a-f]{8}$/),
    ).toBeVisible();
    await openDashboard(page);
    await expect(record.locator('[data-field="health.path"]')).toContainText(
      "/healthz",
    );
    const healthGroup = record.locator(
      '.sg-contract-group:has([data-field="health.path"])',
    );
    if (!(await healthGroup.evaluate((el) => (el as HTMLDetailsElement).open)))
      await healthGroup.locator("summary").click();
    await openDashboard(page);
    await expect(
      record.locator(
        '[data-field="health.path"] .sg-provenance.user-confirmed',
      ),
    ).toBeVisible();
    await openDashboard(page);
    await expect(record.locator('[data-field="health.path"]')).toContainText(
      "You said: “/healthz”",
    );
    await page.getByRole("button", { name: /^History/ }).click();
    const events = page
      .getByRole("region", { name: "History", exact: true })
      .locator(".sg-event");
    await openDashboard(page);
    await expect(events.nth(0)).toContainText("Application Contract revised");
    await openDashboard(page);
    await expect(events.nth(0)).toContainText(
      "Health endpoint: /health → /healthz",
    );
    await openDashboard(page);
    await expect(events.nth(1)).toContainText(
      "Application Contract established",
    );
    await openDashboard(page);
    await expect(events.nth(2)).toContainText("Repository inspected");
    await openDashboard(page);
    await expect(events.nth(3)).toContainText("Inspect app started");
    await openDashboard(page);
    await page.screenshot({
      path: testInfo.outputPath("phase-two-04-revised-activity.png"),
      fullPage: true,
    });

    // An invented source is rejected; the attempt still completes and the
    // saved contract is untouched.
    await openConversation(page);
    await send(
      page,
      "contract: invented",
      /\[QA contract\] Proposal rejected; nothing was saved/,
    );
    await openDashboard(page);
    await expect(
      record.getByText(/^Application Contract v2 · [0-9a-f]{8}$/),
    ).toBeVisible();
    expect((await view(page)).contract.version).toBe(2);

    // Explicit re-inspection at the same commit keeps the contract current;
    // a new push makes it stale until revised.
    await openDashboard(page);
    await page
      .getByRole("button", { name: /Check 1 Supported application profile/ })
      .click();
    await page
      .getByRole("button", { name: "Re-inspect repository", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Re-inspect repository", exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole("dialog")).toContainText(
      "FastAPI + uv selected from repository evidence",
    );
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
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Change selected revision", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review impact", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "What needs doing again" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Use this commit and review Phase 2",
        exact: true,
      })
      .click();
    await openDashboard(page);
    await expect(
      record.getByText(/Check 2.*Application Contract complete/),
    ).toBeVisible();
    await openDashboard(page);
    await expect(
      page.getByRole("button", {
        name: /Check 2 Application Contract complete/,
      }),
    ).toContainText("The repository changed since the contract was built");
    await page.screenshot({
      path: testInfo.outputPath("phase-two-05-stale-after-new-commit.png"),
      fullPage: true,
    });
    await openConversation(page);
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
