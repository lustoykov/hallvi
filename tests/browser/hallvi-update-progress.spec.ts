import { expect, test } from "./fixtures";

test("Hallvi update stays visible and reload preserves drafts and uncertain message keys", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  let phase: "available" | "downloading" | "installing" | "completed" =
    "available";
  let disconnectOnce = false;
  await page.route("**/api/hallvi/update", async (route) => {
    if (route.request().method() === "POST") {
      const { action } = route.request().postDataJSON();
      if (action === "install") phase = "downloading";
      if (action === "dismiss") phase = "available";
    } else if (disconnectOnce) {
      disconnectOnce = false;
      await route.abort("failed");
      return;
    }

    const updated = phase === "completed";
    const attempt =
      phase === "available"
        ? null
        : {
            id: "visible-update",
            phase,
            message: updated
              ? "Hallvi 0.1.1-alpha.2 is running on this address."
              : "Installing Hallvi 0.1.1-alpha.2. Hallvi stops for a moment and comes back on the same address.",
            progress: null,
            from: { version: "0.1.1-alpha.1" },
            to: { version: "0.1.1-alpha.2" },
          };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        installed: {
          kind: "installed",
          version: updated ? "0.1.1-alpha.2" : "0.1.1-alpha.1",
          revision: "83e6f64b551c3162ace1eafcd3422f9fab954aa7",
          platform: "darwin-arm64",
        },
        machine: "mac-mini",
        channel: "alpha",
        ownKey: true,
        available:
          phase === "available"
            ? {
                version: "0.1.1-alpha.2",
                revision: "83e6f64b551c3162ace1eafcd3422f9fab954aa7",
                notes:
                  "https://github.com/lustoykov/hallvi/releases/tag/v0.1.1-alpha.2",
                releasedAt: "2026-09-21T13:05:19Z",
                size: 1000,
                blocked: null,
              }
            : null,
        checkedAt: "2026-09-21T13:05:19Z",
        checkError: null,
        attempt,
      }),
    });
  });

  const created = await page.request.post("/api/applications", {
    data: {
      repositoryUrl: "https://github.com/qa/update-progress",
      name: "Update progress",
      requestKey: crypto.randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const { application, selectedChatId } = await created.json();
  const attempts: { message: string; requestKey: string }[] = [];
  await page.route(
    `**/api/applications/${application.id}/chats/${selectedChatId}/messages`,
    (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempts.push(route.request().postDataJSON());
      return route.abort("failed");
    },
  );
  await page.goto(`/applications/${application.id}`);
  // This version comes from a client effect, so the composer is hydrated too.
  await expect(
    page.getByRole("button", { name: /Hallvi 0\.1\.1-alpha\.1/ }),
  ).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message Hallvi" });
  const message = "An uncertain message must keep its request key.";
  await composer.fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => attempts.length).toBe(1);
  await expect(
    page.getByRole("alert").filter({ hasText: "Failed to fetch" }),
  ).toBeVisible();
  await expect(composer).toHaveValue(message);
  expect(attempts).toHaveLength(1);
  const draft = "Keep my newer draft through the interface reload.";
  await composer.fill(draft);
  // A waiting release is news on Hallvi's own row; the menu leads with it.
  await page
    .getByRole("button", { name: "Hallvi 0.1.1-alpha.1, update ready" })
    .click();
  await page.getByRole("button", { name: "Update and restart" }).click();

  const notice = page.getByRole("status").filter({
    has: page.getByRole("list", { name: "Update steps" }),
  });
  await expect(notice).toBeVisible();
  await expect(
    notice.getByText("0.1.1-alpha.2", { exact: true }),
  ).toBeVisible();
  await expect(
    notice.getByRole("list", { name: "Update steps" }),
  ).toBeVisible();
  await expect(notice.getByText("Download", { exact: true })).toHaveAttribute(
    "aria-current",
    "step",
  );

  // The sidebar footer is hidden on small screens; the update is not.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(notice).toBeVisible();

  disconnectOnce = true;
  await expect(
    page.getByRole("status").filter({
      has: page.getByText("Reconnecting to Hallvi", { exact: true }),
    }),
  ).toBeVisible({ timeout: 10_000 });

  await expect(notice.getByText("Download", { exact: true })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(notice.getByText("Install", { exact: true })).not.toHaveClass(
    /complete/,
  );
  await expect(notice).not.toContainText("Hallvi is restarting");

  phase = "installing";
  await expect(notice.getByText("Install", { exact: true })).toHaveAttribute(
    "aria-current",
    "step",
    { timeout: 10_000 },
  );
  phase = "completed";
  await expect(
    page.getByRole("status").getByText("Hallvi updated"),
  ).toBeVisible({
    timeout: 10_000,
  });
  const completedNotice = page.getByRole("status").filter({
    hasText: "Hallvi updated",
  });
  await expect(completedNotice).toContainText("Reload this page");
  await expect(composer).toHaveValue(draft);
  await page.locator('input[type="file"]').setInputFiles({
    name: "unsent-image.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("Attached image 1")).toBeVisible();
  const reload = completedNotice.getByRole("button", { name: "Reload page" });
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documents += 1;
  });
  await page.screenshot({
    path: testInfo.outputPath("update-complete-reload-offered.png"),
    fullPage: true,
  });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("attached images");
    await dialog.dismiss();
  });
  await reload.click();
  expect(documents).toBe(0);
  await expect(composer).toHaveValue(draft);
  await expect(page.getByAltText("Attached image 1")).toBeVisible();
  // The owner removes the unsent image before choosing the warned-about reload.
  await page.getByRole("button", { name: "Remove image 1" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([page.waitForNavigation(), reload.click()]);
  expect(documents).toBe(1);
  await expect(composer).toHaveValue(draft);
  expect(attempts).toHaveLength(1); // Reload must never resend uncertain work.
  const submissionKey = `hv:submission:${application.id}:${selectedChatId}`;
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      submissionKey,
    ),
  ).toMatchObject({
    message: attempts[0].message,
    key: attempts[0].requestKey,
  });
  await expect(page.getByRole("button", { name: "Reload page" })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("button", { name: /Hallvi 0\.1\.1-alpha\.2/ }),
  ).toBeAttached();
  await page.screenshot({
    path: testInfo.outputPath("updated-page-draft-restored.png"),
    fullPage: true,
  });
  await composer.fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[1]).toMatchObject(attempts[0]);
  await page
    .getByRole("status")
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(page.getByRole("status")).toHaveCount(0);
});
