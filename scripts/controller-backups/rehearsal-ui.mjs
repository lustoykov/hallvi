/** Run only inside the network-isolated Linux rehearsal container. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

process.umask(0o077);
const require = createRequire(join(process.cwd(), "package.json"));
const { chromium, expect } = require("@playwright/test");
const Database = require("better-sqlite3");
const { openNativeChatSession } = await import(
  pathToFileURL(join(process.cwd(), "src/server/pi-sessions.ts")).href
);
assert(
  Object.values(networkInterfaces())
    .flat()
    .every((entry) => entry.internal),
  "Rehearsal must have only loopback networking",
);
const output = process.env.REHEARSAL_OUTPUT ?? "/evidence";
mkdirSync(output, { recursive: true, mode: 0o700 });
const db = new Database(process.env.SERVER_GUY_DB_PATH, { readonly: true });
function recordsDigest(client = db) {
  const tables = client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return createHash("sha256")
    .update(
      JSON.stringify(
        tables.map(({ name }) => [
          name,
          client
            .prepare(
              `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
            )
            .all(),
        ]),
      ),
    )
    .digest("hex");
}
const sourceManifest = JSON.parse(
  readFileSync("/recovery/active/source-manifest.json", "utf8"),
);
assert.equal(
  readFileSync("RECOVERY_SOURCE_REVISION", "utf8").trim(),
  sourceManifest.sourceRevision,
);
assert.equal(sourceManifest.sourceDirty, false);
assert.equal(process.env.DOCKER_HOST, undefined);
assert.equal(existsSync("/var/run/docker.sock"), false);
const before = recordsDigest();
const preserved = new Database(
  "/recovery/quarantine/payload/database/server-guy.db",
  { readonly: true },
);
try {
  assert.equal(
    before,
    recordsDigest(preserved),
    "Server boot changed restored records",
  );
} finally {
  preserved.close();
}
const apps = db.prepare("SELECT id,name FROM applications ORDER BY id").all();
const base = "http://127.0.0.1:3270";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const mutationRequests = [];
const externalRequests = [];
const errors = [];
const failures = [];
await context.route("**/*", (route) => {
  const request = route.request();
  if (!["GET", "HEAD"].includes(request.method())) {
    mutationRequests.push(
      request.method() + " " + new URL(request.url()).pathname,
    );
    return route.abort();
  }
  if (!request.url().startsWith(base) && /^https?:/.test(request.url())) {
    externalRequests.push(new URL(request.url()).hostname);
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400 && !response.url().endsWith("/firewall")) {
    failures.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
  }
});
const report = {
  applications: [],
  network: "loopback only",
  workersStarted: false,
};
try {
  assert.equal((await page.goto(base + "/applications")).status(), 200);
  for (const app of apps)
    await expect(page.getByText(app.name, { exact: true })).toBeVisible();
  await page.screenshot({ path: join(output, "homepage.png"), fullPage: true });
  for (const app of apps) {
    const chats = db
      .prepare("SELECT * FROM chats WHERE application_id=? ORDER BY id")
      .all(app.id);
    const appResult = { id: app.id, chats: [], sections: [] };
    for (const chat of chats) {
      const messages = db
        .prepare(
          "SELECT id,role,body FROM messages WHERE chat_id=? ORDER BY created_at,rowid",
        )
        .all(chat.id);
      const response = await context.request.get(
        `${base}/api/applications/${app.id}?chat=${chat.id}`,
      );
      assert.equal(response.status(), 200);
      const view = await response.json();
      assert.equal(view.application.id, app.id);
      assert.equal(view.selectedChatId, chat.id);
      assert.equal(view.facts.backupSetup.connected, true);
      assert(view.facts.protection);
      assert.equal(view.facts.protection.observation.reachable, false);
      assert.equal(view.facts.backupEvidence, undefined);
      assert.deepEqual(
        view.messages.map(({ id, role, body }) => ({ id, role, body })),
        messages,
      );
      const sourceSession = join(
        dirname(process.env.SERVER_GUY_DB_PATH),
        "pi-sessions",
        app.id,
        chat.id + ".jsonl",
      );
      const sessionBefore = readFileSync(sourceSession);
      const opened = await openNativeChatSession(app.id, chat.id);
      let nativeMessages;
      try {
        assert.equal(
          opened.sessionManager.getSessionId(),
          chat.native_session_id,
        );
        assert.equal(opened.sessionManager.getCwd(), process.cwd());
        nativeMessages =
          opened.sessionManager.buildSessionContext().messages.length;
      } finally {
        opened.release();
      }
      assert.deepEqual(readFileSync(sourceSession), sessionBefore);
      await page.goto(`${base}/applications/${app.id}?chat=${chat.id}`);
      for (const message of messages)
        await expect(
          page.locator(`[id="sg-message-${message.id}"]`),
        ).toBeAttached();
      appResult.chats.push({
        id: chat.id,
        messages: messages.length,
        nativeMessages,
        nativeFileUnchanged: true,
      });
    }
    for (const section of [
      "overview",
      "architecture",
      "history",
      "database",
      "backups",
      "security",
    ]) {
      await page.goto(`${base}/applications/${app.id}#${section}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (section === "security") {
        await expect(
          page.getByText(
            "Could not read the firewall from Hetzner. Check the connection and try again.",
          ),
        ).toBeVisible({ timeout: 40000 });
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert.equal(overflow, false, "Desktop overflow in " + section);
      appResult.sections.push(section);
      if (["backups", "history"].includes(section)) {
        await page.screenshot({
          path: join(output, app.id + "-" + section + ".png"),
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/applications/${app.id}#backups`);
    await expect(page.locator("main")).toBeVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: join(output, app.id + "-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    report.applications.push(appResult);
  }
  const execution = await context.request.get(base + "/api/execution/setup");
  assert.equal(execution.status(), 200);
  const engine = (await execution.json()).environment;
  assert.equal(engine.ready, false);
  assert.equal(engine.engine, null);
  assert.equal(engine.verified, null);
  report.executionEngine = { state: engine.state, ready: false };
  const hostSetup = await context.request.get(base + "/api/setup/hetzner");
  assert.equal(hostSetup.status(), 200);
  assert.equal((await hostSetup.json()).connected, true);
  const pi = await context.request.get(base + "/api/pi/setup");
  assert.equal(pi.status(), 200);
  const piStatus = await pi.json();
  assert.equal(piStatus.ready, false);
  assert.equal(piStatus.state, "needs-auth");
  report.modelSetup = {
    state: piStatus.state,
    ready: false,
    modelCallAttempted: false,
  };
  assert.equal(
    recordsDigest(),
    before,
    "UI or session reopening changed controller records",
  );
  assert.deepEqual(mutationRequests, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  report.recordsUnchanged = true;
  report.recordsMatchPreservedCheckpoint = true;
  report.mutationRequests = mutationRequests;
  report.pageErrors = errors;
  report.httpFailures = failures;
  report.externalRequestsBlocked = [...new Set(externalRequests)];
  writeFileSync(
    join(output, "ui-proof.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  db.close();
}
