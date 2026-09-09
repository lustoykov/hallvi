import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ContractVersionList,
  describeFieldChange,
} from "../../../src/components/server-guy/contract-versions";
import type { ContractHistoryEntry } from "../../../src/server/contract-history";

const at = "2026-09-07T10:00:00.000Z";

function entry(
  overrides: Partial<ContractHistoryEntry> & { version: number },
): ContractHistoryEntry {
  return {
    id: `contract-${overrides.version}`,
    commitSha: "1".repeat(40),
    createdAt: at,
    current: false,
    phaseKey: "inspect-app",
    profileId: "fastapi-uv",
    profileVersion: 1,
    fieldCount: 19,
    summary: "FastAPI service managed with uv.",
    reason: null,
    commitChanged: false,
    changes: [],
    ...overrides,
  };
}

describe("describeFieldChange", () => {
  it("says a source-only change is a source change, never x → x", () => {
    const text = describeFieldChange({
      key: "health.path",
      label: "Health endpoint",
      kind: "source",
      before: { value: "/health", source: "repository-declared", work: null },
      after: { value: "/health", source: "user-confirmed", work: null },
    });
    expect(text).toBe(
      "Health endpoint: same value, source changed · Declared in repository → Your choice",
    );
    expect(text).not.toContain("/health → /health");
  });

  it("describes value, combined, added and removed changes", () => {
    expect(
      describeFieldChange({
        key: "network.port",
        label: "Port",
        kind: "value-and-source",
        before: { value: "8000", source: "repository-declared", work: null },
        after: { value: "8080", source: "inferred", work: null },
      }),
    ).toBe("Port: 8000 → 8080 · source Declared in repository → Inferred");
    expect(
      describeFieldChange({
        key: "runtime.python",
        label: "Python version",
        kind: "added",
        before: null,
        after: { value: ">=3.12", source: "repository-declared", work: null },
      }),
    ).toBe("Python version: added · >=3.12 · Declared in repository");
    expect(
      describeFieldChange({
        key: "database.migrations",
        label: "Migrations",
        kind: "removed",
        before: { value: "alembic", source: "repository-declared", work: null },
        after: null,
      }),
    ).toBe("Migrations: removed (was alembic)");
  });
});

describe("ContractVersionList", () => {
  it("marks the current version, keeps earlier ones read-only and quotes the reason", () => {
    const html = renderToStaticMarkup(
      <ContractVersionList
        versions={[
          entry({
            version: 2,
            current: true,
            reason: {
              messageId: "m2",
              role: "user",
              source: "user",
              quote: "contract: correct /health",
            },
            changes: [
              {
                key: "health.path",
                label: "Health endpoint",
                kind: "source",
                before: {
                  value: "/health",
                  source: "profile-rule",
                  work: null,
                },
                after: {
                  value: "/health",
                  source: "user-confirmed",
                  work: null,
                },
              },
            ],
          }),
          entry({
            version: 1,
            reason: {
              messageId: "m1",
              role: "user",
              source: "server-guy",
              quote:
                "Inspect the repository and propose the Application Contract.",
            },
          }),
        ]}
      />,
    );
    expect(html).toContain("v2 · current");
    expect(html).toContain("v1 · read-only");
    expect(html).toContain("You said: “contract: correct /health”");
    expect(html).toContain(
      "Server Guy&#x27;s request: “Inspect the repository and propose the Application Contract.”",
    );
    expect(html).toContain("same value, source changed");
    expect(html).toContain('href="/api/contracts/contract-1"');
    expect(html).not.toContain('href="/api/contracts/contract-2"');
  });
});
