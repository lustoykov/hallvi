import { test, expect } from "./fixtures";
import { journey } from "./journeys";

// The journey starts from an empty application list, so it runs in its own
// disposable app rather than one that earlier journeys have populated.
test.use({ isolatedApp: true });

// The page is the caretakers over their applications: one card each, with
// the drawn screen, one word of state and what runs. What has to keep
// working: the reader recognises an application and opens it from its name,
// its screen or Open app; search, once there is enough to search, never leaves
// them on a card that opens something else; and the empty page offers the
// one thing to do. The welcome offers another application; continuing work
// starts inside an existing application.
test(
  "home lists applications, follows the selected one, and search preserves navigation",
  journey("application-shell"),
  async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/applications");
    await expect(page).toHaveURL(/\/applications\/new$/);
    await expect(
      page.getByRole("heading", { name: "Hi, I’m Hallvi." }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "How Hallvi works" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What do you want to run?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add application", exact: true }),
    ).toBeDisabled();

    const ids: string[] = [];
    const names = [
      "Home alpha",
      "Home beta",
      "Home gamma",
      "Home delta",
      "Home epsilon",
    ];
    for (const name of names) {
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
    await page.goto("/applications");

    const list = page.getByRole("list", { name: "Applications" });
    await expect(list.getByRole("listitem")).toHaveCount(names.length);
    const alpha = list.getByRole("listitem").filter({ hasText: "Home alpha" });
    await expect(
      alpha.getByRole("link", { name: "Home alpha", exact: true }),
    ).toHaveAttribute("href", `/applications/${ids[0]}`);
    await expect(
      alpha.getByRole("link", { name: "Open Home alpha" }),
    ).toHaveAttribute("href", `/applications/${ids[0]}`);
    await expect(alpha.getByRole("link", { name: "Open app" })).toHaveAttribute(
      "href",
      `/applications/${ids[0]}`,
    );
    // A freshly added application says so in one word, and its caretaker
    // carries the box; nothing on the card warns about protection.
    await expect(alpha.getByText("New", { exact: true })).toBeVisible();
    await expect(alpha.getByText(/backed up|backup/i)).toHaveCount(0);

    // The collection and search remain usable on a narrow screen.
    await page.setViewportSize({ width: 390, height: 844 });
    const search = page.getByRole("textbox", { name: "Find an application" });
    await search.fill("home beta");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("link", { name: "Home beta", exact: true }),
    ).toHaveAttribute("href", `/applications/${ids[1]}`);
    await search.fill("no-such-app");
    await expect(page.getByText(/No applications match/)).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(names.length);

    await alpha.getByRole("link", { name: "Open app" }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${ids[0]}$`));
    await expect(
      page.getByRole("textbox", { name: "Message Hallvi" }),
    ).toBeVisible();
    await page.goto("/applications/new");
    await expect(
      page.getByLabel("GitHub repository", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "How Hallvi works" }),
    ).toHaveCount(0);
  },
);
