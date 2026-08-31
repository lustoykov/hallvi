import React from "react";

const verificationResults = [
  ["HTTP", "200 OK", "182 ms from public probe"],
  ["TLS", "Valid", "northstar.dev · expires Nov 28, 2026"],
  ["Application", "Healthy", "/health reports release 9f3c2ad"],
  ["Database", "Connected", "PostgreSQL read/write probe passed"],
  ["Sentinel", "Observing", "3 consecutive checks passed"],
];

const changedFiles = [
  ["src/health/handler.go", "+28", "Adds the health response and release metadata"],
  ["routes/routes.go", "+4 −1", "Registers GET /health without authentication"],
  ["src/health/handler_test.go", "+46", "Covers status, content type, and payload"],
];

const ciChecks = [
  ["Lint", "Passed", "28 s"],
  ["Test", "Passed", "2 m 14 s"],
  ["Build", "Passed", "1 m 08 s"],
];

const noop = () => {};

export function OutcomePresentation({ onOpenInspector = noop, onRecord = noop, selectedChoice = "" }) {
  const openedApplication = selectedChoice?.includes("production application");

  return (
    <section className="presentation outcome-presentation" aria-labelledby="outcome-title">
      <header><span className="mini-dot success" aria-hidden="true" /><strong id="outcome-title">L8.5 · Production release verified</strong><span className="status-badge success">Verified live</span></header>
      <div className="presentation-body">
        <div className="metric-grid" aria-label="Release identity">
          <div className="metric"><small>Production URL</small><strong>https://northstar.dev</strong></div>
          <div className="metric"><small>Release SHA</small><strong><code>9f3c2ad</code></strong></div>
          <div className="metric"><small>Verified at</small><strong>10:42:18 UTC</strong></div>
        </div>
        <div className="check-list" aria-label="Release verification results">
          {verificationResults.map(([label, result, evidence]) => (
            <div className="check-row" key={label}><span className="mini-dot success" aria-hidden="true" /><span><strong>{label}</strong> <small>{evidence}</small></span><span className="status-badge success">{result}</span><button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button></div>
          ))}
        </div>
        <div className="callout warning"><strong>Accepted gap</strong> · A product-specific business metric is not defined yet. Core health, errors, logs, and uptime remain observable. <button type="button" onClick={() => onOpenInspector("record")}>Review decision</button></div>
        <div className="presentation-actions">
          <button className="primary-button" type="button" onClick={() => onRecord("Opened the production application at https://northstar.dev.")}>Open application</button>
          <button type="button" onClick={() => onOpenInspector("evidence")}>Verify evidence</button>
          {openedApplication && <small>Application open action recorded</small>}
        </div>
      </div>
    </section>
  );
}

export function HandoffPresentation({ onOpenInspector = noop, onRecord = noop, selectedChoice = "" }) {
  const mergeDecisionRecorded = selectedChoice?.includes("Merge Pull Request #42");

  return (
    <section className="presentation handoff-presentation" aria-labelledby="handoff-title">
      <header><span className="mini-dot active" aria-hidden="true" /><strong id="handoff-title">Pull Request #42 · health endpoint</strong><span className="status-badge warning">Awaiting review</span></header>
      <div className="presentation-body">
        <dl>
          <div className="field-row"><dt>Branch</dt><dd><code>feature/health-endpoint</code> → <code>main</code></dd></div>
          <div className="field-row"><dt>Commit</dt><dd><code>9f3c2ad4b1e8c8f7a5e2</code></dd></div>
        </dl>
        <div>
          <span className="eyebrow">Changed files · 3</span>
          <div className="file-list">
            {changedFiles.map(([path, delta, summary]) => (
              <div className="file-row" key={path}><span className="mini-dot success" aria-hidden="true" /><span><strong><code>{path}</code></strong> <small>{summary}</small></span><strong>{delta}</strong><button type="button" onClick={() => onOpenInspector("changes")}>Diff</button></div>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">CI summary</span>
          <div className="check-list">
            {ciChecks.map(([name, status, duration]) => (
              <div className="check-row" key={name}><span className="mini-dot success" aria-hidden="true" /><strong>{name}</strong><small>{status} · {duration}</small><button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button></div>
            ))}
            <div className="check-row"><span className="mini-dot active" aria-hidden="true" /><strong>Smoke / profile check</strong><small>Running · required before merge</small><button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button></div>
          </div>
        </div>
        <div className="callout">Pi reviewed the worker result for scope and repository conformance. The remaining smoke/profile check requires the launch environment.</div>
        <div className="presentation-actions">
          <button className="primary-button" type="button" onClick={() => onOpenInspector("changes")}>Review PR</button>
          <button type="button" onClick={() => onRecord("Asked Pi to explain Pull Request #42 and its remaining check.")}>Ask Pi</button>
          <button type="button" onClick={() => onRecord("Merge Pull Request #42 when the smoke/profile check passes.")}>Merge when green</button>
          {mergeDecisionRecorded && <small>Merge decision recorded</small>}
        </div>
      </div>
    </section>
  );
}
