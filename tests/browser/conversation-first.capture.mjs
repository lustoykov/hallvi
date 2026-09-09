// Captures the conversation-first shell on a running QA fixture with the
// deployment endpoint scripted through its states. Evidence for the
// integration report; not a test. Usage:
//   node tests/browser/conversation-first.capture.mjs http://127.0.0.1:3290
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3290";
const scenario = process.argv[3] ?? "rich";
const out = `tests/results/conversation-first/${scenario}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

let record = null;
const at = () => new Date().toISOString();
const rich = scenario === "rich";
const plan = {
  summary: rich
    ? "Deploy the document archive from its upstream image with a private PostgreSQL database, a Valkey broker for its Celery workers and persistent document storage on one server."
    : "Deploy this static site from its Dockerfile on one small server. It keeps no data of its own.",
  dockerfile: "Dockerfile",
  generatedDockerfile: null,
  context: ".",
  port: rich ? 8000 : 8080,
  command: rich ? ["gunicorn", "paperless.wsgi"] : null,
  environment: [{ name: "PORT", value: rich ? "8000" : "8080" }],
  postgres: rich
    ? { version: "16", variable: "DATABASE_URL", scheme: "postgresql" }
    : null,
  missingInputs: [
    { name: "SECRET_KEY", reason: "Signs session cookies at runtime" },
  ],
  healthPath: "/health",
  checks: [
    {
      name: "Home page",
      method: "GET",
      path: "/",
      body: null,
      expectedStatus: 200,
      contains: rich ? "Documents" : "Hello",
      captureId: null,
    },
  ],
};
// Nothing records these yet: the executor runs one web process plus optional
// PostgreSQL. This scripted record shows the richer stack the views are
// built for; it never reaches a product route.
const recordedStack = rich
  ? {
      processes: [
        {
          name: "worker",
          role: "worker",
          command: "celery -A paperless worker",
          consumes: "Celery queue on Valkey",
        },
      ],
      services: [
        {
          kind: "valkey",
          name: "broker",
          version: "8",
          role: "broker",
          persistence: "Append-only file · pending work survives a restart",
        },
      ],
      queues: [{ library: "Celery", backend: "redis", workers: ["worker"] }],
      jobs: [
        {
          name: "Consume inbox",
          command: "document_consumer",
          schedule: "Every 10 minutes",
          timezone: "UTC",
          runsIn: "app",
          nextRunAt: new Date(Date.now() + 6 * 60000).toISOString(),
          lastRun: {
            at: new Date(Date.now() - 4 * 60000).toISOString(),
            outcome: "succeeded",
            durationSeconds: 12,
          },
        },
        {
          name: "Nightly cleanup",
          command: "document_sanity_checker",
          schedule: "Daily at 03:00",
          timezone: "UTC",
          runsIn: "app",
          nextRunAt: new Date(Date.now() + 14 * 3600000).toISOString(),
          lastRun: {
            at: new Date(Date.now() - 8 * 3600000).toISOString(),
            outcome: "failed",
            durationSeconds: 3,
          },
        },
      ],
      volumes: [
        {
          name: "media",
          usedBy: "app",
          mount: "/usr/src/paperless/media",
          kind: "files",
        },
        {
          name: "consume",
          usedBy: "app",
          mount: "/usr/src/paperless/consume",
          kind: "files",
        },
      ],
    }
  : undefined;
const offer = {
  serverType: "cx23",
  location: "fsn1",
  cores: 2,
  memory: 4,
  monthly: 5.99,
  hourly: 0.01,
  currency: "EUR",
};
await page.route("**/api/applications/*/deployment", async (route) => {
  if (route.request().method() === "GET")
    return route.fulfill({ json: { connected: true, deployment: record } });
  const body = route.request().postDataJSON();
  if (body.action === "prepare") {
    // A second conversation refers to the existing deployment.
    if (record) return route.fulfill({ json: { deployment: record } });
    const now = at();
    record = {
      id: randomUUID(),
      applicationId: "fixture",
      chatId: body.chatId,
      status: "awaiting-approval",
      repository: rich ? "qa/document-archive" : "qa/static-site",
      repositoryId: 41,
      stack: recordedStack,
      recommendationId: randomUUID(),
      revision: "7f281ad255fc0c4b9d6a2e5f1b3c7d8e9a0b1c2d",
      inspectedRevision: null,
      plan,
      offer,
      authority: null,
      serverId: null,
      serverCreateAttempted: false,
      address: null,
      imageId: null,
      url: null,
      verifiedAt: null,
      error: null,
      logs: "",
      events: [
        { at: now, message: "Inspecting the repository at an exact revision" },
        { at: now, message: "Reading Dockerfile" },
        {
          at: now,
          message:
            "Deployment configuration prepared; checking current Hetzner prices",
        },
        {
          at: now,
          message: "Recommendation ready. No server has been purchased.",
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  } else if (body.action === "approve") {
    record.status = "deploying";
    record.authority = {
      acceptedAt: at(),
      connectionId: "c",
      maxMonthly: 5.99,
    };
    record.events.push(
      { at: at(), message: "Creating the accepted Hetzner instance" },
      { at: at(), message: "Waiting for SSH on 203.0.113.10" },
      { at: at(), message: "Building the application image with Compose" },
    );
    record.updatedAt = at();
  } else if (body.action === "verify-now") {
    record.status = "live";
    record.address = "203.0.113.10";
    record.url = "http://203.0.113.10";
    record.serverId = 12;
    record.verifiedAt = at();
    record.updatedAt = at();
    record.events.push(
      { at: at(), message: "Passed: Home page" },
      { at: at(), message: "Deployment verified" },
    );
  } else if (body.action === "fail-now") {
    record.status = "failed";
    record.error =
      "The nightly image rebuild stopped: the host ran out of disk while building. The running application is unchanged.";
    record.updatedAt = at();
  } else if (body.action === "retry") {
    record.status = "live";
    record.error = null;
    record.updatedAt = at();
    record.events.push({ at: at(), message: "Retry verified the same image" });
  } else if (body.action === "logs") {
    record.logs =
      "Build output\n--- Application logs ---\nweb | application ready\nweb | GET /health 200";
    record.logsCollectedAt = at();
  }
  return route.fulfill({ json: { deployment: record } });
});
// The fixture's chat messages are real; the mention reply is what the real
// backend records when a second conversation asks to deploy.
page.on("response", () => {});

async function shot(name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log(`captured ${name}`);
}
async function post(action) {
  await page.evaluate(async (action) => {
    await fetch(`/api/applications/x/deployment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, deploymentId: "x" }),
    });
  }, action);
  await page.waitForTimeout(2800);
}

await page.goto(`${base}/applications/new`);
await page
  .getByLabel("GitHub repository", { exact: true })
  .fill(`https://github.com/qa/${rich ? "document-archive" : "static-site"}`);
await page
  .getByLabel("Application name", { exact: true })
  .fill(rich ? "Document archive" : "Static site");
await page
  .getByRole("button", { name: "Add application", exact: true })
  .click();
await page.waitForURL(/\/applications\/[\da-f-]{36}$/, { timeout: 30000 });
const nav = page.getByRole("navigation", { name: "Application workspace" });
const composer = page.getByRole("textbox", { name: "Message Server Guy" });
await composer.fill("Deploy this repository on a small server, please.");
await page.getByRole("button", { name: "Send", exact: true }).click();
await page.getByText("[QA fixture reply]").first().waitFor({ timeout: 30000 });
await shot("01-conversation-before");

await nav.getByRole("button", { name: "Deployment", exact: true }).click();
await page
  .getByRole("region", { name: "Deployment", exact: true })
  .getByRole("button", { name: "Deploy application", exact: true })
  .click();
await page.getByText("Proposed change · not applied").waitFor();
await shot("02-deployment-view-proposed");
await page.getByRole("button", { name: /^Review and approve in/ }).click();
await page.getByRole("group", { name: /^Waiting for you: Deploy/ }).waitFor();
await shot("03-receipt-proposed");
await page.getByLabel("SECRET_KEY").fill("not-a-real-secret");
await page.getByRole("button", { name: "Create server and deploy" }).click();
await page.getByRole("group", { name: /^Working: Deploy/ }).waitFor();
await shot("04-receipt-working");
await nav.getByRole("button", { name: "Logs", exact: true }).click();
await page.getByRole("button", { name: /^Active work: Deploy/ }).waitFor();
await shot("05-logs-while-working");
await post("verify-now");
await page.getByRole("button", { name: /^Back to / }).click();
await page.getByRole("group", { name: /^Verified: Deploy/ }).waitFor();
await shot("06-receipt-verified-marks");
await nav.getByRole("button", { name: "Overview", exact: true }).click();
await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
await shot("07-overview-verified");
await nav.getByRole("button", { name: "Architecture", exact: true }).click();
await page
  .getByRole("heading", { name: "Architecture", exact: true })
  .waitFor();
await shot("07b-architecture");
await nav.getByRole("button", { name: "Processes", exact: true }).click();
await page.getByRole("heading", { name: "Processes", exact: true }).waitFor();
await shot("07c-processes");
if (!rich) {
  // The reveal: what else this application could run, and why it is hidden.
  await nav.getByRole("button", { name: "Show more", exact: true }).click();
  await shot("07j-reveal-show-more");
  await nav.getByRole("button", { name: /^Jobs / }).click();
  await page.getByRole("heading", { name: "Jobs", exact: true }).waitFor();
  await shot("07k-jobs-possible");
  await nav.getByRole("button", { name: "Show less", exact: true }).click();
}
if (rich) {
  for (const [label, name] of [
    ["Database", "07d-database"],
    ["Cache & queue", "07e-cache-queue"],
    ["Jobs", "07f-jobs"],
    ["Storage", "07g-storage"],
  ]) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
    await shot(name);
  }
}
await nav.getByRole("button", { name: "Backups", exact: true }).click();
await page.getByRole("heading", { name: "Backups", exact: true }).waitFor();
await shot("07h-backups");
await nav.getByRole("button", { name: "Monitoring", exact: true }).click();
await page.getByRole("heading", { name: "Monitoring", exact: true }).waitFor();
await shot("07i-monitoring");
await nav.getByRole("button", { name: "Logs", exact: true }).click();
await page.getByRole("button", { name: "Refresh logs", exact: true }).click();
await page.getByText("application ready").waitFor();
await shot("08-logs-inspected");
await post("fail-now");
await nav.getByRole("button", { name: "Overview", exact: true }).click();
await page
  .getByText("This needs you")
  .first()
  .waitFor()
  .catch(() => {});
await page.getByRole("region", { name: "Needs you" }).waitFor();
await shot("09-overview-failed");
await page.getByRole("button", { name: "Open the conversation" }).click();
await page.getByRole("group", { name: /^Failed: Deploy/ }).waitFor();
await shot("10-receipt-failed");
await page.getByRole("button", { name: "Retry this deployment" }).click();
await page.getByRole("group", { name: /^Verified: Deploy/ }).waitFor();
await shot("11-receipt-recovered");

// A second conversation asks again: the reply refers to the existing work.
await nav
  .getByRole("button", { name: "New conversation", exact: true })
  .click();
await page
  .getByRole("button", { name: "Conversation 2", exact: true })
  .waitFor();
await composer.fill("Can you deploy this application?");
await page.getByRole("button", { name: "Send", exact: true }).click();
await page
  .getByText("[QA fixture reply] Can you deploy")
  .waitFor({ timeout: 30000 });
// The real backend records the reply that refers to the existing deployment
// (see deployment-state.test.ts); the fixture's synthetic reply stands in for
// it here so the reference chip can be captured under it.
const reply = await page.evaluate(async () => {
  const url = new URL(window.location.href);
  const view = await (await fetch(`/api${url.pathname}${url.search}`)).json();
  return view.messages.filter((m) => m.role === "assistant").at(-1);
});
record.mentions = [
  { chatId: reply.chatId, messageId: reply.id, at: reply.createdAt },
];
await page.waitForTimeout(2800);
await shot("12-second-conversation");

await page.setViewportSize({ width: 390, height: 844 });
await nav
  .getByRole("button", { name: "Deploy application", exact: true })
  .click();
await page.getByRole("group", { name: /^Verified: Deploy/ }).waitFor();
await shot("13-mobile-receipt");
await nav.getByRole("button", { name: "Overview", exact: true }).click();
await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
await shot("14-mobile-overview");

await browser.close();
if (errors.length) {
  console.error("page errors", errors);
  process.exit(1);
}
console.log("done");
