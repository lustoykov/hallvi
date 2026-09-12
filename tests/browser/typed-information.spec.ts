import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect } from "./fixtures";

test("typed results render in chat and views and update by record ID @journey-shared-information @smoke", async ({
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
    access = randomUUID();
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
  const rows = [
    [
      deployment,
      "Application deployed",
      "Source and runtime are recorded.",
      {
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
      },
    ],
    [
      access,
      "Private access ready",
      "Open the application on this PC.",
      accessPresentation,
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
        ]),
        now,
        now,
      );
    await page.goto(`/applications/${appId}`);
    const chat = page.locator(".sg-chat-pane");
    await expect(chat.locator(".sg-record")).toHaveCount(2);
    await expect(
      chat.getByRole("link", { name: "Open application" }),
    ).toHaveAttribute("href", "http://127.0.0.1:8080");
    await chat.getByText("Deployment details", { exact: true }).click();
    await expect(
      chat.getByText("app:candidate", { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: "tests/results/typed-information-chat.png" });
    await page
      .getByRole("button", { name: "Overview", exact: true })
      .first()
      .click();
    const overview = page.locator(".sg-section-overview");
    await expect(
      overview.getByRole("heading", {
        name: "Application deployed",
        exact: true,
      }),
    ).toBeVisible();
    await expect(overview.locator(".axt-lane")).toHaveCount(4);
    await expect(
      overview.locator(".axt-lane").filter({ hasText: "Backups" }),
    ).toContainText("Not established");
    await expect(
      overview.getByRole("link", { name: "Open application" }),
    ).toHaveAttribute("href", "http://127.0.0.1:8080");
    await expect(
      overview.getByRole("button", { name: "Open Architecture", exact: true }),
    ).toBeVisible();
    await overview
      .getByRole("button", { name: /Checks: Application deployed/ })
      .click();
    await expect(overview.locator(".sg-overview-detail")).toContainText(
      "app:candidate",
    );
    await overview.getByRole("button", { name: "Close details" }).click();
    await expect(overview.locator(".sg-overview-detail")).toHaveCount(0);
    await page.screenshot({
      path: "tests/results/typed-information-overview.png",
    });
    await page
      .getByRole("button", { name: "Deployment", exact: true })
      .first()
      .click();
    const view = page.locator(".sg-section-deployment");
    await expect(
      view.getByText("app:candidate", { exact: true }),
    ).toBeVisible();
    await expect(
      view.getByText("Added container packaging", { exact: true }),
    ).toBeVisible();
    database
      .prepare(
        "UPDATE saved_information SET presentation=?,updated_at=? WHERE id=?",
      )
      .run(
        JSON.stringify({
          ...accessPresentation,
          url: "http://127.0.0.1:8081",
          content: { ...accessPresentation.content, localPort: 8081 },
        }),
        new Date().toISOString(),
        access,
      );
    await expect(
      view.getByRole("link", { name: "Open application" }),
    ).toHaveAttribute("href", "http://127.0.0.1:8081");
    await expect(view.locator(`[data-information-id="${access}"]`)).toHaveCount(
      1,
    );
    await page.reload();
    await expect(
      view.getByRole("link", { name: "Open application" }),
    ).toHaveAttribute("href", "http://127.0.0.1:8081");
    await page
      .getByRole("button", { name: "Overview", exact: true })
      .first()
      .click();
    await expect(
      overview.getByRole("link", { name: "Open application" }),
    ).toHaveAttribute("href", "http://127.0.0.1:8081");
    await page.setViewportSize({ width: 390, height: 844 });
    await overview
      .getByRole("heading", { name: "Overview", exact: true })
      .scrollIntoViewIfNeeded();
    const heroBounds = await overview.locator(".axt").boundingBox();
    expect(heroBounds!.x + heroBounds!.width).toBeLessThanOrEqual(390);
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
