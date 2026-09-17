// Captures the reference prototype: every scenario step, each stable view
// in its populated state, the other screens and a few interactions. Evidence
// for the handoff; not a test. Usage:
//   node tests/browser/reference.capture.mjs http://127.0.0.1:3300 [quick]
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3300";
const quick = process.argv[3] === "quick";
const out = "tests/results/reference";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  // Schedules say "UTC"; the scenario clock is UTC. Keep every time aligned.
  timezoneId: "UTC",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

async function shot(name, options = {}) {
  await page.waitForTimeout(options.wait ?? 500);
  await page.screenshot({
    path: `${out}/${name}.png`,
    fullPage: options.fullPage ?? false,
  });
  console.log(`captured ${name}`);
}
async function open(query, ready) {
  await page.goto(`${base}/prototype/app?${query}`);
  if (ready) await page.getByRole(ready.role, ready).first().waitFor();
  else await page.waitForSelector(".sg-adaptive-shell");
}
const nav = () =>
  page.getByRole("navigation", { name: "Application workspace" });

// Screens outside the workspace.
await page.goto(`${base}/prototype`);
await shot("00-index", { fullPage: true });
await page.goto(`${base}/prototype/applications`);
await shot("01-applications");
await page.goto(`${base}/prototype/applications?state=empty`);
await shot("01b-applications-empty");
await page.getByRole("link", { name: "Add application", exact: true }).click();
await expect(page).toHaveURL(`${base}/prototype/new`);
await shot("02-add-application");
// The shared form must remain a simulation here, even with a real connected
// controller. Abort unexpected API requests before they can mutate anything.
const creationRequests = [];
const blockCreation = async (route) => {
  creationRequests.push(route.request().url());
  await route.abort();
};
await page.route("**/api/applications", blockCreation);
await page
  .getByLabel("GitHub repository", { exact: true })
  .fill("https://github.com/example/reference-only");
await page
  .getByRole("button", { name: "Add application", exact: true })
  .click();
await expect(page).toHaveURL(/\/prototype\/app\?scenario=simple&step=0/);
expect(creationRequests).toEqual([]);
await page.unroute("**/api/applications", blockCreation);
await page.goto(`${base}/prototype/new?state=no-github`);
await shot("02b-add-application-no-github");
await page.goto(`${base}/prototype/settings/connections`);
await shot("03-connections", { fullPage: true });
await page.goto(`${base}/prototype/settings/connections?state=expired`);
await shot("03b-connections-expired", { fullPage: true });
await page.goto(`${base}/prototype/settings/connections?state=fresh`);
await shot("03c-connections-fresh", { fullPage: true });
await page.goto(`${base}/setup/pi`);
await shot("04-settings-chatgpt", { fullPage: true });
await page.goto(`${base}/setup/github`);
await shot("04b-settings-github", { fullPage: true });
await page.goto(`${base}/setup/execution`);
await shot("04c-settings-execution", { fullPage: true });

// Simple scenario: the first deployment and the adaptive stack.
await open("scenario=simple&step=0");
await shot("10-simple-00-added");
await open("scenario=simple&step=1");
await shot("10-simple-01-inspecting");
await open("scenario=simple&step=2");
await shot("10-simple-02-recommendation");
await open("scenario=simple&step=2&section=deployment");
await shot("10-simple-02b-deployment-view-waiting");
await open("scenario=simple&step=3");
await shot("10-simple-03-deploying");
await open("scenario=simple&step=3&section=logs");
await shot("10-simple-03b-logs-while-deploying");
await open("scenario=simple&step=4");
await shot("10-simple-04-verified");
await open("scenario=simple&step=4&section=overview");
await shot("10-simple-04b-overview", { fullPage: true });
await open("scenario=simple&step=4&section=processes");
await nav().getByRole("button", { name: "Show more", exact: true }).click();
await shot("10-simple-04c-show-more");
await open("scenario=simple&step=5");
await shot("10-simple-05-backup-proposal");
await open("scenario=simple&step=6&section=backups");
await shot("10-simple-06-backups", { fullPage: true });
await open("scenario=simple&step=7&section=domains");
await shot("10-simple-07-domain-pending", { fullPage: true });
await open("scenario=simple&step=8&section=domains");
await shot("10-simple-08-https", { fullPage: true });
await open("scenario=simple&step=9&section=overview");
await shot("10-simple-09-down-overview", { fullPage: true });
await open("scenario=simple&step=10&section=monitoring");
await shot("10-simple-10-recovered-monitoring", { fullPage: true });
await open("scenario=simple&step=11&section=deployment");
await shot("10-simple-11-candidate", { fullPage: true });
await open("scenario=simple&step=13&section=deployment");
await shot("10-simple-13-released", { fullPage: true });
await open("scenario=simple&step=14&section=overview");
await shot("10-simple-14-host-unreachable", { fullPage: true });

if (!quick) {
  // Rich scenario: every step from the conversation, then each view.
  const richSteps = 27;
  for (let step = 0; step < richSteps; step += 1) {
    await open(`scenario=rich&step=${step}`);
    await shot(`20-rich-${String(step).padStart(2, "0")}-conversation`);
  }
  for (const [step, section] of [
    [0, "overview"],
    [0, "architecture"],
    [0, "processes"],
    [0, "database"],
    [0, "cache"],
    [0, "jobs"],
    [0, "storage"],
    [0, "backups"],
    [0, "logs"],
    [0, "monitoring"],
    [0, "domains"],
    [0, "variables"],
    [3, "backups"],
    [5, "backups"],
    [6, "backups"],
    [7, "overview"],
    [7, "backups"],
    [8, "backups"],
    [11, "monitoring"],
    [11, "jobs"],
    [11, "processes"],
    [12, "processes"],
    [14, "jobs"],
    [15, "deployment"],
    [17, "deployment"],
    [19, "domains"],
    [21, "domains"],
    [22, "variables"],
    [25, "overview"],
    [25, "monitoring"],
    [26, "monitoring"],
  ]) {
    await open(`scenario=rich&step=${step}&section=${section}`);
    await shot(`21-rich-${String(step).padStart(2, "0")}-${section}`, {
      fullPage: true,
    });
  }
}

// Interactions in memory: run a job, refresh logs, ask a question, reveal.
await open("scenario=rich&step=13&section=jobs");
await page
  .getByRole("button", { name: "Run now", exact: true })
  .first()
  .click();
await shot("30-interaction-run-job-started");
await page.waitForTimeout(6500);
await shot("30-interaction-run-job-done", { fullPage: true });
await open("scenario=rich&step=13");
const composer = page.getByRole("textbox", { name: "Message Haldur" });
await composer.fill("Is my data backed up?");
await page.getByRole("button", { name: "Send", exact: true }).click();
await page.getByText("Refers to", { exact: true }).waitFor();
await shot("31-interaction-ask-backups");
await composer.fill("Show me the latest logs");
await page.getByRole("button", { name: "Send", exact: true }).click();
await page.getByText("Collected application logs").first().waitFor();
await shot("31b-interaction-ask-logs");
await open("scenario=rich&step=7&section=overview");
await page
  .getByRole("button", { name: /^Investigate/ })
  .first()
  .click();
await page
  .getByRole("group", { name: /Deploy|Nightly backup/ })
  .first()
  .waitFor();
await shot("32-interaction-investigate");
await open("scenario=rich&step=3");
await page.getByLabel("R2 API token").fill("not-a-real-token");
await page.getByRole("button", { name: "Approve and set up backups" }).click();
await page
  .getByRole("group", { name: /^Working: Configure nightly/ })
  .waitFor();
await shot("33-interaction-approve");
await open("scenario=rich&step=13");
await page.getByRole("button", { name: /Switch application/ }).click();
await shot("34-application-picker");
await page.getByRole("button", { name: "Remove application…" }).click();
await page.getByRole("dialog").waitFor();
await shot("35-remove-dialog");
await page.keyboard.press("Escape");
await open("scenario=rich&step=10");
await page.getByRole("button", { name: "Archive chat" }).click();
await page.getByText("Archived · read-only").waitFor();
await shot("36-archived-conversation");

// Mobile.
await page.setViewportSize({ width: 390, height: 844 });
await open("scenario=rich&step=8");
await shot("40-mobile-conversation");
await open("scenario=rich&step=13&section=overview");
await shot("40b-mobile-overview", { fullPage: true });
await open("scenario=rich&step=14&section=jobs");
await shot("40c-mobile-jobs", { fullPage: true });

await browser.close();
if (errors.length) {
  console.error("page errors", errors);
  process.exit(1);
}
console.log("done");
