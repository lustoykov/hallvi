import { useEffect, useMemo, useState } from "react";
import { gateProgressByState, journeyStates, phases, statesByPhase } from "./journeyStates.js";

const initialId = window.location.hash.replace("#", "");
const initialIndex = Math.max(0, journeyStates.findIndex((item) => item.id === initialId));

const starterSessions = [
  { id: "launch", title: "Launch northstar.dev", detail: "Primary launch chat", archived: false },
  { id: "cost", title: "Cost and ownership", detail: "2 decisions recorded", archived: false },
  { id: "domain", title: "Domain options", detail: "Archived yesterday", archived: true },
];

const starterMessages = {
  launch: [],
  cost: [
    { actor: "Pi", text: "I can use the shared Launch Brief while we examine the cost boundary here. Any decision we make will be reflected in the same Operator Record." },
    { actor: "You", text: "Prefer the smallest credible host, but treat database durability as non-negotiable.", recorded: true },
  ],
  domain: [
    { actor: "Pi", text: "We compared using an existing domain with acquiring a new one. The recorded decision is to use northstar.dev and keep the registrar outside Cloudflare." },
  ],
};

function statusClass(value = "") {
  const text = value.toLowerCase();
  if (/(complete|verified|operational|ready|passed|good)/.test(text)) return "positive";
  if (/(blocked|failed|danger|forbidden)/.test(text)) return "danger";
  if (/(waiting|warning|attention|approval|review|input|workshop|reachable|risk|gap)/.test(text)) return "warning";
  if (/(locked|none|pending|not started|paused|required)/.test(text)) return "neutral";
  return "progress";
}

function AppSidebar({ sessions, activeSessionId, showArchived, onToggleArchived, onNewSession, onSelectSession }) {
  const visibleSessions = sessions.filter((session) => session.archived === showArchived);
  return (
    <aside className="app-sidebar" aria-label="Applications and chats">
      <div className="brand"><span className="brand-mark">SG</span><strong>Server Guy</strong></div>
      <div className="sidebar-section-label"><span>Applications</span><button type="button">Add</button></div>
      <div className="application-list">
        <button className="application-item selected" type="button"><span className="app-avatar navy">N</span><span><strong>northstar</strong><small><i className="dot blue" />Launch in progress</small></span></button>
        <button className="application-item compact-app" type="button"><span className="app-avatar teal">M</span><span><strong>meadowlark</strong><small><i className="dot gray" />Idle</small></span></button>
      </div>
      <section className="session-list" aria-label="Operator Sessions">
        <div className="sidebar-section-label session-label"><span>{showArchived ? "Archived chats" : "Chats"}</span><button type="button" onClick={onNewSession}>New</button></div>
        <div className="session-items">
          {visibleSessions.map((session) => (
            <button key={session.id} type="button" className={`session-item ${session.id === activeSessionId ? "selected" : ""}`} onClick={() => onSelectSession(session.id)}>
              <strong>{session.title}</strong><small>{session.detail}</small>
            </button>
          ))}
          {!visibleSessions.length && <p className="empty-sessions">No {showArchived ? "archived" : "active"} chats.</p>}
        </div>
        <button className="archive-toggle" type="button" onClick={onToggleArchived}>{showArchived ? "Back to active chats" : `Archived · ${sessions.filter((session) => session.archived).length}`}</button>
      </section>
      <div className="sidebar-spacer" />
      <nav className="secondary-nav" aria-label="Workspace navigation"><button type="button">Credentials</button><button type="button">Integrations</button><button type="button">Audit log</button></nav>
      <div className="agent-presence"><i className="dot green" /><span>Pi agent active</span></div>
    </aside>
  );
}

function StoryboardBar({ current, index, setIndex }) {
  const phaseStates = statesByPhase[current.phase];
  return (
    <div className="storyboard-bar">
      <div className="storyboard-title"><span>Journey 01 UI storyboard</span><strong>{journeyStates.length} source-mapped states</strong></div>
      <div className="storyboard-controls">
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
        <label><span>Phase</span><select value={current.phase} onChange={(event) => setIndex(journeyStates.indexOf(statesByPhase[Number(event.target.value)][0]))}>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.id}. {phase.name}</option>)}</select></label>
        <label className="state-select"><span>Mockup state</span><select value={current.id} onChange={(event) => setIndex(journeyStates.findIndex((item) => item.id === event.target.value))}>{phaseStates.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select></label>
        <span className="state-counter">{index + 1} / {journeyStates.length}</span>
        <button type="button" disabled={index === journeyStates.length - 1} onClick={() => setIndex(index + 1)}>Next</button>
      </div>
    </div>
  );
}

function ApplicationHeader({ current, approvalMode, setApprovalMode }) {
  return (
    <header className="application-header">
      <div className="application-identity"><span className="large-avatar">N</span><div><h1>northstar</h1><p>Production · <strong>Application Launch</strong></p></div></div>
      <div className="header-controls">
        <label><span>Approval Mode</span><select value={approvalMode} onChange={(event) => setApprovalMode(event.target.value)}><option>Pi Decides</option><option>Full Autonomy</option><option>Always Ask</option></select></label>
        <div className="health-control"><span>Application status</span><strong><i className={`dot ${current.tone === "success" ? "green" : "blue"}`} />{current.status}</strong></div>
      </div>
    </header>
  );
}

function LaunchMap({ current, phase, gateProgress, setIndex }) {
  return (
    <section className="launch-map" aria-label="Current position in Application Launch">
      <div className="map-position">
        <span>You are here</span><strong>Phase {current.phase} · {phase.name}</strong>
        <div className="map-deliverable"><em>Working toward</em><b>{phase.deliverable}</b><i>{gateProgress}/3 checks</i></div>
      </div>
      <nav className="phase-rail" aria-label="Application Launch phases">
        {phases.map((item) => {
          const active = item.id === current.phase;
          const completed = item.id < current.phase;
          return <button key={item.id} type="button" title={`${item.deliverable}: ${item.outcome}`} className={`${active ? "active" : ""} ${completed ? "completed" : ""}`} onClick={() => setIndex(journeyStates.indexOf(statesByPhase[item.id][0]))}><span>{item.id}</span><small>{item.short}</small></button>;
        })}
      </nav>
    </section>
  );
}

function ChatMessage({ actor, text, recorded }) {
  const pi = actor === "Pi";
  return (
    <div className={`message ${pi ? "pi-message" : "user-message"}`}>
      <div className="speaker"><span className={pi ? "pi-avatar" : "user-avatar"}>{actor}</span><strong>{actor}</strong><time>just now</time></div>
      <p>{text}</p>
      {recorded && <div className="inline-receipt"><strong>Recorded in Operator Record</strong><span>Shared across chats · review on the right</span></div>}
    </div>
  );
}

function ChatPanel({ current, phase, session, messages, records, onSubmit, onEvidence, onReviewEvidence, onArchive, onRestore, onNext, phaseAdvanceBlocked }) {
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(""), [current.id, session.id]);
  function submit(event) { event.preventDefault(); const text = draft.trim(); if (!text) return; onSubmit(text); setDraft(""); }
  const isLaunchSession = session.id === "launch";
  return (
    <main className="chat-panel" aria-label="Chat with Pi">
      <div className="chat-header">
        <div><span>{session.title}</span><small>Chat with Pi · Primary collaboration surface</small></div>
        <div className="chat-header-actions"><button type="button" onClick={onEvidence}>Evidence</button><button type="button" onClick={session.archived ? onRestore : onArchive}>{session.archived ? "Restore" : "Archive"}</button></div>
      </div>
      <div className="chat-scroll">
        <div className="chat-stage-label"><strong>{current.name}</strong><em className={statusClass(current.status)}>{current.status}</em></div>
        <section className="intent-card"><span>Pi is working toward · {phase.deliverable}</span><p>{current.intent}</p></section>
        {isLaunchSession && <ChatMessage actor="Pi" text={current.pi} />}
        {isLaunchSession && current.question && <ChatMessage actor="You" text={current.question} recorded={!/[?？]\s*$/.test(current.question) && records.length > 0} />}
        {!isLaunchSession && !messages.length && <ChatMessage actor="Pi" text={`This chat shares northstar's Operator Record. I can help with a focused question while the launch continues toward the ${phase.deliverable}.`} />}
        <section className="activity-block"><div className="activity-label"><span>Live activity toward {phase.deliverable}</span><small>Evidence-backed</small></div>{current.events.map((event) => {
          const [title, detail, status] = event;
          return <button className="activity-event" key={`${title}-${detail}`} type="button" onClick={() => onReviewEvidence(event, `${phase.deliverable} activity`)}><span className={`event-marker ${statusClass(status)}`} /><span><strong>{title}</strong><small>{detail}</small></span><em className={statusClass(status)}>Verify · {status}</em></button>;
        })}</section>
        <div className="chat-primary-action"><button type="button" disabled={phaseAdvanceBlocked} onClick={onNext}>{phaseAdvanceBlocked ? "Complete the exit checks first" : current.primary}</button></div>
        {messages.map((message, messageIndex) => <ChatMessage key={`${message.actor}-${messageIndex}`} {...message} />)}
        <div className="quick-actions">{current.quickActions.map((label) => <button type="button" key={label}>{label}</button>)}</div>
      </div>
      <form className="composer" onSubmit={submit}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Tell Pi a decision, correct it, or ask a question…" aria-label="Message Pi" /><div><span>Decisions are shared in the Operator Record.</span><button type="submit" className="send-button">Send</button></div></form>
    </main>
  );
}

function RecordRow({ label, value, meta, onReview }) {
  return <div className="record-row"><div><span>{label}</span><strong>{value}</strong></div><div className="record-row-actions"><em>{meta}</em>{onReview && <button type="button" className="control-link" onClick={onReview}>Review</button>}</div></div>;
}

function PhaseContract({ phase, gateProgress, current, onReviewDeliverable, onReviewGate }) {
  return (
    <section className="phase-contract-card">
      <div className="deliverable-heading"><div><span>Phase deliverable</span><strong>{phase.deliverable}</strong></div><div className="deliverable-actions"><button type="button" className="control-link" onClick={onReviewDeliverable}>What is this?</button><em>{gateProgress}/{phase.gate.length} passed</em></div></div>
      <p>{phase.outcome}</p>
      <div className="gate-heading"><span>Exit Gate</span><i><b style={{ width: `${(gateProgress / phase.gate.length) * 100}%` }} /></i></div>
      <div className="gate-list">{phase.gate.map((check, checkIndex) => {
        const passed = checkIndex < gateProgress;
        const currentBlocker = checkIndex === gateProgress && gateProgress < phase.gate.length;
        const markerState = passed ? "passed" : currentBlocker ? current.status : "required";
        return <div key={check} className={`gate-item ${passed ? "passed" : ""}`}><span>{passed ? "Passed" : currentBlocker ? "Current" : "Required"}</span><strong>{check}</strong><button type="button" className="control-link" onClick={() => onReviewGate({ check, checkIndex, passed, currentBlocker })}>Review</button><em className={statusClass(markerState)}>{passed ? "pass" : currentBlocker ? "now" : "next"}</em></div>;
      })}</div>
    </section>
  );
}

function OperatorRecord({ current, phase, records, gateProgress, onEvidence, onReviewDeliverable, onReviewGate, onReviewDecision }) {
  return (
    <aside className="operator-record" aria-label="Operator Record">
      <div className="record-header"><div><span>Operator Record</span><small>Shared across chats · reflected from decisions + evidence</small></div><button type="button" onClick={onEvidence}>View current state</button></div>
      <div className="record-scroll">
        <PhaseContract phase={phase} gateProgress={gateProgress} current={current} onReviewDeliverable={onReviewDeliverable} onReviewGate={onReviewGate} />
        {current.decision && <div className="decision-banner"><div><strong>Workshop choice unresolved</strong><button type="button" className="control-link" onClick={() => onReviewDecision({ label: "Workshop choice", value: current.decision, meta: "Product workshop" })}>Review</button></div><p>{current.decision}</p></div>}
        <section className="record-section">
          <div className="record-section-title"><h3>Decisions from chat</h3><span>{records.length}</span></div>
          {records.length ? records.map((record, recordIndex) => <RecordRow key={`${record.label}-${recordIndex}`} {...record} onReview={() => onReviewDecision(record)} />) : <p className="empty-record">No decisions have been recorded from any chat yet.</p>}
        </section>
      </div>
    </aside>
  );
}

function EvidenceRow({ event, parentTitle, onReviewEvidence }) {
  const [title, detail, status] = event;
  return (
    <div className="drawer-event">
      <div className="drawer-event-copy"><strong>{title}</strong><p>{detail}</p></div>
      <div className="drawer-event-actions"><button type="button" className="control-link" onClick={() => onReviewEvidence(event, parentTitle)}>Verify</button><span className={`mini-status ${statusClass(status)}`}>{status}</span></div>
    </div>
  );
}

function StateDrawer({ current, phase, gateProgress, onClose, onReviewFact, onReviewEvidence }) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="evidence-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Current application state">
        <div className="drawer-header"><div><span>Current application state</span><strong>{current.name} · {current.status}</strong></div><button type="button" onClick={onClose}>Close</button></div>
        <section><span className="drawer-label">Phase contract</span><p><strong>{phase.deliverable}</strong> · Exit Gate {gateProgress}/{phase.gate.length} passed.</p></section>
        <section><span className="drawer-label">Specification source</span><p>{current.source}</p></section>
        <section><span className="drawer-label">All facts and provenance</span>{current.facts.map(([label, value, provenance]) => <RecordRow key={`${label}-${value}`} label={label} value={value} meta={provenance} onReview={() => onReviewFact({ label, value, provenance })} />)}</section>
        <section><span className="drawer-label">Authoritative observations</span>{current.events.map((event) => <EvidenceRow key={`${event[0]}-${event[1]}`} event={event} parentTitle={`${current.name} current state`} onReviewEvidence={onReviewEvidence} />)}</section>
        <section><span className="drawer-label">Record rule</span><p>Pi's prose is collaboration. Decisions and facts become durable only when they are reflected into the shared Operator Record with provenance and, where required, supporting evidence.</p></section>
        {current.decision && <section className="drawer-decision"><span className="drawer-label">Workshop boundary</span><p>{current.decision}</p></section>}
      </aside>
    </div>
  );
}

function ControlDrawer({ control, onClose, onAskPi, onReviewEvidence }) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [rerunState, setRerunState] = useState("idle");

  useEffect(() => {
    setSourceOpen(false);
    setTakeoverOpen(false);
    setRawOpen(false);
    setRerunState("idle");
  }, [control.key]);

  function rerun() {
    if (rerunState === "running") return;
    setRerunState("running");
    window.setTimeout(() => setRerunState("complete"), 650);
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="evidence-drawer control-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={`Review ${control.title}`}>
        <div className="drawer-header"><div><span>{control.kind}</span><strong>{control.title}</strong></div><button type="button" onClick={onClose}>Close</button></div>
        <section className="control-summary"><span className="drawer-label">What this means</span><p>{control.description}</p></section>
        <section><span className="drawer-label">Current result</span><div className="control-result"><strong>{control.status}</strong><span className={`mini-status ${statusClass(control.statusLabel)}`}>{control.statusLabel}</span></div><p>{control.impact}</p></section>
        <section><span className="drawer-label">Source and provenance</span><button type="button" className="source-link" onClick={() => setSourceOpen((value) => !value)}>{control.source}<span>{sourceOpen ? "Hide" : "Open"}</span></button>{sourceOpen && <div className="source-detail"><strong>Product definition</strong><code>{control.sourcePath}</code><p>This is the rule Server Guy is applying. The current result still comes from the cited application or provider source—not from this document alone.</p></div>}</section>
        {control.evidenceDetails && <section className="evidence-reference-section"><span className="drawer-label">Evidence behind this result</span><dl className="evidence-metadata"><div><dt>Observed by</dt><dd>{control.evidenceDetails.source}</dd></div><div><dt>Observed at</dt><dd>{control.evidenceDetails.observedAt}</dd></div><div><dt>Method</dt><dd>{control.evidenceDetails.method}</dd></div><div><dt>Raw result</dt><dd>{control.evidenceDetails.rawResult}</dd></div></dl><button type="button" className="source-link evidence-artifact-link" onClick={() => setRawOpen((value) => !value)}><span className="source-link-copy"><small>Captured artifact</small><strong>{control.evidenceDetails.artifactId}</strong></span><span>{rawOpen ? "Hide raw" : "Open raw"}</span></button>{rawOpen && <pre className="raw-evidence">{control.evidenceDetails.rawEvidence}</pre>}<p className="evidence-scope">This evidence supports <strong>{control.evidenceDetails.parentTitle}</strong>. It establishes only what this observation measured at the recorded time.</p></section>}
        {control.evidence.length > 0 && <section><span className="drawer-label">Evidence used now</span>{control.evidence.map((event) => <EvidenceRow key={`${event[0]}-${event[1]}`} event={event} parentTitle={control.title} onReviewEvidence={onReviewEvidence} />)}</section>}
        <section className="control-path-section"><span className="drawer-label">Choose your level of control</span><button type="button" className="control-path primary-path" onClick={() => onAskPi(control)}><strong>Ask Pi to handle it</strong><small>Pi explains, investigates, and proposes or performs the next permitted action.</small></button><button type="button" className="control-path" onClick={() => setTakeoverOpen((value) => !value)}><strong>Take control</strong><small>Inspect and change the underlying source yourself or with another coding agent.</small></button>{takeoverOpen && <div className="takeover-detail"><span>Change this source</span><strong>{control.takeover}</strong><ol><li>Open the source and make the change.</li><li>Return here when the source is ready.</li><li>Re-run verification; do not override the result.</li></ol></div>}</section>
        <section className="rerun-section"><span className="drawer-label">Verify the current source</span><p>{control.rerunHelp}</p><button type="button" className="rerun-button" onClick={rerun} disabled={rerunState === "running"}>{rerunState === "running" ? "Checking current source…" : "Re-run verification"}</button><div className={`rerun-result ${rerunState}`} aria-live="polite">{rerunState === "idle" && "No manual status override is available."}{rerunState === "running" && "Reading the current source and collecting fresh evidence."}{rerunState === "complete" && `Rechecked just now. Result remains “${control.status}” until the underlying source or evidence changes.`}</div></section>
      </aside>
    </div>
  );
}

function deliverableControl(phase, gateProgress, current) {
  return {
    key: `deliverable-${phase.id}`,
    kind: "Phase Deliverable",
    title: phase.deliverable,
    status: `${gateProgress}/${phase.gate.length} checks passed`,
    statusLabel: "in progress",
    description: phase.meaning,
    impact: `${phase.outcome} The launch moves forward only when its Exit Gate is supported by current evidence.`,
    source: phase.source,
    sourcePath: "docs/user-journeys/01-application-launch.md#user-journey",
    takeover: phase.takeover,
    evidence: current.events,
    rerunHelp: "Refresh all checks for this deliverable from their current sources and evidence.",
    askPrompt: `Help me understand and complete the ${phase.deliverable}. Show me what remains and handle what you can.`,
  };
}

function gateControl(phase, current, gateProgress, { check, checkIndex, passed, currentBlocker }) {
  const status = passed ? "Passed" : currentBlocker ? current.status : "Required";
  return {
    key: `gate-${phase.id}-${checkIndex}`,
    kind: "Gate Check",
    title: check,
    status,
    statusLabel: passed ? "pass" : currentBlocker ? "current" : "next",
    description: `This is one observable condition required for the ${phase.deliverable}. It is computed from the underlying source and evidence; it is not a user decision or a checkbox.`,
    impact: passed ? "Current evidence supports this condition. A material source change can make it stale and trigger re-verification." : currentBlocker ? "This is the condition currently limiting progress in this phase." : `This condition becomes current after the preceding ${gateProgress === 0 ? "work" : "checks"} are resolved.`,
    source: `${phase.source} · Exit Gate`,
    sourcePath: "docs/user-journeys/01-application-launch-ui-map.md#phase-deliverables-and-exit-gates",
    takeover: phase.takeover,
    evidence: current.events,
    rerunHelp: "Run this Gate Check again against the current repository, configuration, provider state, and observations that apply.",
    askPrompt: `Investigate the Gate Check “${check}”. Explain what is missing, then resolve or propose the smallest credible change.`,
  };
}

function decisionControl(record, phase) {
  return {
    key: `decision-${record.label}-${record.value}`,
    kind: "Decision Record",
    title: record.label,
    status: record.value,
    statusLabel: "recorded",
    description: "This is a durable, revisable choice or constraint recognized from chat. It is shared across Operator Sessions, but it is not a Gate Check or permanent permission.",
    impact: `This decision currently informs work toward the ${phase.deliverable}. Changing it may invalidate dependent checks or plans.`,
    source: record.meta,
    sourcePath: "Originating Operator Session and shared Operator Record",
    takeover: `${record.meta}; revise the decision and review any affected launch checks`,
    evidence: [],
    rerunHelp: "After revising the decision, re-evaluate the checks and plans that depend on it.",
    askPrompt: `Review the recorded decision “${record.label}: ${record.value}”. Explain its impact and help me revise it if needed.`,
  };
}

function factControl(fact, phase, current) {
  return {
    key: `fact-${fact.label}-${fact.value}`,
    kind: "Operational Fact",
    title: fact.label,
    status: fact.value,
    statusLabel: "current",
    description: "This value is reflected into the Operator Record from a cited repository, provider, user, or observation source. The displayed value is not independently editable.",
    impact: `Pi may use this fact while working toward the ${phase.deliverable}; changing its source can alter downstream plans and checks.`,
    source: fact.provenance,
    sourcePath: current.source,
    takeover: `The authoritative ${fact.provenance} source for “${fact.label}”`,
    evidence: current.events,
    rerunHelp: "Refresh this fact from its authoritative source and update any dependent checks.",
    askPrompt: `Investigate the current fact “${fact.label}: ${fact.value}” and reconcile it with its ${fact.provenance} source.`,
  };
}

function observationDetails(event, current) {
  const [title, detail, status] = event;
  const normalized = title.toLowerCase();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const details = {
    source: "Server Guy activity collector",
    observedAt: "30 Aug 2026 · 16:58:42 EEST",
    method: `Captured during ${current.id} · ${current.name}`,
    rawResult: `${detail} · ${status}`,
    artifactId: `evidence://${current.id.toLowerCase()}/${slug}`,
  };

  if (normalized.includes("sentinel")) {
    Object.assign(details, {
      source: "Sentinel · external public probe",
      method: "HTTPS GET /api/health through northstar.dev from outside the VPS",
      rawResult: "HTTP 200 · 184 ms · body matched {\"status\":\"ok\"} · release 8c14d72",
      artifactId: "observation://sentinel/northstar/obs_01J8M7N4Q9",
    });
  } else if (normalized.includes("launch") && normalized.includes("completed")) {
    Object.assign(details, {
      source: "Server Guy · launch completion receipt",
      method: "Assembled from the current Release, Domain Route, and Operations Handoff records",
      rawResult: "Release 8c14d72 · Domain Route verified · Operations Handoff assembled",
      artifactId: "receipt://launch/northstar/launch_01J8M7H2A7",
    });
  } else if (/(repository|revision|github|pull request)/.test(normalized)) {
    details.source = "GitHub · repository observation";
  } else if (/(hetzner|server|host|vps)/.test(normalized)) {
    details.source = "Hetzner · provider response";
  } else if (/(domain|dns|https|hostname)/.test(normalized)) {
    details.source = "External DNS and HTTPS observation";
  }

  return {
    ...details,
    rawEvidence: JSON.stringify({
      artifact: details.artifactId,
      source: details.source,
      observed_at: "2026-08-30T16:58:42+03:00",
      method: details.method,
      result: details.rawResult,
      status,
    }, null, 2),
  };
}

function evidenceControl(event, current, parentTitle) {
  const [title, detail, status] = event;
  const details = observationDetails(event, current);
  const isSentinel = title.toLowerCase().includes("sentinel");
  return {
    key: `evidence-${current.id}-${title}-${parentTitle}`,
    kind: "Evidence Reference",
    title,
    status: detail,
    statusLabel: status,
    description: isSentinel ? "A Sentinel observation is one external probe result at a specific time. A passed probe means the public health endpoint answered as expected for that check; it does not promise future health." : "This is a source-attributed Observation captured during the current journey state. It records what a named source returned at a specific time and supports only the cited claim.",
    impact: `This Observation is cited by “${parentTitle}”. Its source, collection method, timestamp, and raw result remain independently inspectable below.`,
    source: "Journey 01 · Operational Claims and Evidence References",
    sourcePath: "docs/user-journeys/01-application-launch-ui-map.md#claim-to-evidence-behavior",
    takeover: details.source,
    evidence: [],
    evidenceDetails: { ...details, parentTitle },
    rerunHelp: "Collect a fresh Observation from the same source. The new result is appended; the historical artifact remains unchanged.",
    askPrompt: `Explain the Observation “${title}: ${detail}”, inspect its raw evidence, and tell me exactly what it does and does not establish.`,
  };
}

function initialChatRecords(current) {
  return current.facts.filter(([, , provenance]) => /(user|engineer)/i.test(provenance)).map(([label, value]) => ({ label, value, meta: "From chat" }));
}

export function App() {
  const [index, setIndex] = useState(initialIndex);
  const [approvalMode, setApprovalMode] = useState("Pi Decides");
  const [drawer, setDrawer] = useState(null);
  const [sessions, setSessions] = useState(starterSessions);
  const [activeSessionId, setActiveSessionId] = useState("launch");
  const [showArchived, setShowArchived] = useState(false);
  const [messagesBySession, setMessagesBySession] = useState(starterMessages);
  const [applicationDecisions, setApplicationDecisions] = useState([]);
  const current = journeyStates[index];
  const phase = phases[current.phase - 1];
  const gateProgress = gateProgressByState[current.id] ?? 0;
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0];
  const messages = messagesBySession[activeSession.id] || [];
  const records = useMemo(() => [...initialChatRecords(current), ...applicationDecisions], [current, applicationDecisions]);
  const nextState = journeyStates[index + 1];
  const phaseAdvanceBlocked = Boolean(nextState && nextState.phase > current.phase && gateProgress < phase.gate.length);

  useEffect(() => {
    window.history.replaceState(null, "", `#${current.id}`);
    document.title = `${current.id} · ${current.name} · Server Guy`;
    setDrawer(null);
  }, [current]);

  function submitChat(text) {
    const isDecision = !/[?？]\s*$/.test(text);
    setMessagesBySession((all) => ({ ...all, [activeSession.id]: [...(all[activeSession.id] || []), { actor: "You", text, recorded: isDecision }, { actor: "Pi", text: isDecision ? "I recorded that in the shared Operator Record so it remains visible from every chat." : "I treated that as a question, so I did not change the Operator Record. This storyboard does not simulate the full answer." }] }));
    if (isDecision) setApplicationDecisions((items) => [...items, { label: "Chat decision", value: text, meta: `From ${activeSession.title}` }]);
  }

  function askPiToHandle(control) {
    setMessagesBySession((all) => ({
      ...all,
      [activeSession.id]: [
        ...(all[activeSession.id] || []),
        { actor: "You", text: control.askPrompt },
        { actor: "Pi", text: `I’ll work from the cited source for “${control.title}”, show the evidence I use, and keep the result open for your review. I will not manually override a Gate Check.` },
      ],
    }));
    setDrawer(null);
  }

  function openDeliverableControl() {
    setDrawer({ type: "control", control: deliverableControl(phase, gateProgress, current) });
  }

  function openGateControl(gate) {
    setDrawer({ type: "control", control: gateControl(phase, current, gateProgress, gate) });
  }

  function openDecisionControl(record) {
    setDrawer({ type: "control", control: decisionControl(record, phase) });
  }

  function openFactControl(fact) {
    setDrawer({ type: "control", control: factControl(fact, phase, current) });
  }

  function openEvidenceControl(event, parentTitle) {
    setDrawer({ type: "control", control: evidenceControl(event, current, parentTitle) });
  }

  function newSession() {
    const id = `chat-${sessions.length + 1}`;
    const session = { id, title: "New chat", detail: `Started during Phase ${current.phase}`, archived: false };
    setSessions((items) => [...items, session]);
    setMessagesBySession((all) => ({ ...all, [id]: [] }));
    setActiveSessionId(id);
    setShowArchived(false);
  }

  function archiveActiveSession() {
    const nextActive = sessions.find((session) => !session.archived && session.id !== activeSession.id);
    if (nextActive) {
      setSessions((items) => items.map((session) => session.id === activeSession.id ? { ...session, archived: true, detail: "Archived just now" } : session));
      setActiveSessionId(nextActive.id);
      return;
    }
    const replacementId = `chat-${sessions.length + 1}`;
    setSessions((items) => [...items.map((session) => session.id === activeSession.id ? { ...session, archived: true, detail: "Archived just now" } : session), { id: replacementId, title: "New chat", detail: `Started during Phase ${current.phase}`, archived: false }]);
    setMessagesBySession((all) => ({ ...all, [replacementId]: [] }));
    setActiveSessionId(replacementId);
  }

  function restoreActiveSession() {
    setSessions((items) => items.map((session) => session.id === activeSession.id ? { ...session, archived: false, detail: `Resumed during Phase ${current.phase}` } : session));
    setShowArchived(false);
  }

  function advance() {
    if (phaseAdvanceBlocked || index >= journeyStates.length - 1) return;
    setIndex(index + 1);
  }

  return (
    <div className="prototype-shell">
      <StoryboardBar current={current} index={index} setIndex={setIndex} />
      <div className="product-frame">
        <AppSidebar sessions={sessions} activeSessionId={activeSession.id} showArchived={showArchived} onToggleArchived={() => setShowArchived((value) => !value)} onNewSession={newSession} onSelectSession={setActiveSessionId} />
        <div className="workspace">
          <ApplicationHeader current={current} approvalMode={approvalMode} setApprovalMode={setApprovalMode} />
          <LaunchMap current={current} phase={phase} gateProgress={gateProgress} setIndex={setIndex} />
          <div className="workspace-body">
            <ChatPanel current={current} phase={phase} session={activeSession} messages={messages} records={records} onSubmit={submitChat} onEvidence={() => setDrawer({ type: "state" })} onReviewEvidence={openEvidenceControl} onArchive={archiveActiveSession} onRestore={restoreActiveSession} onNext={advance} phaseAdvanceBlocked={phaseAdvanceBlocked} />
            <OperatorRecord current={current} phase={phase} records={records} gateProgress={gateProgress} onEvidence={() => setDrawer({ type: "state" })} onReviewDeliverable={openDeliverableControl} onReviewGate={openGateControl} onReviewDecision={openDecisionControl} />
          </div>
        </div>
      </div>
      {drawer?.type === "state" && <StateDrawer current={current} phase={phase} gateProgress={gateProgress} onClose={() => setDrawer(null)} onReviewFact={openFactControl} onReviewEvidence={openEvidenceControl} />}
      {drawer?.type === "control" && <ControlDrawer control={drawer.control} onClose={() => setDrawer(null)} onAskPi={askPiToHandle} onReviewEvidence={openEvidenceControl} />}
    </div>
  );
}
