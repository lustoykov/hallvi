/** Labels belong to the product; never display free-form receipt text. */
const knownPlugins: Record<string, { label: string; dependency?: string }> = {
  "grafana-metricsdrilldown-app": { label: "Metrics Drilldown" },
  "grafana-postgresql-datasource": { label: "PostgreSQL" },
  "grafana-lokiexplore-app": { label: "Logs Drilldown", dependency: "Loki" },
  "grafana-exploretraces-app": {
    label: "Traces Drilldown",
    dependency: "Tempo",
  },
  "grafana-pyroscope-app": {
    label: "Profiles Drilldown",
    dependency: "Pyroscope",
  },
  "grafana-advisor-app": { label: "Advisor" },
  mysql: { label: "MySQL" },
  mssql: { label: "Microsoft SQL Server" },
  elasticsearch: { label: "Elasticsearch" },
};

export interface BackupPluginEvidence {
  key: string;
  label: string;
  version: string | null;
  state: "verified" | "limited" | "loaded" | "not-verified";
  detail: string;
}

interface PluginRecord {
  id?: string;
  version?: string;
  registered: boolean;
  moduleServed: boolean;
  behavior?: string | null;
  uiState?: string;
  browserErrors?: number;
}

/** Registration is distinct from a tested query or a missing dependency. */
export function pluginEvidence(
  plugins: PluginRecord[],
  postgres?: { healthVerified: boolean; rowsVerified: number },
): BackupPluginEvidence[] {
  return plugins.map((plugin, index) => {
    const known = plugin.id ? knownPlugins[plugin.id] : undefined;
    const label = known?.label ?? "Other installed plugin";
    let state: BackupPluginEvidence["state"] = "not-verified";
    let detail = "Registration and file integrity were not both verified.";
    if (plugin.registered && plugin.moduleServed) {
      state = "loaded";
      detail = "Registered and files matched. No functional query was tested.";
      if (known?.dependency && plugin.uiState === "requires-service") {
        state = "limited";
        detail = `Needs ${known.dependency}. Its data workflow was not tested.`;
        if ((plugin.browserErrors ?? 0) > 0)
          detail += " The inspected page also reported a browser error.";
      } else if (
        plugin.id === "grafana-advisor-app" &&
        plugin.uiState === "requires-feature-flag"
      ) {
        state = "limited";
        detail = "Requires the Grafana Advisor feature flag before use.";
      } else if (
        plugin.id === "grafana-metricsdrilldown-app" &&
        plugin.behavior === "metrics-query-and-drilldown" &&
        plugin.browserErrors === 0
      ) {
        state = "verified";
        detail = "Listed real metrics and rendered a selected metric's chart.";
      } else if (
        plugin.id === "grafana-postgresql-datasource" &&
        plugin.behavior === "postgresql-query" &&
        postgres?.healthVerified &&
        Number.isSafeInteger(postgres.rowsVerified) &&
        postgres.rowsVerified > 0
      ) {
        state = "verified";
        detail = `Connected and queried ${postgres.rowsVerified} test rows in a disposable PostgreSQL database.`;
      }
    }
    return {
      key: `plugin-${index}`,
      label,
      version:
        plugin.version && /^\d{1,4}(?:\.\d{1,4}){1,3}$/.test(plugin.version)
          ? plugin.version
          : null,
      state,
      detail,
    };
  });
}
