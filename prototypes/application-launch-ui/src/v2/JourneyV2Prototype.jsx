import React, { useEffect, useMemo, useState } from "react";
import { gateProgressByState, journeyStates, phases, statesByPhase } from "../journeyStates.js";
import {
  CheckList,
  CommandResult,
  ConfigDiff,
  ExternalProbe,
  ImmutableArtifact,
  LogTraceStream,
  ProviderReceipt,
  PullRequestCard,
} from "../catalog/DeveloperRenderers.jsx";
import {
  OperationGraph,
  ReconciliationSummary,
  SelectedOperation,
} from "../catalog/ReconciliationPrimitives.jsx";
import { getJourneyV2Scenario, validateJourneyV2Coverage } from "./journeyV2Model.js";
import { TaskSurface } from "./TaskSurfaces.jsx";

const missingCoverage = validateJourneyV2Coverage(journeyStates);
if (missingCoverage.length) throw new Error(`Journey V2 is missing state mappings: ${missingCoverage.join(", ")}`);

function initialStateId() {
  const requested = window.location.hash.replace(/^#/, "");
  return journeyStates.some((state) => state.id === requested) ? requested : "L1.1";
}

function StatusDot({ tone = "blue" }) {
  return <span className={`status-dot status-dot-${tone}`} aria-hidden="true" />;
}

function statusTone(state) {
  if (state.tone === "success") return "green";
  if (state.tone === "danger" || state.tone === "warning") return "orange";
  return "blue";
}

function V2PrototypeBar({ current, currentIndex, onSelect, onPrevious, onNext }) {
  return (
    <div className="v2-prototype-bar" aria-label="Application Launch prototype versions and states">
      <div className="v2-prototype-title">
        <strong>Journey 01 · V2</strong>
        <span>Original hierarchy + task surfaces + inspectable operations</span>
      </div>
      <nav className="v2-version-switch" aria-label="Prototype version">
        <a href={`/#${current.id}`}>Original</a>
        <span aria-current="page">V2</span>
      </nav>
      <label className="v2-state-select">
        <span>Mockup state</span>
        <select value={current.id} onChange={(event) => onSelect(event.target.value)}>
          {phases.map((phase) => (
            <optgroup label={`Phase ${phase.id} · ${phase.short}`} key={phase.id}>
              {statesByPhase[phase.id].map((state) => <option value={state.id} key={state.id}>{state.id} · {state.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <span className="v2-state-count">{currentIndex + 1} / {journeyStates.length}</span>
      <button type="button" onClick={onPrevious} disabled={currentIndex === 0}>Previous</button>
      <button type="button" onClick={onNext} disabled={currentIndex === journeyStates.length - 1}>Next</button>
    </div>
  );
}

function Sidebar({ selectedSession, onSelectSession, onNewSession, archived, onToggleArchived }) {
  return (
    <aside className="app-sidebar">
      <div className="brand-row"><span className="brand-mark">SG</span><strong>Server Guy</strong></div>
      <div className="sidebar-section-label"><span>Applications</span><button type="button">Add</button></div>
      <button type="button" className="application-row is-active"><span className="app-mark">N</span><span><strong>northstar</strong><small><StatusDot />Launch in progress</small></span></button>
      <button type="button" className="application-row"><span className="app-mark meadow">M</span><span><strong>meadowlark</strong><small><StatusDot tone="gray" />Idle</small></span></button>
      <div className="sidebar-rule" />
      <div className="sidebar-section-label"><span>Operator sessions</span><button type="button" onClick={onNewSession}>New</button></div>
      <button type="button" className={selectedSession === "launch" ? "session-row is-active" : "session-row"} onClick={() => onSelectSession("launch")}><strong>Launch northstar.dev</strong><small>Primary launch chat</small></button>
      <button type="button" className={selectedSession === "cost" ? "session-row is-active" : "session-row"} onClick={() => onSelectSession("cost")}><strong>Cost and ownership</strong><small>2 decisions recorded</small></button>
      {selectedSession === "new" && <button type="button" className="session-row is-active"><strong>Untitled session</strong><small>New application-scoped chat</small></button>}
      <button type="button" className="archived-row" onClick={onToggleArchived}>Archived sessions <span>{archived ? "Hide" : "3"}</span></button>
      {archived && <div className="archived-list"><span>Initial provider research</span><span>Old staging launch</span><span>Domain options</span></div>}
      <nav className="sidebar-footer" aria-label="Server Guy settings"><button type="button">Credentials</button><button type="button">Integrations</button><button type="button">Audit log</button><span><StatusDot tone="green" />Pi agent active</span></nav>
    </aside>
  );
}

function ApplicationHeader({ current, phase, approvalMode, onApprovalModeChange, onSelectPhase }) {
  return (
    <>
      <header className="app-header">
        <div className="app-identity"><span className="app-mark large">N</span><span><strong>northstar</strong><small>Production · <b>Application Launch V2</b></small></span></div>
        <label className="approval-mode">Approval mode<select value={approvalMode} onChange={(event) => onApprovalModeChange(event.target.value)}><option>Pi Decides</option><option>Always Ask</option><option>Full Autonomy</option></select></label>
        <div className="application-status"><small>Current state</small><strong><StatusDot tone={statusTone(current)} />{current.status}</strong></div>
      </header>
      <section className="launch-map" aria-label="Application Launch phases">
        <div className="launch-position"><span>You are here</span><strong>Phase {phase.id} · {phase.name}</strong><small>{current.id} · working toward {phase.deliverable}</small></div>
        <ol>
          {phases.map((item) => {
            const className = item.id < phase.id ? "is-complete" : item.id === phase.id ? "is-current" : "";
            return <li className={className} key={item.id}><button type="button" onClick={() => onSelectPhase(item.id)}><span>{item.id}</span><small>{item.short}</small></button></li>;
          })}
        </ol>
      </section>
    </>
  );
}

function ChatSurface({ current, phase, family, records, selectedSession, onRecord, onOpenInspector, onArchive }) {
  const sessionTitle = selectedSession === "launch" ? "Launch northstar.dev" : selectedSession === "cost" ? "Cost and ownership" : "Untitled session";
  return (
    <main className="chat-surface" aria-label="Chat with Pi">
      <div className="chat-header"><span><strong>{sessionTitle}</strong><small>Chat with Pi · primary collaboration surface</small></span><div><button type="button" onClick={() => onOpenInspector("evidence")}>Evidence</button><button type="button" onClick={onArchive}>Archive</button></div></div>
      <div className="work-target"><span>Pi is working toward</span><strong>{phase.deliverable}</strong><em>{current.status}</em></div>
      <div className="conversation-scroll">
        <article className="message-row"><span className="avatar pi-avatar">Pi</span><div className="message-content"><header><strong>Pi</strong><time>just now</time></header><p>{current.pi}</p></div></article>
        <TaskSurface family={family} state={current} onRecord={onRecord} onOpenInspector={onOpenInspector} />
        {records.map((record, index) => <div className="recorded-message" key={`${record}-${index}`}><StatusDot tone="green" /><span><strong>Recorded in Operator Record</strong>{record}</span><button type="button" onClick={() => onOpenInspector("record")}>Details</button></div>)}
        <div className="chat-quiet-actions"><button type="button" onClick={() => onOpenInspector("record")}>Explain this state</button></div>
      </div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); onRecord("Asked Pi a question in the current application context."); }}>
        <textarea aria-label="Message Pi" placeholder="Tell Pi a decision, correct it, or ask a question…" />
        <div><span>Context: northstar · {phase.deliverable} · {current.id}</span><button type="submit">Send</button></div>
      </form>
    </main>
  );
}

function RecordPanel({ current, phase, progress, records, onOpenInspector }) {
  return (
    <>
      <section className="record-summary"><div><StatusDot tone={statusTone(current)} /><strong>{phase.deliverable}</strong></div><p>{phase.outcome}</p><small>{current.id} · {progress}/{phase.gate.length} exit checks passed</small></section>
      <section className="inspector-card v2-gate-card">
        <header><strong>Exit Gate</strong><span>{progress}/{phase.gate.length} passed</span></header>
        <div className="v2-gate-list">
          {phase.gate.map((gate, index) => <div className="v2-gate-row" key={gate}><span>{index < progress ? "Passed" : index === progress ? "Current" : "Required"}</span><strong>{gate}</strong><button type="button" onClick={() => onOpenInspector("evidence")}>Details</button></div>)}
        </div>
      </section>
      <section className="inspector-card">
        <header><strong>Decisions from chat</strong><span>{records.length}</span></header>
        {records.length ? <div className="v2-decision-list">{records.map((record, index) => <div key={`${record}-${index}`}><small>Recorded in this session</small><strong>{record}</strong></div>)}</div> : <p className="v2-empty-copy">No decision has been recorded from this chat in the current prototype state.</p>}
      </section>
      <section className="inspector-card">
        <header><strong>Current facts and provenance</strong><span>{current.facts.length}</span></header>
        <dl className="record-list">{current.facts.map(([label, value, source]) => <div key={`${label}-${value}`}><dt>{label}</dt><dd>{value}<small>{source}</small></dd></div>)}</dl>
      </section>
    </>
  );
}

function evidenceChecks(current) {
  const sourceRows = current.events.length ? current.events : current.facts.map(([label, value, source]) => [label, `${value} · ${source}`, "recorded"]);
  return sourceRows.slice(0, 5).map(([name, detail, status]) => ({
    name,
    detail,
    status: /pass|record|complete|ready|verified|observed|good/i.test(status) ? "Passed" : /active|acting|progress/i.test(status) ? "Running" : "Needs attention",
  }));
}

function DeveloperEvidence({ current, onOpenEvidence }) {
  const checks = evidenceChecks(current);
  if (current.phase === 3) return <><PullRequestCard status={current.status} onOpen={onOpenEvidence} /><ConfigDiff onOpen={onOpenEvidence} /><CheckList title="Repository and Server Guy checks" items={checks} onOpen={onOpenEvidence} /></>;
  if (current.phase === 5) return <><ProviderReceipt status={current.status} onOpen={onOpenEvidence} /><CommandResult command="hcloud server describe northstar-prod-01" status={current.status} onOpen={onOpenEvidence} /></>;
  if (current.phase === 6) return <><ProviderReceipt provider="Cloudflare" operation="Reconcile DNS route" resource="northstar.dev → 49.12.118.42" status={current.status} onOpen={onOpenEvidence} /><ExternalProbe status={current.tone === "danger" ? 502 : 200} onOpen={onOpenEvidence} /><LogTraceStream title="DNS and TLS observations" tone={current.tone === "danger" ? "warning" : "active"} onOpen={onOpenEvidence} /></>;
  if (current.phase === 7) return <><CommandResult command="systemctl --no-pager status northstar postgres backup-agent" status={current.status} onOpen={onOpenEvidence} /><LogTraceStream title="Operational setup trace" tone={current.tone === "danger" ? "warning" : "active"} onOpen={onOpenEvidence} /><CheckList title="Operational responsibilities" items={checks} onOpen={onOpenEvidence} /></>;
  if (current.phase === 8) return <><CommandResult command="server-guy release inspect --current" status={current.status} onOpen={onOpenEvidence} /><ExternalProbe status={["L8.3", "L8.4"].includes(current.id) ? 500 : 200} onOpen={onOpenEvidence} /><CheckList title="Release verification" items={checks} onOpen={onOpenEvidence} /></>;
  if (current.phase === 9) return <><ImmutableArtifact title="Operations Handoff evidence bundle" source={current.source} onOpen={onOpenEvidence} /><ExternalProbe onOpen={onOpenEvidence} /><LogTraceStream title="Ongoing observation" onOpen={onOpenEvidence} /></>;
  return <><ConfigDiff file="server-guy.yaml" source={current.source} onOpen={onOpenEvidence} /><CheckList title="Current state checks" items={checks} onOpen={onOpenEvidence} /></>;
}

function ChangesPanel({ current, phase, scenario, selectedNode, selectedNodeId, onSelectNode, onOpenInspector }) {
  return (
    <>
      <section className="inspector-card v2-under-hood-intro"><header><strong>Under the hood</strong><span>Secondary detail</span></header><p>The task surface remains primary. This layer shows the managed intent, fresh observations, computed work, and current phase-local operation.</p></section>
      <ReconciliationSummary desired={scenario.desired} observed={scenario.observed} deltas={scenario.deltas} desiredTitle="Managed intent" onOpen={onOpenInspector} />
      <OperationGraph nodes={scenario.nodes} selectedNodeId={selectedNodeId} eyebrow="Phase-local operation plan" title={`How ${phase.deliverable} is produced`} onSelect={onSelectNode} />
      <SelectedOperation node={selectedNode} onOpen={onOpenInspector} />
      <DeveloperEvidence current={current} onOpenEvidence={() => onOpenInspector("evidence")} />
      <section className="inspector-card compact"><header><strong>Phase contract</strong><span>{phase.deliverable}</span></header><p>{phase.meaning}</p></section>
    </>
  );
}

function EvidencePanel({ current, selectedNode, onRecord }) {
  return (
    <>
      <section className="record-summary"><div><StatusDot tone={statusTone(current)} /><strong>{selectedNode.evidence}</strong></div><p>{current.source}</p><small>Claims remain linked to source identity, collection method, timestamp, and re-verification.</small></section>
      <section className="inspector-card">
        <header><strong>Evidence used by this state</strong><span>{Math.max(current.events.length, current.facts.length)}</span></header>
        <div className="v2-evidence-list">
          {(current.events.length ? current.events : current.facts).map(([title, detail, source], index) => <button type="button" key={`${title}-${index}`} onClick={() => onRecord(`Opened source evidence for ${title}.`)}><span><strong>{title}</strong><small>{detail}</small></span><em>{source}</em></button>)}
        </div>
      </section>
      <ImmutableArtifact title={`${current.name} evidence artifact`} source={current.source} onOpen={() => onRecord(`Opened immutable evidence for ${current.name}.`)} />
      <DeveloperEvidence current={current} onOpenEvidence={() => onRecord(`Opened raw evidence for ${current.name}.`)} />
    </>
  );
}

function Inspector({ tab, onTabChange, current, phase, progress, scenario, selectedNodeId, onSelectNode, records, onRecord }) {
  const selectedNode = scenario.nodes.find((node) => node.id === selectedNodeId) || scenario.nodes[0];
  return (
    <aside className="inspector" aria-label="Operator Inspector">
      <div className="inspector-header"><strong>Operator Inspector</strong><nav>{["record", "changes", "evidence"].map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} onClick={() => onTabChange(item)}>{item}</button>)}</nav></div>
      <div className="inspector-scroll">
        {tab === "record" && <RecordPanel current={current} phase={phase} progress={progress} records={records} onOpenInspector={onTabChange} />}
        {tab === "changes" && <ChangesPanel current={current} phase={phase} scenario={scenario} selectedNode={selectedNode} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} onOpenInspector={onTabChange} />}
        {tab === "evidence" && <EvidencePanel current={current} selectedNode={selectedNode} onRecord={onRecord} />}
      </div>
    </aside>
  );
}

export function JourneyV2Prototype() {
  const initialId = useMemo(initialStateId, []);
  const [stateId, setStateId] = useState(initialId);
  const [approvalMode, setApprovalMode] = useState("Pi Decides");
  const [selectedSession, setSelectedSession] = useState("launch");
  const [archived, setArchived] = useState(false);
  const [inspectorTab, setInspectorTab] = useState("record");
  const [recordsByState, setRecordsByState] = useState({});
  const currentIndex = journeyStates.findIndex((state) => state.id === stateId);
  const current = journeyStates[currentIndex] || journeyStates[0];
  const phase = phases.find((item) => item.id === current.phase);
  const progress = gateProgressByState[current.id] ?? 0;
  const scenario = useMemo(() => getJourneyV2Scenario(current, phase, progress), [current, phase, progress]);
  const [selectedNodeId, setSelectedNodeId] = useState(scenario.selectedNodeId);
  const records = recordsByState[current.id] || [];

  useEffect(() => {
    const onHashChange = () => {
      const next = initialStateId();
      setStateId(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    setSelectedNodeId(scenario.selectedNodeId);
    setInspectorTab("record");
    window.history.replaceState({}, "", `#${current.id}`);
    document.title = `${current.id} · ${current.name} · Server Guy V2`;
  }, [current.id, current.name, scenario.selectedNodeId]);

  function selectState(nextId) {
    setStateId(nextId);
  }

  function selectPhase(phaseId) {
    selectState(statesByPhase[phaseId][0].id);
  }

  function record(message) {
    setRecordsByState((all) => ({ ...all, [current.id]: [...(all[current.id] || []).slice(-2), message] }));
  }

  return (
    <div className="v2-page">
      <V2PrototypeBar current={current} currentIndex={currentIndex} onSelect={selectState} onPrevious={() => selectState(journeyStates[currentIndex - 1].id)} onNext={() => selectState(journeyStates[currentIndex + 1].id)} />
      <div className="server-guy-shell v2-shell">
        <Sidebar selectedSession={selectedSession} onSelectSession={setSelectedSession} onNewSession={() => setSelectedSession("new")} archived={archived} onToggleArchived={() => setArchived((value) => !value)} />
        <section className="workspace">
          <ApplicationHeader current={current} phase={phase} approvalMode={approvalMode} onApprovalModeChange={setApprovalMode} onSelectPhase={selectPhase} />
          <div className="workspace-body">
            <ChatSurface current={current} phase={phase} family={scenario.presentation} records={records} selectedSession={selectedSession} onRecord={record} onOpenInspector={setInspectorTab} onArchive={() => record("Archived the current Operator Session.")} />
            <Inspector tab={inspectorTab} onTabChange={setInspectorTab} current={current} phase={phase} progress={progress} scenario={scenario} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} records={records} onRecord={record} />
          </div>
        </section>
      </div>
    </div>
  );
}
