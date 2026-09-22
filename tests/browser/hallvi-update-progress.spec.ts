import { expect, test } from "./fixtures";

test("Hallvi update stays visible through installation, reconnect, and completion", async ({
  page,
}) => {
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
  const { application } = await created.json();
  await page.goto(`/applications/${application.id}`);
  await page.getByRole("button", { name: /Hallvi 0\.1\.1-alpha\.1/ }).click();
  await page.getByRole("button", { name: "Update", exact: true }).click();

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
  await page
    .getByRole("status")
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(page.getByRole("status")).toHaveCount(0);
});
