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
        <div className="health-control"><span>Current state</span><strong><i className={`dot ${current.tone === "success" ? "green" : "blue"}`} />{current.status}</strong></div>
      </div>
    </header>
  );
}

function LaunchMap({ current, phase, phasePosition, gateProgress, setIndex }) {
  return (
    <section className="launch-map" aria-label="Current position in Application Launch">
      <div className="map-position">
        <span>You are here</span><strong>Phase {current.phase} of 9 · {phase.name}</strong><small>{current.id} · {current.name} · state {phasePosition}</small>
        <div className="map-deliverable"><em>Working toward</em><b>{phase.deliverable}</b><i>{gateProgress}/3 exit checks</i></div>
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

function ChatPanel({ current, phase, session, messages, records, onSubmit, onEvidence, onArchive, onRestore }) {
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
        <div className="chat-stage-label"><span>{current.id}</span><strong>{current.name}</strong><em className={statusClass(current.status)}>{current.status}</em></div>
        <section className="intent-card"><span>Pi is working toward · {phase.deliverable}</span><p>{current.intent}</p></section>
        {isLaunchSession && <ChatMessage actor="Pi" text={current.pi} />}
        {isLaunchSession && current.question && <ChatMessage actor="You" text={current.question} recorded={!/[?？]\s*$/.test(current.question) && records.length > 0} />}
        {!isLaunchSession && !messages.length && <ChatMessage actor="Pi" text={`This chat shares northstar's Operator Record. I can help with a focused question while the launch continues toward the ${phase.deliverable}.`} />}
        <section className="activity-block"><div className="activity-label"><span>Live activity toward {phase.deliverable}</span><small>Evidence-backed</small></div>{current.events.map(([title, detail, status]) => <button className="activity-event" key={`${title}-${detail}`} type="button" onClick={onEvidence}><span className={`event-marker ${statusClass(status)}`} /><span><strong>{title}</strong><small>{detail}</small></span><em className={statusClass(status)}>{status}</em></button>)}</section>
        {messages.map((message, messageIndex) => <ChatMessage key={`${message.actor}-${messageIndex}`} {...message} />)}
        <div className="quick-actions">{current.quickActions.map((label) => <button type="button" key={label}>{label}</button>)}</div>
      </div>
      <form className="composer" onSubmit={submit}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Tell Pi a decision, correct it, or ask a question…" aria-label="Message Pi" /><div><span>Decisions are shared in the Operator Record.</span><button type="submit" className="send-button">Send</button></div></form>
    </main>
  );
}

function RecordRow({ label, value, meta }) {
  return <div className="record-row"><div><span>{label}</span><strong>{value}</strong></div><em>{meta}</em></div>;
}

function PhaseContract({ phase, gateProgress, current }) {
  return (
    <section className="phase-contract-card">
      <div className="deliverable-heading"><div><span>Phase deliverable</span><strong>{phase.deliverable}</strong></div><em>{gateProgress}/3 passed</em></div>
      <p>{phase.outcome}</p>
      <div className="gate-heading"><span>Exit Gate</span><i><b style={{ width: `${(gateProgress / phase.gate.length) * 100}%` }} /></i></div>
      <div className="gate-list">{phase.gate.map((check, checkIndex) => {
        const passed = checkIndex < gateProgress;
        const currentBlocker = checkIndex === gateProgress && gateProgress < phase.gate.length;
        const markerState = passed ? "passed" : currentBlocker ? current.status : "required";
        return <div key={check} className={`gate-item ${passed ? "passed" : ""}`}><span>{passed ? "Passed" : currentBlocker ? "Current" : "Required"}</span><strong>{check}</strong><em className={statusClass(markerState)}>{passed ? "pass" : currentBlocker ? "now" : "next"}</em></div>;
      })}</div>
    </section>
  );
}

function OperatorRecord({ current, phase, records, phasePosition, gateProgress, onNext, onEvidence, phaseAdvanceBlocked }) {
  const groupItems = current.groups.flatMap((group) => group.items.map((item) => ({ group: group.title, item }))).slice(0, 4);
  return (
    <aside className="operator-record" aria-label="Operator Record">
      <div className="record-header"><div><span>Operator Record</span><small>Shared across chats · reflected from decisions + evidence</small></div><button type="button" onClick={onEvidence}>Full detail</button></div>
      <div className="record-scroll">
        <section className="position-card"><span>Current position</span><strong>{current.id} · {current.name}</strong><small>Phase {current.phase} of 9 · state {phasePosition}</small><div><i style={{ width: `${(current.phase / 9) * 100}%` }} /></div></section>
        <PhaseContract phase={phase} gateProgress={gateProgress} current={current} />
        {current.decision && <div className="decision-banner"><strong>Workshop choice unresolved</strong><p>{current.decision}</p></div>}
        <section className="record-section">
          <div className="record-section-title"><h3>Decisions from chat</h3><span>{records.length}</span></div>
          {records.length ? records.map((record, recordIndex) => <RecordRow key={`${record.label}-${recordIndex}`} {...record} />) : <p className="empty-record">No decisions have been recorded from any chat yet.</p>}
        </section>
        <section className="record-section">
          <div className="record-section-title"><h3>Current structured state</h3><span>{current.facts.length}</span></div>
          {current.facts.slice(0, 4).map(([label, value, provenance]) => <RecordRow key={`${label}-${value}`} label={label} value={value} meta={provenance} />)}
        </section>
        <section className="record-section compact-section">
          <div className="record-section-title"><h3>What matters now</h3><span>{groupItems.length}</span></div>
          {groupItems.map(({ group, item: [title, detail, status] }) => <div className="compact-item" key={`${group}-${title}`}><div><small>{group}</small><strong>{title}</strong><p>{detail}</p></div><em className={statusClass(status)}>{status}</em></div>)}
        </section>
      </div>
      <footer className="record-action"><span>Next action toward {phase.deliverable}</span><button type="button" disabled={phaseAdvanceBlocked} onClick={onNext}>{phaseAdvanceBlocked ? "Exit Gate is not passed" : current.primary}</button><small className={gateProgress === 3 ? "gate-passed" : "gate-open"}>Exit Gate · {gateProgress}/3 conditions passed</small></footer>
    </aside>
  );
}

function EvidenceDrawer({ current, phase, gateProgress, onClose }) {
  return <div className="drawer-backdrop" onMouseDown={onClose} role="presentation"><aside className="evidence-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Evidence details"><div className="drawer-header"><div><span>Full structured detail</span><strong>{current.id} · {current.name}</strong></div><button type="button" onClick={onClose}>Close</button></div><section><span className="drawer-label">Phase contract</span><p><strong>{phase.deliverable}</strong> · Exit Gate {gateProgress}/3 passed.</p></section><section><span className="drawer-label">Specification source</span><p>{current.source}</p></section><section><span className="drawer-label">All facts and provenance</span>{current.facts.map(([label, value, provenance]) => <RecordRow key={`${label}-${value}`} label={label} value={value} meta={provenance} />)}</section><section><span className="drawer-label">Authoritative observations</span>{current.events.map(([title, detail, status]) => <div className="drawer-event" key={title}><strong>{title}</strong><p>{detail}</p><span className={`mini-status ${statusClass(status)}`}>{status}</span></div>)}</section><section><span className="drawer-label">Record rule</span><p>Pi's prose is collaboration. Decisions and facts become durable only when they are reflected into the shared Operator Record with provenance and, where required, supporting evidence.</p></section>{current.decision && <section className="drawer-decision"><span className="drawer-label">Workshop boundary</span><p>{current.decision}</p></section>}</aside></div>;
}

function initialChatRecords(current) {
  return current.facts.filter(([, , provenance]) => /(user|engineer)/i.test(provenance)).map(([label, value]) => ({ label, value, meta: "From chat" }));
}

export function App() {
  const [index, setIndex] = useState(initialIndex);
  const [approvalMode, setApprovalMode] = useState("Pi Decides");
  const [drawerOpen, setDrawerOpen] = useState(false);
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
  const phasePosition = useMemo(() => { const states = statesByPhase[current.phase]; return `${states.findIndex((item) => item.id === current.id) + 1} of ${states.length}`; }, [current]);
  const records = useMemo(() => [...initialChatRecords(current), ...applicationDecisions], [current, applicationDecisions]);
  const nextState = journeyStates[index + 1];
  const phaseAdvanceBlocked = Boolean(nextState && nextState.phase > current.phase && gateProgress < phase.gate.length);

  useEffect(() => {
    window.history.replaceState(null, "", `#${current.id}`);
    document.title = `${current.id} · ${current.name} · Server Guy`;
    setDrawerOpen(false);
  }, [current]);

  function submitChat(text) {
    const isDecision = !/[?？]\s*$/.test(text);
    setMessagesBySession((all) => ({ ...all, [activeSession.id]: [...(all[activeSession.id] || []), { actor: "You", text, recorded: isDecision }, { actor: "Pi", text: isDecision ? "I recorded that in the shared Operator Record so it remains visible from every chat." : "I treated that as a question, so I did not change the Operator Record. This storyboard does not simulate the full answer." }] }));
    if (isDecision) setApplicationDecisions((items) => [...items, { label: "Chat decision", value: text, meta: `From ${activeSession.title}` }]);
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
          <LaunchMap current={current} phase={phase} phasePosition={phasePosition} gateProgress={gateProgress} setIndex={setIndex} />
          <div className="workspace-body">
            <ChatPanel current={current} phase={phase} session={activeSession} messages={messages} records={records} onSubmit={submitChat} onEvidence={() => setDrawerOpen(true)} onArchive={archiveActiveSession} onRestore={restoreActiveSession} />
            <OperatorRecord current={current} phase={phase} records={records} phasePosition={phasePosition} gateProgress={gateProgress} onNext={advance} onEvidence={() => setDrawerOpen(true)} phaseAdvanceBlocked={phaseAdvanceBlocked} />
          </div>
        </div>
      </div>
      {drawerOpen && <EvidenceDrawer current={current} phase={phase} gateProgress={gateProgress} onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}
