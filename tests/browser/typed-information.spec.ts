import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect } from "./fixtures";

test("records render in chat and their views, survive refresh, and update by record ID @journey-shared-information @smoke", async ({
  page,
  fixture,
}) => {
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/typed-information",
    },
  });
  expect(response.ok()).toBe(true);
  const created = await response.json();
  const appId = created.application?.id ?? created.id;
  const database = new Database(join(fixture.state, "qa.db"));
  const { id: chatId } = database
    .prepare(
      "SELECT id FROM conversations WHERE application_id=? AND kind='main'",
    )
    .get(appId) as { id: string };
  const now = new Date().toISOString();
  const deployment = randomUUID(),
    access = randomUUID(),
    failed = randomUUID();
  const accessPresentation = {
    views: ["overview", "deployment"],
    role: "status",
    status: "verified",
    url: "http://127.0.0.1:8080",
    checks: [
      {
        label: "Private endpoint responded",
        status: "passed",
        subject: "access",
      },
    ],
    content: {
      kind: "application-access",
      mode: "private",
      server: "fixture-server",
      localPort: 8080,
      remotePort: 80,
    },
  };
  const deploymentPresentation = {
    views: ["overview", "deployment"],
    role: "outcome",
    status: "verified",
    checks: [
      {
        label: "Data survived restart",
        status: "passed",
        subject: "application",
      },
    ],
    content: {
      kind: "deployment",
      repositoryUrl: "https://github.com/qa/app",
      revision: "abcdef0123456789",
      image: "app:candidate",
      server: "fixture-server",
      changes: ["Added container packaging"],
    },
  };
  const rows = [
    [
      deployment,
      "Application deployed",
      "Source and runtime are recorded.",
      deploymentPresentation,
    ],
    [
      access,
      "Private access ready",
      "Open the application on this PC.",
      accessPresentation,
    ],
    // An outcome with no typed content, so the plain card is in the run too.
    [
      failed,
      "Earlier check failed",
      "The application did not respond during this check.",
      {
        views: ["overview", "deployment"],
        role: "outcome",
        status: "failed",
        checks: [{ label: "Public HTTP check", status: "failed" }],
        nextStep: "Inspect application logs.",
      },
    ],
  ];
  try {
    for (const [id, title, body, presentation] of rows)
      database
        .prepare(
          "INSERT INTO saved_information (id,application_id,title,body,evidence,established_at,presentation,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          appId,
          title,
          body,
          "[]",
          now,
          JSON.stringify(presentation),
          now,
          now,
        );
    database
      .prepare(
        "INSERT INTO messages (id,conversation_id,role,body,source,blocks,created_at,updated_at) VALUES (?,?,'assistant','Your application is ready.','pi',?,?,?)",
      )
      .run(
        randomUUID(),
        chatId,
        JSON.stringify([
          { type: "saved-information", id: deployment },
          { type: "saved-information", id: access },
          { type: "saved-information", id: failed },
        ]),
        now,
        now,
      );
    await page.goto(`/applications/${appId}`);
    const chat = page.locator(".hv-chat-pane");
    const cards = (scope: typeof chat) =>
      scope.locator("[data-information-id]");
    await expect(cards(chat)).toHaveCount(3);
    // Nothing is listening behind the record, and the page says so rather
    // than offering an address that would fail in the reader's browser.
    await expect(chat.getByText("Tunnel closed")).toBeVisible();
    await expect(
      chat.getByRole("link", { name: "Open application" }),
    ).toHaveCount(0);
    await expect(chat.getByText("Inspect application logs.")).toBeVisible();
    // Reload: the cards are read back from the records, not from the turn.
    await page.reload();
    await expect(cards(chat)).toHaveCount(3);
    // In a transcript a routine record is one line with its content behind a
    // disclosure; the typed content is what opening it shows.
    await chat
      .locator(`[data-information-id="${deployment}"] summary`)
      .first()
      .click();
    await expect(
      chat.getByText("app:candidate", { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "tests/results/typed-information-chat.png" });
    await page
      .getByRole("button", { name: "Overview", exact: true })
      .first()
      .click();
    const overview = page.locator(".hv-section-overview");
    // Overview reads the same records. With nothing establishing that the
    // application works, every lane has to say which kind of silence it is:
    // nobody looked, or somebody looked and it is not working.
    await expect(
      overview.getByRole("button", { name: /Backups Not checked yet/ }),
    ).toBeVisible();
    await expect(
      overview.getByRole("button", { name: /Access Tunnel is closed/ }),
    ).toBeVisible();
    await expect(
      overview.getByRole("link", { name: "Open application" }),
    ).toHaveCount(0);
    // And a map nothing describes is missing, which is not the same as an
    // application with no parts.
    await expect(
      overview.getByText(
        "The deployment is recorded, but its architecture has not been mapped yet.",
        { exact: true },
      ),
    ).toBeVisible();
    for (const title of [
      "Application deployed",
      "Private access ready",
      "Earlier check failed",
    ])
      await expect(overview.getByText(title, { exact: false })).toBeVisible();
    await page.screenshot({
      path: "tests/results/typed-information-overview.png",
    });
    await page
      .getByRole("button", { name: "Deployment", exact: true })
      .first()
      .click();
    // The destination's own landmark: the designed pages do not carry the
    // card-list wrapper the older layouts had.
    const view = page.getByRole("region", { name: "Deployment" });
    // The destination is not a list of the cards from the conversation: it is
    // a page composed from the same records. What it owes the reader is the
    // release that is running and an honest account of the way in.
    //
    // It says so in its own words rather than by reprinting the record's
    // title: the lead names the revision that is serving, and the line under
    // it names the source and the machine.
    await expect(view.getByText("Running abcdef0.")).toBeVisible();
    await expect(
      view.getByText(/abcdef012345 on fixture-server/),
    ).toBeVisible();
    await expect(
      view.getByRole("button", { name: /Added container packaging/ }),
    ).toBeVisible();
    // The address is named, and named as not answering, rather than offered.
    await expect(view.getByText(/The tunnel is closed, so/)).toBeVisible();
    await expect(
      view.getByRole("button", { name: "Open the connection again" }),
    ).toBeVisible();
    await expect(
      view.getByRole("link", { name: "Open application" }),
    ).toHaveCount(0);
    // What was checked belongs to the release that was checked, so it is
    // inside that release rather than loose on the page. It still has to be
    // reachable, and it still has to be the record's own words.
    await view
      .getByRole("button", { name: /Added container packaging/ })
      .click();
    await expect(view.getByText("Data survived restart")).toBeVisible();
    await expect(view.getByText("app:candidate")).toBeVisible();

    // A record changes by its own id, and the page it feeds changes with it.
    database
      .prepare(
        "UPDATE saved_information SET presentation=?,updated_at=? WHERE id=?",
      )
      .run(
        JSON.stringify({
          ...deploymentPresentation,
          content: {
            ...deploymentPresentation.content,
            image: "app:rebuilt",
            changes: ["Rebuilt from the same source"],
          },
        }),
        new Date().toISOString(),
        deployment,
      );
    // The idle page polls every 15 seconds. Observe the update without
    // a reload.
    await expect(
      view.getByRole("button", { name: /Rebuilt from the same source/ }),
    ).toBeVisible({ timeout: 20_000 });
    await page.reload();
    const rebuilt = view.getByRole("button", {
      name: /Rebuilt from the same source/,
    });
    await expect(rebuilt).toBeVisible();
    await expect(
      view.getByRole("button", { name: /Added container packaging/ }),
    ).toHaveCount(0);
    // The record changed by its id, so the release opens on the new image
    // rather than on the one it replaced.
    await rebuilt.click();
    await expect(view.getByText("app:rebuilt")).toBeVisible();
    await expect(view.getByText("app:candidate")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "tests/results/typed-information-mobile.png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  } finally {
    database.close();
  }
});
