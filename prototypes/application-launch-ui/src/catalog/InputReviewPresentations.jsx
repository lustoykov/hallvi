import React, { useState } from "react";

const noop = () => {};

export function InputDecisionPresentation({ onOpenInspector = noop, onRecord = noop, selectedChoice = "" }) {
  const [customHostname, setCustomHostname] = useState("");
  const choices = [
    { value: "app.northstar.dev", title: "app.northstar.dev", detail: "Recommended · keeps the apex available for a landing page or redirect." },
    { value: "northstar.dev", title: "northstar.dev", detail: "Serve the application directly from the apex domain." },
  ];

  return (
    <section className="presentation input-decision-presentation" aria-labelledby="domain-choice-title">
      <header><span className="eyebrow">Decision required</span><strong id="domain-choice-title">Choose the production hostname</strong><span className="status-badge warning">Gate 1/3</span></header>
      <div className="presentation-body">
        <dl>
          <div className="field-row"><dt>Domain</dt><dd>northstar.dev · already owned <button type="button" onClick={() => onOpenInspector("evidence")}>Source</button></dd></div>
          <div className="field-row"><dt>Cloudflare zone</dt><dd>Connected · authoritative nameservers detected <button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button></dd></div>
          <div className="field-row"><dt>Target service</dt><dd><code>web:3000</code> behind Caddy/TLS <button type="button" onClick={() => onOpenInspector("changes")}>Details</button></dd></div>
        </dl>
        <div className="callout"><strong>Pi recommends app.northstar.dev.</strong> It avoids coupling the app route to future apex-domain decisions. Nothing is selected until you record a choice.</div>
        <div className="choice-list">
          {choices.map((choice) => (
            <button className={`choice-card ${selectedChoice.includes(choice.value) ? "is-selected" : ""}`} type="button" key={choice.value} onClick={() => onRecord(`Use ${choice.value} as the production hostname.`)}>
              <strong>{choice.title}</strong><small>{choice.detail}</small>
            </button>
          ))}
        </div>
        <label className="field-row"><span>Custom hostname</span><span><input className="inline-input" value={customHostname} onChange={(event) => setCustomHostname(event.target.value)} placeholder="service.northstar.dev" /></span></label>
        <div className="presentation-actions">
          <button className="primary-button" type="button" disabled={!customHostname.trim()} onClick={() => onRecord(`Use ${customHostname.trim()} as the production hostname.`)}>Record custom hostname</button>
          <button type="button" onClick={() => onOpenInspector("record")}>Ask Pi</button>
          <button type="button" onClick={() => onOpenInspector("evidence")}>Inspect domain contract</button>
          <small>Advance when hostname, ownership path, and DNS authority are explicit.</small>
        </div>
      </div>
    </section>
  );
}

const plannedFiles = [
  ["ops/compose.production.yml", "Runtime services, health checks, volumes"],
  ["ops/Caddyfile", "TLS termination and public route"],
  ["ops/server-guy.yml", "Application contract and verification"],
  [".github/workflows/deploy.yml", "Build and deployment handoff"],
  ["docs/operations.md", "Operator recovery commands"],
];

export function ReviewProposalPresentation({ onOpenInspector = noop, onRecord = noop, selectedChoice = "" }) {
  const accepted = selectedChoice.includes("Accept launch plan");
  return (
    <section className="presentation review-proposal-presentation" aria-labelledby="launch-plan-title">
      <header><span className="eyebrow">Review proposal</span><strong id="launch-plan-title">L4.2 · Launch plan</strong><span className="status-badge">No external effects</span></header>
      <div className="presentation-body">
        <div className="metric-grid">
          <div className="metric"><small>Compute</small><strong>Hetzner CX32</strong></div>
          <div className="metric"><small>Edge / DNS</small><strong>Cloudflare</strong></div>
          <div className="metric"><small>Estimated cost</small><strong>≤ €12 / month</strong></div>
        </div>
        <div className="callout">One VPS runs Caddy, the application, PostgreSQL, backup jobs, and the lightweight Sentinel. Pi can revise this topology before any paid resource is created.</div>
        <div>
          <span className="eyebrow">Proposed repository changes</span>
          <div className="file-list">
            {plannedFiles.map(([file, detail]) => <div className="file-row" key={file}><span className="mini-dot active" /><span><strong><code>{file}</code></strong><small>{detail}</small></span><button type="button" onClick={() => onOpenInspector("changes")}>Diff</button></div>)}
          </div>
        </div>
        <div className="risk-list">
          <div className="risk-row"><span className="mini-dot warning" /><span><strong>Backup destination unresolved</strong><small>Object storage provider must be chosen before Operations.</small></span><button type="button" onClick={() => onOpenInspector("evidence")}>Source</button></div>
          <div className="risk-row"><span className="mini-dot warning" /><span><strong>Database size inferred</strong><small>Current repository contains no production dataset evidence.</small></span><button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button></div>
        </div>
        <div className="presentation-actions">
          <button className="primary-button" type="button" onClick={() => onRecord("Accept launch plan L4.2 for provider approval.")}>Accept plan</button>
          <button type="button" onClick={() => onRecord("Ask Pi to revise the launch topology and cost assumptions.")}>Ask Pi to revise</button>
          <button type="button" onClick={() => onOpenInspector("changes")}>Review all changes</button>
          <button type="button" onClick={() => onOpenInspector("evidence")}>Inspect evidence</button>
          {accepted && <small>Plan acceptance recorded</small>}
        </div>
      </div>
    </section>
  );
}
