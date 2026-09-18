import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InformationCard } from "../../../src/components/hallvi/information-card";
import { overviewReturnVisit } from "../../../src/components/hallvi/overview-page";
import type { SavedInformation } from "../../../src/server/operator-data";
import type { ApplicationRecord } from "../../../src/server/types";

const application = {
  id: "app",
  name: "Notes",
  repositoryUrl: "https://github.com/example/notes",
  repositoryOwner: "example",
  repositoryName: "notes",
  createdAt: "2026-09-18T08:00:00.000Z",
  updatedAt: "2026-09-18T08:00:00.000Z",
} satisfies ApplicationRecord;

function record(
  role: "recommendation" | "status" | "outcome",
  status: "info" | "verified" | "failed" | "warning",
): SavedInformation {
  return {
    id: `${role}-${status}`,
    applicationId: application.id,
    title:
      role === "recommendation"
        ? "Use a private first release"
        : "Release could not start",
    body: "This keeps the first visit limited while the application is checked.",
    evidence: [],
    establishedAt: "2026-09-18T08:30:00.000Z",
    createdAt: "2026-09-18T08:30:00.000Z",
    updatedAt: "2026-09-18T08:30:00.000Z",
    retiredAt: null,
    presentation: {
      role,
      status,
      views: ["overview"],
      checks: [],
      nextStep: "Connect the server and try again.",
    },
  } as SavedInformation;
}

describe("designed conversation results", () => {
  it("names a recommendation without inventing an action control", () => {
    const html = renderToStaticMarkup(
      <InformationCard record={record("recommendation", "info")} />,
    );
    expect(html).toContain("Recommendation");
    expect(html).toContain("What Pi suggests");
    expect(html).not.toContain("<button");
  });

  it("gives a recoverable problem one clearly labelled next step", () => {
    const html = renderToStaticMarkup(
      <InformationCard record={record("outcome", "failed")} />,
    );
    expect(html).toContain("Needs attention");
    expect(html).toContain("A useful next step");
    expect(html.match(/Connect the server and try again\./g)).toHaveLength(1);
  });
});

describe("a useful return visit", () => {
  it("describes missing deployment evidence without claiming real absence", () => {
    const visit = overviewReturnVisit([], application);
    expect(visit.title).toBe("No deployment is recorded yet");
    expect(visit.title).not.toBe("Not deployed");
    expect(visit.detail).toContain("repository is stored");
    expect(visit.detail).not.toContain("connected");
    expect(visit.action).toBe("Choose a server");
  });

  it("treats an unverified deployment as unfinished work", () => {
    const deployment = record("outcome", "info");
    deployment.presentation!.content = {
      kind: "deployment",
      repositoryUrl: application.repositoryUrl,
      revision: "abcdef1",
      image: "example/notes:latest",
      server: "notes-1",
      changes: [],
    };
    const visit = overviewReturnVisit([deployment], application);
    expect(visit.title).toBe("The working result has not been verified");
    expect(visit.action).toBe("Verify the deployment");
  });

  it("lets a newer failure supersede an older verified deployment", () => {
    const verified = record("outcome", "verified");
    verified.createdAt = "2026-09-18T08:00:00.000Z";
    verified.establishedAt = "2026-09-18T08:00:00.000Z";
    verified.presentation!.content = {
      kind: "deployment",
      repositoryUrl: application.repositoryUrl,
      revision: "abcdef1",
      image: "example/notes:good",
      server: "notes-1",
      changes: [],
    };
    const failed = record("outcome", "failed");
    failed.createdAt = "2026-09-18T09:00:00.000Z";
    failed.establishedAt = "2026-09-18T09:00:00.000Z";
    failed.presentation!.content = {
      kind: "deployment",
      repositoryUrl: application.repositoryUrl,
      revision: "abcdef2",
      image: "example/notes:broken",
      server: "notes-1",
      changes: [],
    };
    failed.presentation!.nextStep = "Repair the missing environment value.";

    const visit = overviewReturnVisit([verified, failed], application);
    expect(visit.title).toBe("The latest deployment record reports a failure");
    expect(visit.draft).toBe("Repair the missing environment value.");
    expect(visit.action).toBe("Resolve the deployment problem");
  });

  it("ignores deployment records belonging to another application", () => {
    const other = record("outcome", "verified");
    other.applicationId = "other-app";
    other.presentation!.content = {
      kind: "deployment",
      repositoryUrl: "https://github.com/example/other",
      revision: "abcdef1",
      image: "example/other:latest",
      server: "other-1",
      changes: [],
    };
    const visit = overviewReturnVisit([other], application);
    expect(visit.title).toBe("No deployment is recorded yet");
  });
});
