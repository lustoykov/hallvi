import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import Home from "../../../src/app/page";
import { ApplicationsScreen } from "../../../src/components/hallvi/applications-screen";
import { NewApplicationScreen } from "../../../src/components/hallvi/new-application-screen";
import type { ApplicationListItem } from "../../../src/components/hallvi/applications-screen";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../../src/server/deployment-store", () => ({
  applicationDeployment: () => null,
}));
vi.mock("../../../src/server/db", () => ({ listApplications: () => [] }));

// The screen's own contract, which is what production hands it: the list
// items are built by `listApplicationItems` in the server, and the screen
// only draws what it is given.
const item = (
  over: Partial<ApplicationListItem> = {},
): ApplicationListItem => ({
  id: "app-one",
  name: "todo",
  source: "one/todo",
  condition: { tone: "muted", text: "Not deployed" },
  stack: "Not deployed yet",
  ...over,
});

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

  it("lists the condition and stack of each application from its records", () => {
    const html = renderToStaticMarkup(
      <ApplicationsScreen
        piReady
        applications={[
          item(),
          item({
            id: "app-two",
            source: "two/todo",
            condition: {
              tone: "warn",
              text: "Miniflux data has no backup plan",
              nextStep:
                "Configure a PostgreSQL backup copy outside this server.",
            },
          }),
        ]}
      />,
    );
    expect(html).toContain('href="/applications/app-one"');
    expect(html).toContain('href="/applications/app-two"');
    expect(html).toContain("one/todo");
    expect(html).toContain("two/todo");
    expect(html).toContain("Not deployed");
    expect(html).toContain("Miniflux data has no backup plan");
    expect(html).toContain("Next: Configure a PostgreSQL backup copy");
    expect(html).toContain("Needs attention");
    expect(html).not.toContain("Launch Brief");
  });

  it("reads an aged pass as fine, never as attention, and preserves the private URL", () => {
    const html = renderToStaticMarkup(
      <ApplicationsScreen
        piReady
        applications={[
          item({
            // What the list now says for checks that passed a while ago: an
            // old pass is a pass, and opening the application re-asks.
            condition: { tone: "live", text: "Checks held" },
            address: "http://127.0.0.1:18000",
          }),
        ]}
      />,
    );
    expect(html).toContain('href="http://127.0.0.1:18000"');
    expect(html).toContain("Fine");
    expect(html).not.toContain("Not checked");
    expect(html).not.toContain("Needs attention");
    expect(html).not.toContain("deployed yet");
  });

  it("does not accept form edits before hydration can retain them", () => {
    const html = renderToStaticMarkup(
      <NewApplicationScreen githubLogin="qa-user" />,
    );
    expect(html.match(/<input[^>]*id="repository-url"[^>]*>/)?.[0]).toContain(
      "disabled",
    );
    // The name comes from the repository and is changed afterwards, so the
    // page asks for one thing.
    expect(html).not.toContain('id="application-name"');
  });

  it("starts creation with an empty URL and no retired permission choice", () => {
    const html = renderToStaticMarkup(<NewApplicationScreen />);
    expect(html).toContain('name="repositoryUrl"');
    expect(html).toContain('value=""');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add application/);
    expect(html).not.toContain("todo-fastapi");
    expect(html).not.toContain('name="permissionMode"');
    for (const retired of ["Let Hallvi decide", "Full autonomy"])
      expect(html).not.toContain(retired);
    expect(html).toContain('href="/applications"');
  });
});
