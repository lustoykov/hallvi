import React from "react";

const noop = () => {};

const statusLabels = {
  done: "Verified",
  planned: "Planned",
  approval: "Approval",
  running: "Observing",
  blocked: "Blocked",
  "needs-input": "Needs input",
  queued: "Queued",
};

export function SourceLink({ children = "Details", onClick = noop }) {
  return <button className="source-link" type="button" onClick={onClick}>{children}</button>;
}

export function StateFact({ label, value, source, tone = "neutral", onOpen = noop }) {
  return (
    <div className={`state-fact state-fact-${tone}`}>
      <span><small>{label}</small><strong>{value}</strong></span>
      <span><em>{source}</em><SourceLink onClick={onOpen}>Source</SourceLink></span>
    </div>
  );
}

export function StateColumn({ title, eyebrow, rows, tone, onOpen = noop }) {
  return (
    <section className={`state-column state-column-${tone}`}>
      <header><span>{eyebrow}</span><strong>{title}</strong></header>
      <div>
        {rows.map(([label, value, source]) => (
          <StateFact key={`${label}-${value}`} label={label} value={value} source={source} tone={tone} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export function PlanDelta({ action, title, note, onOpen = noop }) {
  return (
    <div className={`plan-delta plan-delta-${action}`}>
      <span>{action}</span>
      <strong>{title}</strong>
      <small>{note}</small>
      <SourceLink onClick={onOpen}>Inspect</SourceLink>
    </div>
  );
}

export function ReconciliationSummary({
  desired,
  observed,
  deltas,
  desiredTitle = "Application Contract",
  observedTitle = "Fresh observations",
  onOpen = noop,
}) {
  return (
    <section className="reconciliation-summary" aria-label="Desired state compared with observed state">
      <div className="state-comparison">
        <StateColumn title={desiredTitle} eyebrow="Desired" rows={desired} tone="desired" onOpen={() => onOpen("record")} />
        <StateColumn title={observedTitle} eyebrow="Observed" rows={observed} tone="observed" onOpen={() => onOpen("evidence")} />
      </div>
      <section className="delta-column">
        <header><span>Computed delta</span><strong>{deltas.length} {deltas.length === 1 ? "change" : "changes"}</strong></header>
        <div>{deltas.map(([action, title, note]) => <PlanDelta key={`${action}-${title}`} action={action} title={title} note={note} onOpen={() => onOpen("changes")} />)}</div>
      </section>
    </section>
  );
}

export function OperationNode({ node, selected, onSelect = noop }) {
  return (
    <button
      className={`operation-node operation-node-${node.status} ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={selected}
    >
      <span className="operation-number">{node.number}</span>
      <span className="operation-copy"><strong>{node.short}</strong><small>{statusLabels[node.status] || node.status}</small></span>
      <span className={`operation-owner operation-owner-${node.kind}`}>{node.kind === "deterministic" ? "Rule" : node.kind === "external-agent" ? "Agent" : "Pi"}</span>
    </button>
  );
}

export function OperationGraph({
  nodes,
  selectedNodeId,
  eyebrow = "Deterministic launch procedure",
  title = "Dependency-ordered operation graph",
  onSelect = noop,
}) {
  return (
    <section className="operation-graph" aria-label="Launch reconciliation graph">
      <header>
        <span><small>{eyebrow}</small><strong>{title}</strong></span>
        <span className="graph-legend"><i className="legend-rule" />Rule node <i className="legend-pi" />Judgment point</span>
      </header>
      <div className="operation-node-list">
        {nodes.map((node) => <OperationNode key={node.id} node={node} selected={node.id === selectedNodeId} onSelect={onSelect} />)}
      </div>
    </section>
  );
}

export function SelectedOperation({ node, onOpen = noop }) {
  if (!node) return null;
  return (
    <section className={`selected-operation selected-operation-${node.kind}`}>
      <header>
        <span><small>{node.kind === "deterministic" ? "Deterministic operation" : node.kind === "external-agent" ? "Bounded agent handoff" : "Pi judgment point"}</small><strong>{node.number} · {node.title}</strong></span>
        <span className={`status-badge ${["done"].includes(node.status) ? "success" : ["blocked", "needs-input", "approval"].includes(node.status) ? "warning" : ""}`}>{statusLabels[node.status] || node.status}</span>
      </header>
      <p>{node.summary}</p>
      <dl>
        <div><dt>Actor</dt><dd>{node.owner}</dd></div>
        <div><dt>External effect</dt><dd>{node.effect}</dd></div>
        <div><dt>Depends on</dt><dd>{node.dependencies}</dd></div>
        <div><dt>Evidence</dt><dd>{node.evidence}</dd></div>
      </dl>
      <footer><SourceLink onClick={() => onOpen("changes")}>Inspect operation</SourceLink><SourceLink onClick={() => onOpen("evidence")}>Verify evidence</SourceLink></footer>
    </section>
  );
}

export function JudgmentPoint({ judgment, onRecord = noop, onOpen = noop, selectedChoice = "" }) {
  if (!judgment) return null;
  return (
    <section className="judgment-point">
      <header><span>Pi judgment point</span><strong>{judgment.title}</strong></header>
      <p>{judgment.reason}</p>
      <div className="choice-list">
        {judgment.options.map((option) => (
          <button className={`choice-card ${selectedChoice.includes(option) ? "is-selected" : ""}`} type="button" key={option} onClick={() => onRecord(`${option}. Recompute the launch graph from this desired-state decision.`)}>
            <strong>{option}</strong><small>Record desired state, refresh observations, then re-plan deterministic nodes.</small>
          </button>
        ))}
      </div>
      <footer><button type="button" onClick={() => onRecord(`Ask Pi to investigate: ${judgment.title}.`)}>Ask Pi to investigate</button><button type="button" onClick={() => onOpen("evidence")}>Inspect source evidence</button><button type="button" onClick={() => onRecord(`Take engineer control of: ${judgment.title}.`)}>Take control</button></footer>
    </section>
  );
}

export function ApprovalBoundary({ approval, onRecord = noop, onOpen = noop }) {
  if (!approval) return null;
  return (
    <section className="approval-boundary">
      <header><span>Approval boundary</span><strong>{approval.title}</strong></header>
      <dl><div><dt>Bounded request</dt><dd>{approval.boundary}</dd></div><div><dt>Consequence</dt><dd>{approval.consequence}</dd></div></dl>
      <footer><button className="primary-button" type="button" onClick={() => onRecord(`Approved ${approval.title} within ${approval.boundary}.`)}>Approve operation</button><button type="button" onClick={() => onRecord(`Change requested for ${approval.title}.`)}>Change desired state</button><button type="button" onClick={() => onOpen("changes")}>Inspect request</button></footer>
    </section>
  );
}

export function OperationalClaims({ claims, onOpen = noop }) {
  if (!claims) return null;
  return (
    <section className="operational-claims">
      <header><span>Evidence-backed outcome</span><strong>{claims.length} operational claims</strong></header>
      <div>{claims.map(([claim, source]) => <div className="claim-row" key={claim}><span className="mini-dot success" /><span><strong>{claim}</strong><small>{source}</small></span><SourceLink onClick={() => onOpen("evidence")}>Evidence</SourceLink></div>)}</div>
    </section>
  );
}

export function AgentHandoff({ handoff, onOpen = noop, onRecord = noop }) {
  if (!handoff) return null;
  return (
    <section className="agent-handoff">
      <header><span>External coding worker</span><strong>{handoff.title}</strong></header>
      <dl><div><dt>Change scope</dt><dd>{handoff.scope}</dd></div><div><dt>Checks</dt><dd>{handoff.checks}</dd></div></dl>
      <footer><button className="primary-button" type="button" onClick={() => onOpen("changes")}>Review pull request</button><button type="button" onClick={() => onRecord("Ask Pi to explain Pull Request #42 against the failed profile check.")}>Ask Pi</button><button type="button" onClick={() => onRecord("Re-run profile conformance against Pull Request #42.")}>Re-run conformance</button></footer>
    </section>
  );
}

export function ReconciliationPresentation({ scenario, selectedNodeId, onSelectNode = noop, onOpenInspector = noop, onRecord = noop, selectedChoice = "" }) {
  const selectedNode = scenario.nodes.find((node) => node.id === selectedNodeId) || scenario.nodes[0];
  return (
    <section className="reconciliation-presentation" aria-labelledby="reconciliation-title">
      <header>
        <span><small>Launch reconciliation</small><strong id="reconciliation-title">{scenario.headline}</strong></span>
        <span className={`status-badge ${scenario.status === "Healthy" ? "success" : ["Blocked", "Needs input", "Approval required"].includes(scenario.status) ? "warning" : ""}`}>{scenario.status}</span>
      </header>
      <div className="reconciliation-body">
        <div className="reconciliation-objective"><span>Current bar</span><strong>{scenario.objective}</strong><SourceLink onClick={() => onOpenInspector("record")}>Contract</SourceLink></div>
        <ReconciliationSummary desired={scenario.desired} observed={scenario.observed} deltas={scenario.deltas} onOpen={onOpenInspector} />
        <OperationGraph nodes={scenario.nodes} selectedNodeId={selectedNode.id} onSelect={onSelectNode} />
        <SelectedOperation node={selectedNode} onOpen={onOpenInspector} />
        {scenario.judgment?.nodeId === selectedNode.id && <JudgmentPoint judgment={scenario.judgment} onRecord={onRecord} onOpen={onOpenInspector} selectedChoice={selectedChoice} />}
        {scenario.approval?.nodeId === selectedNode.id && <ApprovalBoundary approval={scenario.approval} onRecord={onRecord} onOpen={onOpenInspector} />}
        <OperationalClaims claims={scenario.claims} onOpen={onOpenInspector} />
        <AgentHandoff handoff={scenario.handoff} onOpen={onOpenInspector} onRecord={onRecord} />
      </div>
    </section>
  );
}
