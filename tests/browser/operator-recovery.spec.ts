import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("recovered operator reads clear their own error and preserve uncertain or rejected writes", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const response = await page.request.post("/api/applications", {
    data: {
      requestKey: randomUUID(),
      repositoryUrl: "https://github.com/qa/operator-read-recovery",
    },
  });
  expect(response.ok()).toBe(true);
  const view = await response.json();
  const appId = view.application.id;
  const operatorPath = `**/api/applications/${appId}/operator*`;
  let failReads = true;
  let writeFailure: "unknown" | "rejected" | "accepted" = "unknown";
  let healthyReads = 0;
  await page.route(operatorPath, async (route) => {
    if (route.request().method() === "POST") {
      if (writeFailure === "accepted") return route.continue();
      if (writeFailure === "unknown") return route.abort("failed");
      return route.fulfill({
        status: 409,
        json: { error: "Permission change rejected" },
      });
    }
    if (failReads) return route.abort("failed");
    await route.continue();
    healthyReads += 1;
  });
  await page.goto(`/applications/${appId}`);
  const console = page.locator(".hv-operator-console");
  const alert = console.getByRole("alert");
  const composer = page.getByRole("textbox", { name: "Message Hallvi" });
  const draft = "Keep this draft while Hallvi reconnects.";
  await composer.fill(draft);
  await expect(alert).toHaveText("Failed to fetch");
  await page.screenshot({
    path: testInfo.outputPath("read-failed.png"),
    fullPage: true,
  });

  failReads = false;
  await expect(alert).toHaveCount(0, { timeout: 20_000 });
  await expect(composer).toHaveValue(draft);
  await page.screenshot({
    path: testInfo.outputPath("read-recovered.png"),
    fullPage: true,
  });

  for (const failure of ["unknown", "rejected"] as const) {
    writeFailure = failure;
    await page.getByRole("button", { name: /^Permissions:/ }).click();
    await page.getByRole("radio", { name: /Hallvi decides/ }).click();
    const message =
      failure === "unknown" ? "Failed to fetch" : "Permission change rejected";
    await expect(alert).toHaveText(message);
    const before = healthyReads;
    await expect
      .poll(() => healthyReads, { timeout: 20_000 })
      .toBeGreaterThan(before);
    // A good settings read cannot settle whether a lost write was accepted,
    // or make an explicit rejected write look successful.
    await expect(alert).toHaveText(message);
    await expect(composer).toHaveValue(draft);
  }
  await page.screenshot({
    path: testInfo.outputPath("write-error-after-recovered-read.png"),
    fullPage: true,
  });

  // A known successful write followed by a failed GET refresh belongs to
  // the read state too; the later poll both clears it and shows the saved mode.
  writeFailure = "accepted";
  failReads = true;
  await page.getByRole("button", { name: /^Permissions:/ }).click();
  await page.getByRole("radio", { name: /Always ask/ }).click();
  await expect(alert).toHaveText("Failed to fetch");
  failReads = false;
  await expect(alert).toHaveCount(0, { timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: /^Permissions: Always ask/ }),
  ).toBeVisible();
  await expect(composer).toHaveValue(draft);
  const snapshot = await (
    await page.request.get(
      `/api/applications/${appId}/chats/${view.selectedChatId}/messages`,
    )
  ).json();
  expect(snapshot.messages).toEqual(view.messages);
});
