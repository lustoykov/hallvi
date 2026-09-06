import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import Home from "../../../src/app/page";
import { ApplicationsScreen } from "../../../src/components/server-guy/applications-screen";
import { NewApplicationScreen } from "../../../src/components/server-guy/new-application-screen";
import type { ApplicationRecord } from "../../../src/server/types";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const workspace = {
  id: "workspace-one",
  applicationId: "app-one",
  phaseKey: "start" as const,
  createdAt: "2026-09-04T00:00:00Z",
  completedAt: null,
  deliverableEvidence: null,
  phaseNumber: 1,
  name: "Start",
  deliverable: "Launch Brief",
  status: "ready" as const,
  current: true,
};

const application: ApplicationRecord = {
  id: "app-one",
  name: "todo",
  repositoryUrl: "https://github.com/one/todo",
  repositoryOwner: "one",
  repositoryName: "todo",
  environment: "production",
  approvalMode: "pi-decides",
  approvalScope: "Current application launch",
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
  });

  it("distinguishes repositories with the same name and links to the exact app", () => {
    const html = renderToStaticMarkup(
      <ApplicationsScreen
        piReady
        applications={[
          { application, workspace, passedChecks: 4, totalChecks: 4 },
          {
            application: {
              ...application,
              id: "app-two",
              repositoryOwner: "two",
            },
            workspace: {
              ...workspace,
              id: "workspace-two",
              applicationId: "app-two",
              status: "in-progress",
            },
            passedChecks: 2,
            totalChecks: 4,
          },
        ]}
      />,
    );
    expect(html).toContain('href="/applications/app-one"');
    expect(html).toContain('href="/applications/app-two"');
    expect(html).toContain("one/todo");
    expect(html).toContain("two/todo");
    expect(html).toContain("Launch Brief ready");
    expect(html).toContain("Needs attention");
    expect(html).not.toContain("Deployed");
  });

  it("starts creation with an empty URL and an explicit permission choice", () => {
    const html = renderToStaticMarkup(<NewApplicationScreen />);
    expect(html).toContain('name="repositoryUrl"');
    expect(html).toContain('value=""');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add application/);
    expect(html).not.toContain("todo-fastapi");
    expect(html).toContain("Always ask");
    expect(html).toContain("Let Server Guy decide");
    expect(html).toContain("Full autonomy");
    expect(html).toContain('href="/applications"');
  });
});
