import React from "react";

const noop = () => {};

const familyLabels = {
  decision: "Decision required",
  review: "Review proposal",
  approval: "External effect",
  operation: "Operation active",
  intervention: "Intervention required",
  outcome: "Outcome recorded",
  handoff: "Coding-agent handoff",
  evidence: "Evidence record",
};

function StatusBadge({ state }) {
  const warning = state.tone === "warning" || state.tone === "danger" || /input|review|approval|blocked|decision/i.test(state.status);
  const success = state.tone === "success";
  return <span className={`status-badge ${success ? "success" : warning ? "warning" : ""}`}>{state.status}</span>;
}

function SurfaceHeader({ state, family }) {
  return (
    <header>
      <span className="eyebrow">{familyLabels[family]}</span>
      <strong>{state.id} · {state.name}</strong>
      <StatusBadge state={state} />
    </header>
  );
}

function InspectorActions({ onOpenInspector = noop }) {
  return (
    <div className="presentation-actions presentation-inspector-actions">
      <button type="button" onClick={() => onOpenInspector("changes")}>Inspect under the hood</button>
      <button type="button" onClick={() => onOpenInspector("evidence")}>Verify evidence</button>
    </div>
  );
}

function SurfaceActions({ state, onRecord = noop, onOpenInspector = noop, primaryLabel = state.primary }) {
  return (
    <div className="presentation-actions">
      <button className="primary-button" type="button" onClick={() => onRecord(`${primaryLabel}.`)}>{primaryLabel}</button>
      {state.secondary && <button type="button" onClick={() => onRecord(`${state.secondary}.`)}>{state.secondary}</button>}
      <button type="button" onClick={() => onOpenInspector("changes")}>Inspect under the hood</button>
      <button type="button" onClick={() => onOpenInspector("evidence")}>Verify evidence</button>
    </div>
  );
}

function FactRows({ state, onOpenInspector = noop, limit = 4 }) {
  return (
    <dl>
      {state.facts.slice(0, limit).map(([label, value, source]) => (
        <div className="field-row" key={`${label}-${value}`}>
          <dt>{label}</dt>
          <dd>{value} <button type="button" onClick={() => onOpenInspector("evidence")}>{source}</button></dd>
        </div>
      ))}
    </dl>
  );
}

function GroupRows({ state, onOpenInspector = noop, limit = 5 }) {
  const items = state.groups.flatMap((group) => group.items || []).slice(0, limit);
  return (
    <div className="file-list">
      {items.map(([title, detail, status]) => (
        <div className="file-row" key={`${title}-${detail}`}>
          <span className={`mini-dot ${/pass|good|ready|stable|recorded|allowed|none/i.test(status) ? "success" : /active|progress/i.test(status) ? "active" : "warning"}`} />
          <span><strong>{title}</strong><small>{detail}</small></span>
          <span className={`status-badge ${/pass|good|ready|stable|recorded|allowed|none/i.test(status) ? "success" : /blocked|risk|gap|attention|unknown|unresolved/i.test(status) ? "warning" : ""}`}>{status}</span>
          <button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button>
        </div>
      ))}
    </div>
  );
}

function DecisionSurface({ state, onRecord, onOpenInspector }) {
  const options = [state.primary, state.secondary].filter(Boolean);
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} decision`}>
      <SurfaceHeader state={state} family="decision" />
      <div className="presentation-body">
        <FactRows state={state} onOpenInspector={onOpenInspector} limit={3} />
        <div className="callout"><strong>Pi’s current recommendation</strong><br />{state.pi}</div>
        <div className="choice-list">
          {options.map((option, index) => <button className="choice-card" type="button" key={option} onClick={() => onRecord(`${option}.`)}><strong>{option}</strong><small>{index === 0 ? "Recommended next step for the current deliverable." : "Engineer-controlled alternative; the plan remains revisable."}</small></button>)}
        </div>
        {state.decision && <div className="callout warning"><strong>Unresolved product policy</strong><br />{state.decision}</div>}
        <InspectorActions onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

function ReviewSurface({ state, onRecord, onOpenInspector }) {
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} review`}>
      <SurfaceHeader state={state} family="review" />
      <div className="presentation-body">
        <div className="metric-grid">
          {state.facts.slice(0, 3).map(([label, value]) => <div className="metric" key={label}><small>{label}</small><strong>{value}</strong></div>)}
        </div>
        <div className="callout">{state.summary}</div>
        <GroupRows state={state} onOpenInspector={onOpenInspector} />
        {state.decision && <div className="callout warning"><strong>Requires a product-owner choice</strong><br />{state.decision}</div>}
        <SurfaceActions state={state} onRecord={onRecord} onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

function ApprovalSurface({ state, onRecord, onOpenInspector }) {
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} approval`}>
      <SurfaceHeader state={state} family="approval" />
      <div className="presentation-body">
        <FactRows state={state} onOpenInspector={onOpenInspector} />
        <div className="callout warning"><strong>What this authorizes</strong><br />Only the exact current operation is represented here. The provider receipt and resulting resource identity must still be observed after the action.</div>
        <SurfaceActions state={state} onRecord={onRecord} onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

function OperationSurface({ state, onRecord, onOpenInspector }) {
  const events = state.events.length ? state.events : state.groups.flatMap((group) => group.items || []).slice(0, 4);
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} operation`}>
      <SurfaceHeader state={state} family="operation" />
      <div className="presentation-body">
        <div className="metric-grid">
          {state.facts.slice(0, 3).map(([label, value]) => <div className="metric" key={label}><small>{label}</small><strong>{value}</strong></div>)}
        </div>
        <div className="step-list">
          {events.slice(0, 5).map(([title, detail, status]) => <div className="step-row" key={`${title}-${detail}`}><span className={`mini-dot ${/pass|record|complete|observed/i.test(status) ? "success" : /active|acting|progress/i.test(status) ? "active" : "warning"}`} /><span><strong>{title}</strong><small>{detail}</small></span><button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button></div>)}
        </div>
        <div className="callout"><strong>Pi’s current interpretation</strong><br />{state.intent}</div>
        <SurfaceActions state={state} onRecord={onRecord} onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

function InterventionSurface({ state, onRecord, onOpenInspector }) {
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} intervention`}>
      <SurfaceHeader state={state} family="intervention" />
      <div className="presentation-body">
        <div className="callout warning"><strong>Pi diagnosis</strong><br />{state.pi}</div>
        <FactRows state={state} onOpenInspector={onOpenInspector} />
        <GroupRows state={state} onOpenInspector={onOpenInspector} limit={4} />
        {state.decision && <div className="callout warning"><strong>Still unresolved</strong><br />{state.decision}</div>}
        <SurfaceActions state={state} onRecord={onRecord} onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

function OutcomeSurface({ state, onRecord, onOpenInspector }) {
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} outcome`}>
      <SurfaceHeader state={state} family="outcome" />
      <div className="presentation-body">
        <div className="metric-grid">
          {state.facts.slice(0, 3).map(([label, value]) => <div className="metric" key={label}><small>{label}</small><strong>{value}</strong></div>)}
        </div>
        <GroupRows state={state} onOpenInspector={onOpenInspector} limit={5} />
        <div className="callout"><strong>What this result means</strong><br />{state.summary}</div>
        {state.decision && <div className="callout warning"><strong>Explicit caveat</strong><br />{state.decision}</div>}
        <SurfaceActions state={state} onRecord={onRecord} onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

function HandoffSurface({ state, onRecord, onOpenInspector }) {
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} coding handoff`}>
      <SurfaceHeader state={state} family="handoff" />
      <div className="presentation-body">
        <FactRows state={state} onOpenInspector={onOpenInspector} />
        <span className="eyebrow">Returned work and independent checks</span>
        <GroupRows state={state} onOpenInspector={onOpenInspector} />
        <div className="callout">Server Guy keeps coding-agent output, repository CI, and its own Application Contract checks as separate evidence sources.</div>
        <SurfaceActions state={state} onRecord={onRecord} onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

function EvidenceSurface({ state, onRecord, onOpenInspector }) {
  return (
    <section className="presentation v2-task-surface" aria-label={`${state.name} evidence`}>
      <SurfaceHeader state={state} family="evidence" />
      <div className="presentation-body">
        <FactRows state={state} onOpenInspector={onOpenInspector} />
        <GroupRows state={state} onOpenInspector={onOpenInspector} limit={6} />
        <div className="callout">Authoritative observations remain distinct from Pi-authored interpretation. Every claim can be opened at its source and re-verified.</div>
        <SurfaceActions state={state} onRecord={onRecord} onOpenInspector={onOpenInspector} />
      </div>
    </section>
  );
}

const surfaces = {
  decision: DecisionSurface,
  review: ReviewSurface,
  approval: ApprovalSurface,
  operation: OperationSurface,
  intervention: InterventionSurface,
  outcome: OutcomeSurface,
  handoff: HandoffSurface,
  evidence: EvidenceSurface,
};

export function TaskSurface({ family, ...props }) {
  const Surface = surfaces[family] || ReviewSurface;
  return <Surface {...props} />;
}
