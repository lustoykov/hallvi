import { test, expect } from "./fixtures";
import { journey } from "./journeys";

// The journey starts from an empty application list, so it runs in its own
// disposable app rather than one that earlier journeys have populated.
test.use({ isolatedApp: true });

// Selecting used to mean pressing a caretaker figure above each card. The
// figures are gone — three 250px mascots with the real facts underneath them —
// and an application is now its own card. What has to keep working is the same
// thing: the reader picks one, the page offers that one, and search never
// leaves them on a card that opens something else.
test(
  "home lists applications, follows the selected one, and search preserves navigation",
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
        },
      });
      expect(response.status()).toBe(201);
      ids.push((await response.json()).application.id);
    }
    await page.reload();

    const list = page.getByRole("list", { name: "Applications" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    const alpha = list.getByRole("link", { name: /Home alpha/ });
    await expect(alpha).toHaveAttribute("href", `/applications/${ids[0]}`);

    // The offer at the top of the page follows the selection, so a reader who
    // takes it opens the application they were looking at.
    const offer = page.getByRole("link", { name: /^Talk to Server Guy about/ });
    await alpha.focus();
    await expect(offer).toHaveAccessibleName(
      "Talk to Server Guy about Home alpha",
    );
    await expect(offer).toHaveAttribute("href", `/applications/${ids[0]}`);

    const search = page.getByRole("textbox", { name: "Find an application" });
    await search.fill("home beta");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("link", { name: /Home beta/ })).toHaveAttribute(
      "href",
      `/applications/${ids[1]}`,
    );
    await search.fill("no-such-app");
    await expect(page.getByText(/No applications match/)).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);

    await alpha.focus();
    await offer.click();
    await expect(page).toHaveURL(new RegExp(`/applications/${ids[0]}$`));
    await expect(
      page.getByRole("textbox", { name: "Message Server Guy" }),
    ).toBeVisible();
  },
);
