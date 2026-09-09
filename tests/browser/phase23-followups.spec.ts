import {
  openPreparation,
  openConversation,
  openDashboard,
} from "./workspace-helpers";
import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test(
  "setup correction previews impact, preserves history and resumes the existing phases",
  journey("phase-three-conformance"),
  async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto("/applications/new");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/followup-nohealth");
    await page
      .getByRole("button", { name: "Add application", exact: true })
      .click();
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Inspect application", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.getByText(/\[QA contract\] Proposed Application Contract v1/),
    ).toBeVisible({ timeout: 60_000 });
    await openPreparation(page);
    await page
      .getByRole("button", {
        name: "Continue to Make launch-ready",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Edit application setup", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Review impact", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "No setup changes to review",
    );
    await page
      .getByLabel("Application name", { exact: true })
      .fill("Corrected application");
    await page
      .getByLabel("GitHub repository", { exact: true })
      .fill("https://github.com/qa/followup-fastapi-corrected");
    await page
      .getByRole("button", { name: "Review impact", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review setup change", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      "rebuild, verify and test a new preview",
    );
    await page.screenshot({
      path: testInfo.outputPath("setup-impact.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Apply setup change", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: /Switch application: Corrected application/,
      }),
    ).toBeVisible();
    await openPreparation(page);
    await expect(
      page.getByRole("button", {
        name: "Inspect application",
        exact: true,
      }),
    ).toBeVisible();
    await openPreparation(page);
    await page
      .getByRole("button", { name: "Inspect application", exact: true })
      .click();
    await openConversation(page);
    await expect(
      page.getByText(/\[QA contract\] Proposed Application Contract v2/),
    ).toBeVisible({ timeout: 60_000 });
    await openDashboard(page);
    await page
      .getByRole("combobox", { name: "Find in Record" })
      .selectOption("contract");
    await page.getByRole("button", { name: /^Saved versions/ }).click();
    await expect(
      page
        .getByRole("list", { name: "Saved contract versions" })
        .getByText(/^v1/),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("corrected-contract-history.png"),
      fullPage: true,
    });
    await openPreparation(page);
    await page
      .getByRole("button", {
        name: "Continue to Make launch-ready",
        exact: true,
      })
      .click();
    await openConversation(page);
    await expect(
      page.getByRole("textbox", { name: "Message Server Guy" }),
    ).toBeEnabled();
  },
);
