import React from "react";

const noop = () => {};

export function ApprovalPresentation({ onOpenInspector = noop, onRecord = noop, selectedChoice = "" }) {
  const approved = selectedChoice.includes("Approve Hetzner");
  return (
    <section className="presentation approval-presentation" aria-labelledby="vps-approval-title">
      <header><span className="eyebrow">Paid external effect</span><strong id="vps-approval-title">Approve Hetzner VPS purchase</strong><span className="status-badge warning">Approval required</span></header>
      <div className="presentation-body">
        <dl>
          <div className="field-row"><dt>Resource</dt><dd>CX32 · 4 vCPU · 8 GB RAM · 80 GB <button type="button" onClick={() => onOpenInspector("changes")}>Details</button></dd></div>
          <div className="field-row"><dt>Location / image</dt><dd>Falkenstein <code>fsn1</code> · Ubuntu 24.04 <button type="button" onClick={() => onOpenInspector("evidence")}>Source</button></dd></div>
          <div className="field-row"><dt>Cost boundary</dt><dd>Must remain at or below €12/month before tax <button type="button" onClick={() => onOpenInspector("evidence")}>Price evidence</button></dd></div>
          <div className="field-row"><dt>Credential boundary</dt><dd>Pi may use the scoped Hetzner token; it is never exposed to coding agents.</dd></div>
        </dl>
        <div className="callout warning"><strong>What happens after approval:</strong> Server Guy records the intended resource, submits one idempotent create request, reconciles the provider receipt, then verifies SSH and network readiness. Billing starts when Hetzner creates the server.</div>
        <div className="presentation-actions">
          <button className="primary-button" type="button" onClick={() => onRecord("Approve Hetzner CX32 purchase up to €12/month.")}>Approve purchase</button>
          <button type="button" onClick={() => onRecord("Change the Hetzner resource request before purchase.")}>Change request</button>
          <button className="danger" type="button" onClick={() => onRecord("Cancel the VPS purchase proposal.")}>Cancel</button>
          <button type="button" onClick={() => onOpenInspector("evidence")}>Review evidence</button>
          {approved && <small>Approval recorded · no purchase simulated</small>}
        </div>
      </div>
    </section>
  );
}

const propagationSteps = [
  ["success", "Cloudflare accepted CNAME", "Receipt cf_req_9f21 · 10:31:02"],
  ["success", "Authoritative nameserver updated", "1.1.1.1 sees the target · 10:31:18"],
  ["active", "Public resolver propagation", "Google DNS still has previous TTL · checking again"],
  ["", "TLS and application probe", "Starts after public resolvers agree"],
];

export function OperationPresentation({ onOpenInspector = noop, onRecord = noop }) {
  return (
    <section className="presentation operation-presentation" aria-labelledby="dns-operation-title">
      <header><span className="eyebrow">Operation in progress</span><strong id="dns-operation-title">L6.5 · Wait for DNS propagation</strong><span className="status-badge">11 min elapsed</span></header>
      <div className="presentation-body">
        <div className="metric-grid"><div className="metric"><small>Record</small><strong>CNAME app → northstar-vps</strong></div><div className="metric"><small>Expected window</small><strong>5–30 min</strong></div><div className="metric"><small>Next check</small><strong>in 48 seconds</strong></div></div>
        <div className="step-list">
          {propagationSteps.map(([tone, title, detail]) => <div className="step-row" key={title}><span className={`mini-dot ${tone}`} /><span><strong>{title}</strong><small>{detail}</small></span><button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button></div>)}
        </div>
        <div className="callout"><code>dig +short app.northstar.dev @8.8.8.8</code><br />Current observation: cached previous route. Server Guy is waiting; it is not resubmitting the DNS change.</div>
        <div className="presentation-actions">
          <button className="primary-button" type="button" onClick={() => onOpenInspector("evidence")}>Check now</button>
          <button type="button" onClick={() => onRecord("Pause automatic DNS propagation checks.")}>Pause checks</button>
          <button className="danger" type="button" onClick={() => onRecord("Stop waiting and leave the submitted DNS record unchanged.")}>Stop waiting</button>
          <button type="button" onClick={() => onOpenInspector("changes")}>Open DNS change</button>
        </div>
      </div>
    </section>
  );
}

export function InterventionPresentation({ onOpenInspector = noop, onRecord = noop, selectedChoice = "" }) {
  const resolved = selectedChoice.includes("Remove conflicting AAAA");
  return (
    <section className="presentation intervention-presentation" aria-labelledby="dns-conflict-title">
      <header><span className="eyebrow">Blocked</span><strong id="dns-conflict-title">L6.6 · Conflicting DNS route</strong><span className="status-badge warning">Needs intervention</span></header>
      <div className="presentation-body">
        <div className="callout warning"><strong>Pi diagnosis:</strong> IPv4 traffic reaches the new VPS, but the existing AAAA record sends IPv6 clients to <code>2001:db8:42::7</code>. Server Guy stopped instead of overwriting an unexplained record.</div>
        <div className="file-list">
          <div className="file-row"><span className="mini-dot success" /><span><strong>A · app.northstar.dev</strong><small>203.0.113.42 · intended VPS</small></span><button type="button" onClick={() => onOpenInspector("evidence")}>Source</button></div>
          <div className="file-row"><span className="mini-dot warning" /><span><strong>AAAA · app.northstar.dev</strong><small>2001:db8:42::7 · unknown prior target</small></span><button type="button" onClick={() => onOpenInspector("evidence")}>Raw record</button></div>
        </div>
        <div className="choice-list">
          <button className={`choice-card ${resolved ? "is-selected" : ""}`} type="button" onClick={() => onRecord("Remove conflicting AAAA record, then re-run DNS verification.")}><strong>Remove the stale AAAA record</strong><small>Pi recommendation · appropriate if no IPv6 service owns the prior target.</small></button>
          <button className="choice-card" type="button" onClick={() => onRecord("Keep the AAAA record and configure IPv6 on the new VPS before verification.")}><strong>Preserve IPv6 and configure the VPS</strong><small>More work, but keeps dual-stack reachability.</small></button>
        </div>
        <div className="presentation-actions">
          <button className="primary-button" type="button" onClick={() => onOpenInspector("changes")}>Review proposed change</button>
          <button type="button" onClick={() => onRecord("Take direct engineer control of the Cloudflare DNS conflict.")}>Take control</button>
          <button type="button" onClick={() => onOpenInspector("evidence")}>Re-run verification</button>
          <small>Advance only when A/AAAA routes agree and public probes pass.</small>
        </div>
      </div>
    </section>
  );
}
