import { test, expect } from "./fixtures";
import { journey } from "./journeys";

test(
  "caretakers open the selected real application and search preserves navigation",
  journey("application-shell"),
  async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/applications");
    await expect(
      page.getByRole("heading", { name: "Add your first application" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add application", exact: true }),
    ).toHaveAttribute("href", "/applications/new");
    const ids: string[] = [];
    for (const name of ["Home alpha", "Home beta"]) {
      const response = await page.request.post("/api/applications", {
        data: {
          repositoryUrl: `https://github.com/qa/${name.toLowerCase().replaceAll(" ", "-")}`,
          name,
          requestKey: crypto.randomUUID(),
          approvalMode: "pi-decides",
        },
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      ids.push(body.application.id);
    }
    await page.reload();
    await expect(
      page.getByRole("button", { name: /^Select .* caretaker$/ }),
    ).toHaveCount(2);
    const alpha = page.getByRole("button", {
      name: "Select Home alpha caretaker",
    });
    await alpha.focus();
    await expect(alpha).toHaveAttribute("aria-pressed", "true");
    const chat = page.getByRole("link", {
      name: "Talk to Server Guy about Home alpha",
    });
    await expect(chat).toHaveAttribute("href", `/applications/${ids[0]}`);
    await page
      .getByRole("textbox", { name: "Find an application" })
      .fill("home beta");
    await expect(
      page.getByRole("button", { name: /^Select .* caretaker$/ }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Talk to Server Guy about Home beta" }),
    ).toHaveAttribute("href", `/applications/${ids[1]}`);
    await page
      .getByRole("textbox", { name: "Find an application" })
      .fill("no-such-app");
    await expect(page.getByText(/No applications match/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Show me a dance" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.getByRole("button", { name: "Pause animations" }).click();
    await expect(
      page.getByRole("button", { name: "Resume animations" }),
    ).toBeVisible();
    await page.getByLabel("Dance or trick").selectOption("cartwheel");
    await page.getByRole("button", { name: "Show me a trick" }).click();
    await expect(
      page.getByRole("button", { name: "Pause animations" }),
    ).toBeVisible();
    await alpha.focus();
    await chat.click();
    await expect(page).toHaveURL(new RegExp(`/applications/${ids[0]}$`));
    await expect(
      page.getByRole("textbox", { name: "Message Server Guy" }),
    ).toBeVisible();
  },
);
