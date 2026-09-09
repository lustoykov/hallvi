import { describe, expect, it } from "vitest";
import { pluginEvidence } from "../../../src/server/backup-plugin-evidence";

describe("plugin restore evidence", () => {
  it("does not turn files or arbitrary behavior text into functional proof", () => {
    const [plugin] = pluginEvidence([
      {
        id: "mysql",
        registered: true,
        moduleServed: true,
        behavior: "everything works",
      },
    ]);
    expect(plugin.state).toBe("loaded");
    expect(plugin.detail).toContain("No functional query");
  });

  it("requires successful behavior evidence and shows missing dependencies", () => {
    const result = pluginEvidence([
      {
        id: "grafana-metricsdrilldown-app",
        registered: true,
        moduleServed: true,
        behavior: "metrics-query-and-drilldown",
        browserErrors: 1,
      },
      {
        id: "grafana-postgresql-datasource",
        registered: true,
        moduleServed: true,
        behavior: "postgresql-query",
      },
      {
        id: "grafana-exploretraces-app",
        registered: true,
        moduleServed: true,
        uiState: "requires-service",
        browserErrors: 1,
      },
    ]);
    expect(result.map((item) => item.state)).toEqual([
      "loaded",
      "loaded",
      "limited",
    ]);
    expect(result[2].detail).toContain("Needs Tempo");
    expect(result[2].detail).toContain("browser error");
  });

  it("only displays product labels and numeric versions", () => {
    const [plugin] = pluginEvidence([
      {
        id: "SECRET_ID",
        version: "secret-token",
        registered: true,
        moduleServed: true,
      },
    ]);
    expect(plugin.label).toBe("Other installed plugin");
    expect(plugin.version).toBeNull();
    expect(JSON.stringify(plugin)).not.toContain("SECRET_ID");
  });
});
