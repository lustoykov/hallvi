import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import Home from "../../../src/app/page";
import { ApplicationsScreen } from "../../../src/components/server-guy/applications-screen";
import { NewApplicationScreen } from "../../../src/components/server-guy/new-application-screen";
import { listItem } from "../../../src/server/application-list";
import type { ApplicationRecord } from "../../../src/server/types";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../../src/server/deployment-store", () => ({
  applicationDeployment: () => null,
}));
vi.mock("../../../src/server/db", () => ({ listApplications: () => [] }));

const application: ApplicationRecord = {
  id: "app-one",
  name: "todo",
  repositoryUrl: "https://github.com/one/todo",
  repositoryOwner: "one",
  repositoryName: "todo",
  createdAt: "2026-09-04T00:00:00Z",
  updatedAt: "2026-09-04T00:00:00Z",
};

describe("application navigation", () => {
  it("opens the overview from home", () => {
    Home();
    expect(mocks.redirect).toHaveBeenCalledWith("/applications");
  });

  it("shows a first-application action without a fixture repository", () => {
    const html = renderToStaticMarkup(
      <ApplicationsScreen applications={[]} piReady={false} />,
    );
    expect(html).toContain("Add your first application");
    expect(html).toContain('href="/applications/new"');
    expect(html).toContain("Settings · Connect ChatGPT");
    expect(html).not.toContain("todo-fastapi");
    expect(html).not.toContain("upstream image");
  });

  it("keeps reference application navigation inside the prototype", () => {
    const html = renderToStaticMarkup(
      <ApplicationsScreen applications={[]} piReady preview />,
    );
    expect(html).toContain('href="/prototype/new"');
    expect(html).toContain('href="/prototype/applications"');
    expect(html).not.toContain('href="/applications/new"');
  });

  it("lists the condition and stack of each application from its records", () => {
    const html = renderToStaticMarkup(
      <ApplicationsScreen
        piReady
        applications={[
          listItem(application, null),
          {
            ...listItem(
              { ...application, id: "app-two", repositoryOwner: "two" },
              null,
            ),
            condition: { tone: "warn", text: "Recommendation waiting for you" },
            attention: 1,
          },
        ]}
      />,
    );
    expect(html).toContain('href="/applications/app-one"');
    expect(html).toContain('href="/applications/app-two"');
    expect(html).toContain("one/todo");
    expect(html).toContain("two/todo");
    expect(html).toContain("Not deployed");
    expect(html).toContain("Recommendation waiting for you");
    expect(html).toContain("1 needs you");
    expect(html).toContain("Nothing needs you");
    expect(html).not.toContain("Launch Brief");
  });

  it("does not accept form edits before hydration can retain them", () => {
    const html = renderToStaticMarkup(
      <NewApplicationScreen githubLogin="qa-user" />,
    );
    expect(html.match(/<input[^>]*id="repository-url"[^>]*>/)?.[0]).toContain(
      "disabled",
    );
    expect(html.match(/<input[^>]*id="application-name"[^>]*>/)?.[0]).toContain(
      "disabled",
    );
  });

  it("starts creation with an empty URL and no retired permission choice", () => {
    const html = renderToStaticMarkup(<NewApplicationScreen />);
    expect(html).toContain('name="repositoryUrl"');
    expect(html).toContain('value=""');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add application/);
    expect(html).not.toContain("todo-fastapi");
    for (const retired of [
      "Always ask",
      "Let Server Guy decide",
      "Full autonomy",
    ])
      expect(html).not.toContain(retired);
    expect(html).toContain('href="/applications"');
  });
});
