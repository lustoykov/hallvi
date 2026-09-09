import {
  openPreparation,
  openConversation,
  openDashboard,
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
async function throughPhaseTwo(page: Page, name: string) {
  await addApplication(page, name);
  await openPreparation(page);
  await page
    .getByRole("button", { name: "Inspect application", exact: true })
    .click();
  await openConversation(page);
  await expect(
    page.getByText(/\[QA contract\] Proposed Application Contract v1/),
  ).toBeVisible({ timeout: 60_000 });
}
function scenario(state: string, value: unknown) {
  writeFileSync(
    join(state, "conformance-scenario.json"),
    JSON.stringify(value),
  );
}
function githubScenario(state: string, value: unknown) {
  writeFileSync(join(state, "github-scenario.json"), JSON.stringify(value));
}

test(
  "P3-01–P3-08 Continue, stage and preview, approve, publish, merge, verify the exact candidate and reload",
  journey("phase-three-conformance"),
  async ({ page, fixture }, testInfo) => {
    test.setTimeout(300_000);
    scenario(fixture.state, { docker: "ready" });
    await throughPhaseTwo(page, "fastapi-p3-nohealth");
    const record = page.getByRole("complementary", {
      name: "Record",
      exact: true,
    });
    await openDashboard(page);
    await expect(
      record.getByText("Conformance work for Phase 3"),
    ).toBeVisible();
    const continueButton = page.getByRole("button", {
      name: "Continue to Make launch-ready",
      exact: true,
    });
    await openPreparation(page);
    await expect(continueButton).toBeVisible();
    await openPreparation(page);
    await continueButton.click();
    await expect(page).toHaveURL(/\?chat=[\da-f-]{36}$/, { timeout: 30_000 });

    await openDashboard(page);
    await expect(
      record.getByText(/^Conformance brief · base [0-9a-f]{8}$/),
    ).toBeVisible();
    await openDashboard(page);
    await expect(record.locator('[data-required="health.path"]')).toContainText(
      "Health endpoint",
    );
    await openDashboard(page);
    await expect(
      record.getByText("No accepted application-behavior check yet"),
    ).toBeVisible();
    await openConversation(page);
    await expect(page.locator(".sg-messages")).toContainText(
      "Next, I’ll prepare and check the exact revision",
    );
    await page.screenshot({
      path: testInfo.outputPath("phase-three-01-brief.png"),
      fullPage: true,
    });

    // Secondary evidence starts collapsed and opens when the person needs it.
    await openDashboard(page);
    await expect(
      record.getByRole("button", { name: /^Environment/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await openDashboard(page);
    await record
      .getByRole("combobox", { name: "Find in Record" })
      .selectOption("environment");
    await openDashboard(page);
    await record
      .getByRole("combobox", { name: "Find in Record" })
      .selectOption("runs");
    // The engine is reachable; the brief names the runner configuration.
    await openDashboard(page);
    await expect(record.getByText("Engine reachable")).toBeVisible();

    // Continue with Server Guy: the request is Server Guy's, the change is
    // staged, previewed in the (scripted) runner and behavior checks proposed.
    await openPreparation(page);
    await page
      .getByRole("button", {
        name: "Work on GitHub with Server Guy",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Start shared preparation", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.locator(".sg-messages").getByText("Started automatically").last(),
    ).toBeVisible();
    await openConversation(page);
    await expect(
      page.getByText(
        /\[QA conformance\] 1 file\(s\) staged; preview passed; behavior checks proposed \(2 steps\)/,
      ),
    ).toBeVisible({ timeout: 90_000 });
    await openDashboard(page);
    await expect(
      record.locator('[data-proposal-status="published"]'),
    ).toBeVisible();
    await openDashboard(page);
    await expect(record.locator('[data-preview="passed"]')).toContainText(
      "Preview passed over this exact change",
    );
    await openDashboard(page);
    await expect(
      record.locator('[data-acceptance-status="proposed"]'),
    ).toBeVisible();
    await openDashboard(page);
    await record.getByRole("button", { name: /Show complete diff/ }).click();
    await openDashboard(page);
    await expect(record.locator(".sg-diff-hunk .added").first()).toContainText(
      '@app.get("/health")',
    );
    await page.screenshot({
      path: testInfo.outputPath("phase-three-02-proposed-change.png"),
      fullPage: true,
    });
    const proposed = await view(page);
    expect(proposed.checks.map((c: { status: string }) => c.status)).toEqual([
      "not-yet",
      "not-yet",
      "not-yet",
    ]);
    expect(proposed.conformance.proposal.status).toBe("published");
    expect(proposed.preparation.pullRequestUrl).toContain("/pull/1");
    expect(proposed.conformance.latestPreview.status).toBe("passed");

    // Accept the behavior checks, approve, allow publishing, publish.
    await openPreparation(page);
    await page
      .getByRole("button", { name: /Accept behavior checks v1/ })
      .click();
    await openDashboard(page);
    await expect(
      record.locator('[data-acceptance-status="accepted"]'),
    ).toBeVisible();
    // The explicit shared-work grant already authorized this checkpoint.
    await openDashboard(page);
    await expect(record.locator('[data-grant="granted"]')).toBeVisible();
    await openDashboard(page);
    await expect(
      record.locator('[data-proposal-status="published"]'),
    ).toBeVisible({ timeout: 30_000 });
    await openDashboard(page);
    await expect(record.locator(".sg-conformance-pull")).toContainText(
      "pull request #1",
    );
    await openDashboard(page);
    await expect(record.locator(".sg-conformance-pull")).toContainText(
      "merge it on GitHub",
    );
    await page.screenshot({
      path: testInfo.outputPath("phase-three-03-published.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: /^History/ }).click();
    const events = page
      .getByRole("region", { name: "History", exact: true })
      .locator(".sg-event");
    await openDashboard(page);
    await expect(
      events.filter({ hasText: "checkpoint" }).first(),
    ).toBeVisible();

    // Unmerged: refresh keeps the candidate open; merge on GitHub (squash),
    // refresh records the observed default-branch head.
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Refresh from GitHub", exact: true })
      .click();
    await openDashboard(page);
    await expect(
      page.getByRole("button", {
        name: /Check 1 Exact candidate revision identified/,
      }),
    ).toContainText("unmerged head gets preview results only");
    githubScenario(fixture.state, { mergePull: 1, mergeMethod: "squash" });
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Refresh from GitHub", exact: true })
      .click();
    await openDashboard(page);
    await expect(record.locator(".sg-conformance-candidate")).toContainText(
      "merged (squash)",
      { timeout: 30_000 },
    );
    const candidate = await view(page);
    expect(candidate.checks.map((c: { status: string }) => c.status)).toEqual([
      "passed",
      "passed",
      "not-yet",
    ]);
    expect(candidate.conformance.proposal.candidate.sha).not.toBe(
      candidate.conformance.proposal.publication.commitSha,
    );
    await page.screenshot({
      path: testInfo.outputPath("phase-three-04-candidate.png"),
      fullPage: true,
    });

    // Verify the candidate: the worker runs the (scripted) check set.
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Verify candidate", exact: true })
      .click();
    await openDashboard(page);
    await expect(
      record.locator('[data-run="candidate"]').first(),
    ).toContainText("Every required check passed", { timeout: 90_000 });
    await openDashboard(page);
    await expect(
      record.locator('[data-run="candidate"] [data-check="behavior"]').first(),
    ).toContainText("Passed");
    await openDashboard(page);
    await expect(
      record.getByText(
        "The Conformance Result checks pass for the exact candidate",
      ),
    ).toBeVisible();
    const verified = await view(page);
    expect(verified.checks.map((c: { status: string }) => c.status)).toEqual([
      "passed",
      "passed",
      "passed",
    ]);
    expect(verified.workspace.status).toBe("ready");
    await page.screenshot({
      path: testInfo.outputPath("phase-three-05-verified.png"),
      fullPage: true,
    });

    // A synthetic runner deliberately cannot supply a real interactive URL.
    // The application must show a failed preview and allow recovery.
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Start application preview", exact: true })
      .click();
    await expect
      .poll(async () => (await view(page)).preview?.status, { timeout: 30_000 })
      .toBe("failed");
    await openPreparation(page);
    await expect(
      page.getByRole("button", {
        name: "Start a new application preview",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "I tested it — the application works",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("application-preview-failed.png"),
      fullPage: true,
    });

    // Reload: everything comes back from records; Phase 2 is read-only history.
    await page.reload();
    await openDashboard(page);
    await expect(record.locator(".sg-conformance-candidate")).toContainText(
      "merged (squash)",
    );

    await openConversation(page);
    await expect(
      page.getByRole("textbox", { name: "Message Server Guy" }),
    ).toBeEnabled();
  },
);

test(
  "P3-09 the Docker prerequisite: missing, stopped, permission denied, recovery and already-ready flows",
  journey("phase-three-conformance"),
  async ({ page, fixture }, testInfo) => {
    test.setTimeout(240_000);
    scenario(fixture.state, { docker: "missing" });
    await page.goto("/setup/execution");
    const card = page.getByRole("region", {
      name: "Execution environment",
      exact: true,
    });
    await expect(card).toContainText("No engine found");
    await expect(card).toContainText("the machine running Server Guy");
    await expect(
      card.getByRole("link", { name: /Official Docker instructions/ }),
    ).toHaveAttribute("href", /docs\.docker\.com/);
    await page.screenshot({
      path: testInfo.outputPath("phase-three-07-docker-missing.png"),
      fullPage: true,
    });
    scenario(fixture.state, { docker: "stopped" });
    await card
      .getByRole("button", { name: "Check again", exact: true })
      .click();
    await expect(card).toContainText("Engine not running", { timeout: 15_000 });
    await expect(card).toContainText("probably stopped");
    await expect(card).toContainText("Start the Docker engine");
    await page.screenshot({
      path: testInfo.outputPath("phase-three-08-docker-stopped.png"),
      fullPage: true,
    });
    scenario(fixture.state, { docker: "denied" });
    await card
      .getByRole("button", { name: "Check again", exact: true })
      .click();
    await expect(card).toContainText("Permission denied", { timeout: 15_000 });
    await expect(card).toContainText("Fix socket permissions");
    await page.screenshot({
      path: testInfo.outputPath("phase-three-09-docker-denied.png"),
      fullPage: true,
    });
    scenario(fixture.state, { docker: "unverified" });
    await card
      .getByRole("button", { name: "Check again", exact: true })
      .click();
    await expect(card).toContainText("Engine reachable", { timeout: 15_000 });
    await expect(card).toContainText("not prepared yet");
    await card
      .getByRole("button", {
        name: "Prepare execution environment",
        exact: true,
      })
      .click();
    await expect(card).toContainText("Execution environment verified", {
      timeout: 30_000,
    });
    await page.screenshot({
      path: testInfo.outputPath("phase-three-10-docker-ready.png"),
      fullPage: true,
    });

    // In the workspace: with the engine missing, Server Guy still stages the
    // change and says it is untested; the Record shows the prerequisite with
    // Check again, and the staged work survives the recovery.
    scenario(fixture.state, { docker: "missing" });
    await throughPhaseTwo(page, "fastapi-p3-recovery-nohealth");
    await openPreparation(page);
    await page
      .getByRole("button", {
        name: "Continue to Make launch-ready",
        exact: true,
      })
      .click();
    const record = page.getByRole("complementary", {
      name: "Record",
      exact: true,
    });
    // The Record checks the engine when it opens, never trusting another
    // process's earlier answer.
    await openDashboard(page);
    await record
      .getByRole("combobox", { name: "Find in Record" })
      .selectOption("environment");
    await openDashboard(page);
    await expect(record.getByText("No engine found")).toBeVisible({
      timeout: 30_000,
    });
    await openPreparation(page);
    await page
      .getByRole("button", {
        name: "Work on GitHub with Server Guy",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Start shared preparation", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.getByText(
        /\[QA conformance\] 1 file\(s\) staged; preview unavailable: The execution environment is not available/,
      ),
    ).toBeVisible({ timeout: 90_000 });
    await openDashboard(page);
    await expect(record.locator('[data-preview="untested"]')).toContainText(
      "Untested since last edit",
    );
    await page.screenshot({
      path: testInfo.outputPath("phase-three-11-untested-without-engine.png"),
      fullPage: true,
    });
    scenario(fixture.state, { docker: "ready" });
    await record
      .getByRole("button", { name: "Check again", exact: true })
      .click();
    await openDashboard(page);
    await record
      .getByRole("combobox", { name: "Find in Record" })
      .selectOption("environment");
    await openDashboard(page);
    await expect(record.getByText("Engine reachable")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /^Environment.*Docker ready/ }),
    ).toBeVisible();
    // The staged proposal is still there; nothing was launched by the recovery.
    await openDashboard(page);
    await expect(
      record.locator('[data-proposal-status="published"]'),
    ).toBeVisible();
    expect((await view(page)).conformance.runs).toEqual([]);
  },
);

test(
  "P3-10 an already-conforming repository needs no pull request but still needs current evidence",
  journey("phase-three-conformance"),
  async ({ page, fixture }, testInfo) => {
    test.setTimeout(240_000);
    scenario(fixture.state, { docker: "ready" });
    await throughPhaseTwo(page, "fastapi-p3-app");
    await openPreparation(page);
    await page
      .getByRole("button", {
        name: "Continue to Make launch-ready",
        exact: true,
      })
      .click();
    const record = page.getByRole("complementary", {
      name: "Record",
      exact: true,
    });
    await openDashboard(page);
    await expect(
      record.getByText("The contract records no required changes").first(),
    ).toBeVisible({ timeout: 30_000 });
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Verify the current revision", exact: true })
      .click();
    await openDashboard(page);
    await expect(
      record.locator('[data-proposal-origin="no-change"]'),
    ).toBeVisible();
    await openDashboard(page);
    await expect(
      page.getByRole("button", {
        name: /Check 3 Profile conformance checks pass/,
      }),
    ).toContainText("No application-behavior check");
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Continue with Server Guy", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.getByText(
        /\[QA conformance\] no change needed; preview passed; behavior checks proposed/,
      ),
    ).toBeVisible({ timeout: 90_000 });
    await openPreparation(page);
    await page
      .getByRole("button", { name: /Accept behavior checks v1/ })
      .click();
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Verify candidate", exact: true })
      .click();
    await openDashboard(page);
    await expect(
      record.locator('[data-run="candidate"]').first(),
    ).toContainText("Every required check passed", { timeout: 90_000 });
    expect(
      (await view(page)).checks.map((c: { status: string }) => c.status),
    ).toEqual(["passed", "passed", "passed"]);
    await page.screenshot({
      path: testInfo.outputPath("phase-three-12-no-change-verified.png"),
      fullPage: true,
    });
  },
);
