// Checks shared History/receipt behavior against invented reference data.
// Never calls a provider or the operation API.
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:3270";
const output = "tests/results/operation-history";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "UTC",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    errors.push(`Unexpected API: ${route.request().url()}`);
    return route.abort();
  });
  await page.goto(
    `${base}/prototype/app?scenario=rich&step=27&section=history`,
  );
  const history = page.locator(".hv-operation-history");
  await expect(history).toBeVisible();
  await expect(history.locator("li").first()).toContainText(
    "Restart the worker",
  );
  const queued = history.locator("#operation-coord-concurrency");
  await expect(queued).toContainText("Queued");
  await page.screenshot({ path: `${output}/01-history-queued.png` });
  await page.getByRole("button", { name: "Inspections", exact: true }).click();
  await expect(history).toContainText("Inspect worker logs");
  await expect(queued).toHaveCount(0);
  await page.getByRole("button", { name: "Outside chat", exact: true }).click();
  await expect(history).toContainText("Inspect worker logs");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await queued
    .getByRole("button", { name: "Cancel queued change", exact: true })
    .click();
  await expect(queued).toContainText("Cancelled");
  await expect(history).toContainText("Restart the worker");
  await page.screenshot({ path: `${output}/02-cancelled-retained.png` });
  await page.goto(
    `${base}/prototype/app?scenario=rich&step=27&chat=chat-coordinate-two`,
  );
  await expect(
    page.getByRole("group", {
      name: "Queued: Increase worker concurrency",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: `${output}/03-queued-conversation.png` });
  await page
    .getByRole("button", { name: /Waiting for Restart the worker/ })
    .click();
  await expect(
    page.getByRole("group", {
      name: "Working: Restart the worker",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(
    `${base}/prototype/app?scenario=rich&step=28&section=history`,
  );
  await page.getByRole("button", { name: "Needs you", exact: true }).click();
  await expect(history).toContainText("The worker definition changed");
  await expect(
    page.getByRole("button", { name: "Approve updated change", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${output}/04-recheck-approval.png` });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(history.locator("#operation-coord-concurrency")).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(history.locator("#operation-coord-concurrency")).toContainText(
    "Cancelled",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/05-mobile-history.png` });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    `Passed History filters, shared receipts, cancellation, changed assumptions and mobile layout; screenshots in ${output}`,
  );
} finally {
  await browser.close();
}
