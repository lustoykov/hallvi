import React, { useEffect, useMemo, useState } from "react";
import {
  CheckList,
  CommandResult,
  ConfigDiff,
  ExternalProbe,
  ImmutableArtifact,
  LogTraceStream,
  ProviderReceipt,
  PullRequestCard,
} from "./DeveloperRenderers.jsx";
import { ReconciliationPresentation, SourceLink } from "./ReconciliationPrimitives.jsx";
import { families, getScenario } from "./reconciliationScenarios.js";

const phases = ["Start", "Understand", "Conform", "See launch", "VPS", "Domain", "Operations", "Go live", "Handoff"];

function readInitialState() {
  const params = new URLSearchParams(window.location.search);
  const familyId = families.some((item) => item.id === params.get("family")) ? params.get("family") : "handoff";
  const scenario = getScenario(familyId);
  const tab = ["record", "changes", "evidence"].includes(params.get("tab")) ? params.get("tab") : "changes";
  const nodeId = scenario.nodes.some((node) => node.id === params.get("node")) ? params.get("node") : scenario.selectedNodeId;
  return { familyId, tab, nodeId };
}

function StatusDot({ tone = "blue" }) {
  return <span className={`status-dot status-dot-${tone}`} aria-hidden="true" />;
}

function PrototypeBar({ familyId, onChange }) {
  return (
    <div className="prototype-bar" aria-label="Prototype reconciliation state selector">
      <div className="prototype-title">
        <strong>Journey 01 reconciliation catalog</strong>
        <span>7 composition examples · granular primitives · fixed workspace</span>
      </div>
      <div className="prototype-family-list" role="tablist" aria-label="Reconciliation state">
        {families.map((family) => (
          <button
            className={family.id === familyId ? "prototype-family is-selected" : "prototype-family"}
            key={family.id}
            onClick={() => onChange(family.id)}
            role="tab"
            aria-selected={family.id === familyId}
          >
            <span>{family.number}</span>
            {family.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Sidebar({ selectedSession, onSelectSession, onNewSession, archived, onToggleArchived }) {
  return (
    <aside className="app-sidebar">
      <div className="brand-row"><span className="brand-mark">SG</span><strong>Server Guy</strong></div>
      <div className="sidebar-section-label"><span>Applications</span><button>Add</button></div>
      <button className="application-row is-active">
        <span className="app-mark">N</span>
        <span><strong>northstar</strong><small><StatusDot />Launch in progress</small></span>
      </button>
      <button className="application-row">
        <span className="app-mark meadow">M</span>
        <span><strong>meadowlark</strong><small><StatusDot tone="gray" />Idle</small></span>
      </button>
      <div className="sidebar-rule" />
      <div className="sidebar-section-label"><span>Operator sessions</span><button onClick={onNewSession}>New</button></div>
      <button className={selectedSession === "launch" ? "session-row is-active" : "session-row"} onClick={() => onSelectSession("launch")}>
        <strong>Launch northstar.dev</strong><small>Primary launch chat</small>
      </button>
      <button className={selectedSession === "cost" ? "session-row is-active" : "session-row"} onClick={() => onSelectSession("cost")}>
        <strong>Cost and ownership</strong><small>2 decisions recorded</small>
      </button>
      {selectedSession === "new" && <button className="session-row is-active" onClick={() => onSelectSession("new")}><strong>Untitled session</strong><small>New application-scoped chat</small></button>}
      <button className="archived-row" onClick={onToggleArchived}>Archived sessions <span>{archived ? "Hide" : "3"}</span></button>
      {archived && <div className="archived-list"><span>Initial provider research</span><span>Old staging launch</span><span>Domain options</span></div>}
      <nav className="sidebar-footer" aria-label="Server Guy settings">
        <button>Credentials</button><button>Integrations</button><button>Audit log</button>
        <span><StatusDot tone="green" />Pi agent active</span>
      </nav>
    </aside>
  );
}

function AppHeader({ current, approvalMode, onModeChange }) {
  const statusTone = current.status === "Healthy" ? "green" : current.status === "Blocked" ? "orange" : "blue";
  return (
    <>
      <header className="app-header">
        <div className="app-identity"><span className="app-mark large">N</span><span><strong>northstar</strong><small>Production · <b>Application Launch</b></small></span></div>
        <label className="approval-mode">Approval mode<select value={approvalMode} onChange={(event) => onModeChange(event.target.value)}><option>Pi Decides</option><option>Always Ask</option><option>Full Autonomy</option></select></label>
        <div className="application-status"><small>Current state</small><strong><StatusDot tone={statusTone} />{current.status}</strong></div>
      </header>
      <section className="launch-map" aria-label="Application launch map">
        <div className="launch-position"><span>Phase {current.phase} of 9</span><strong>{phases[current.phase - 1]}</strong><small>{current.state} · working toward {current.deliverable}</small></div>
        <ol>
          {phases.map((phase, index) => {
            const number = index + 1;
            const state = number < current.phase ? "is-complete" : number === current.phase ? "is-current" : "";
            return <li className={state} key={phase}><span>{number}</span><small>{phase}</small></li>;
          })}
        </ol>
      </section>
    </>
  );
}

function ChatSurface({ current, selectedNodeId, onSelectNode, selectedSession, records, onOpenInspector, onRecord, selectedChoice }) {
  const sessionTitle = selectedSession === "launch" ? "Launch northstar.dev" : selectedSession === "cost" ? "Cost and ownership" : "Untitled session";
  return (
    <main className="chat-surface">
      <div className="chat-header"><span><strong>{sessionTitle}</strong><small>Chat with Pi · primary collaboration surface</small></span><div><button onClick={() => onOpenInspector("evidence")}>Evidence</button><button>Archive</button></div></div>
      <div className="work-target"><span>Reconciling toward</span><strong>{current.deliverable}</strong><em>{current.status}</em></div>
      <div className="conversation-scroll">
        <article className="message-row">
          <span className="avatar pi-avatar">Pi</span>
          <div className="message-content"><header><strong>Pi</strong><time>just now</time></header><p>{current.piCopy}</p></div>
        </article>
        <ReconciliationPresentation scenario={current} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} onOpenInspector={onOpenInspector} onRecord={onRecord} selectedChoice={selectedChoice} />
        {records.map((record, index) => (
          <div className="recorded-message" key={`${record}-${index}`}><StatusDot tone="green" /><span><strong>Recorded in Operator Record</strong>{record}</span><button onClick={() => onOpenInspector("record")}>Details</button></div>
        ))}
        <div className="chat-quiet-actions"><button onClick={() => onOpenInspector("record")}>Explain this state</button><button onClick={() => onOpenInspector("changes")}>Inspect under the hood</button><button onClick={() => onOpenInspector("evidence")}>Show evidence</button></div>
      </div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); onRecord("You asked Pi to investigate from chat."); }}>
        <textarea aria-label="Message Pi" placeholder="Ask Pi, correct desired state, or take control…" />
        <div><span>Context: northstar · {current.deliverable} · {current.state}</span><button type="submit">Send</button></div>
      </form>
    </main>
  );
}

function Inspector({ current, selectedNode, tab, onTabChange, onRecord }) {
  return (
    <aside className="inspector">
      <div className="inspector-header"><strong>Inspector</strong><nav>{["record", "changes", "evidence"].map((item) => <button key={item} className={tab === item ? "is-active" : ""} onClick={() => onTabChange(item)}>{item}</button>)}</nav></div>
      <div className="inspector-scroll">
        {tab === "record" && <RecordPanel current={current} selectedNode={selectedNode} onRecord={onRecord} />}
        {tab === "changes" && <ChangesPanel current={current} selectedNode={selectedNode} onTabChange={onTabChange} onRecord={onRecord} />}
        {tab === "evidence" && <EvidencePanel current={current} selectedNode={selectedNode} onRecord={onRecord} />}
      </div>
    </aside>
  );
}

function RecordPanel({ current, selectedNode, onRecord }) {
  return (
    <>
      <section className="record-summary"><div><StatusDot tone={current.status === "Healthy" ? "green" : current.status === "Blocked" ? "orange" : "blue"} /><strong>{current.deliverable}</strong></div><p>{current.headline}</p><small>{current.state} · current state is recomputed from desired state and fresh observations.</small></section>
      <section className="inspector-card">
        <header><strong>Selected graph node</strong><span>{selectedNode.number} / 08</span></header>
        <dl className="record-list"><div><dt>Operation</dt><dd>{selectedNode.title}</dd></div><div><dt>Control</dt><dd>{selectedNode.kind === "deterministic" ? "Deterministic rule" : selectedNode.kind === "judgment" ? "Pi judgment point" : "External coding agent"}</dd></div><div><dt>Actor</dt><dd>{selectedNode.owner}</dd></div><div><dt>External effect</dt><dd>{selectedNode.effect}</dd></div><div><dt>Depends on</dt><dd>{selectedNode.dependencies}</dd></div></dl>
        <footer><button onClick={() => onRecord(`Ask Pi to explain ${selectedNode.title}.`)}>Ask Pi to explain</button><button onClick={() => onRecord(`Take engineer control of ${selectedNode.title}.`)}>Take control</button></footer>
      </section>
      <section className="inspector-card compact"><header><strong>Reconciliation rule</strong><span>Why this node exists</span></header><p>{selectedNode.summary}</p><div className="control-grid"><button onClick={() => onRecord(`Change desired state affecting ${selectedNode.title}.`)}>Change intent</button><button onClick={() => onRecord(`Refresh observations for ${selectedNode.title}.`)}>Refresh state</button><button onClick={() => onRecord(`Re-plan from ${selectedNode.title}.`)}>Re-plan</button></div></section>
    </>
  );
}

function OperationPlanCard({ node, onOpenEvidence }) {
  return (
    <section className="inspector-card operation-plan-card">
      <header><strong>{node.number} · {node.title}</strong><span>{node.status}</span></header>
      <dl className="record-list"><div><dt>Executor</dt><dd>{node.owner}</dd></div><div><dt>Effect</dt><dd>{node.effect}</dd></div><div><dt>Inputs</dt><dd>{node.dependencies}</dd></div><div><dt>Evidence target</dt><dd>{node.evidence}</dd></div></dl>
      <footer><SourceLink onClick={onOpenEvidence}>Open supporting evidence</SourceLink></footer>
    </section>
  );
}

function ChangesPanel({ current, selectedNode, onTabChange, onRecord }) {
  const openPullRequest = () => onRecord("Opened Pull Request #42 in the external repository review surface.");
  const openDiff = () => onRecord("Opened the complete configuration diff from the selected operation.");
  const openEvidence = () => onTabChange("evidence");
  let renderers;
  if (current.id === "handoff") {
    renderers = <><PullRequestCard onOpen={openPullRequest} /><ConfigDiff onOpen={openDiff} /><CheckList onOpen={openEvidence} /></>;
  } else if (["review", "approval"].includes(current.id)) {
    renderers = <><ProviderReceipt status={current.id === "approval" ? "Awaiting approval" : "Planned"} onOpen={openEvidence} /><ConfigDiff onOpen={openDiff} /><CommandResult status="Ready" onOpen={openEvidence} /></>;
  } else if (["operation", "intervention"].includes(current.id)) {
    renderers = <><CommandResult status={current.id === "intervention" ? "Blocked" : "Running"} onOpen={openEvidence} /><LogTraceStream tone={current.id === "intervention" ? "warning" : "active"} onOpen={openEvidence} /><ProviderReceipt status={current.id === "intervention" ? "Conflict" : "Submitted"} onOpen={openEvidence} /></>;
  } else {
    renderers = <><ConfigDiff onOpen={openDiff} /><ProviderReceipt status={current.id === "outcome" ? "Applied" : "Observed"} onOpen={openEvidence} /><CommandResult status={current.id === "outcome" ? "Verified" : "Ready"} onOpen={openEvidence} /></>;
  }
  return <><OperationPlanCard node={selectedNode} onOpenEvidence={openEvidence} />{renderers}</>;
}

function EvidencePanel({ current, selectedNode, onRecord }) {
  const openRawEvidence = () => onRecord(`Opened raw evidence for ${selectedNode.title}.`);
  return (
    <>
      <section className="record-summary"><div><StatusDot tone={current.id === "intervention" ? "orange" : "green"} /><strong>{selectedNode.evidence}</strong></div><p>Selected node: {selectedNode.title}</p><small>Every claim remains linked to the captured source, collection method, timestamp, and immutable artifact.</small></section>
      <ExternalProbe status={current.id === "intervention" ? 502 : 200} onOpen={openRawEvidence} />
      <CheckList onOpen={openRawEvidence} />
      <ImmutableArtifact onOpen={openRawEvidence} />
      <LogTraceStream tone={current.id === "intervention" ? "warning" : "active"} onOpen={openRawEvidence} />
    </>
  );
}

export function CatalogPrototype() {
  const initial = useMemo(readInitialState, []);
  const [familyId, setFamilyId] = useState(initial.familyId);
  const [tab, setTab] = useState(initial.tab);
  const [selectedNodeId, setSelectedNodeId] = useState(initial.nodeId);
  const [approvalMode, setApprovalMode] = useState("Pi Decides");
  const [selectedSession, setSelectedSession] = useState("launch");
  const [archived, setArchived] = useState(false);
  const [records, setRecords] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState("");
  const current = getScenario(familyId);
  const selectedNode = current.nodes.find((node) => node.id === selectedNodeId) || current.nodes[0];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("family", familyId);
    params.set("tab", tab);
    params.set("node", selectedNode.id);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [familyId, tab, selectedNode.id]);

  function changeFamily(nextId) {
    const next = getScenario(nextId);
    setFamilyId(nextId);
    setSelectedNodeId(next.selectedNodeId);
    setSelectedChoice("");
    setRecords([]);
  }

  function record(message) {
    setSelectedChoice(message);
    setRecords((existing) => [...existing.slice(-1), message]);
  }

  return (
    <div className="catalog-page">
      <PrototypeBar familyId={familyId} onChange={changeFamily} />
      <div className="server-guy-shell">
        <Sidebar selectedSession={selectedSession} onSelectSession={setSelectedSession} onNewSession={() => setSelectedSession("new")} archived={archived} onToggleArchived={() => setArchived((value) => !value)} />
        <section className="workspace">
          <AppHeader current={current} approvalMode={approvalMode} onModeChange={setApprovalMode} />
          <div className="workspace-body">
            <ChatSurface current={current} selectedNodeId={selectedNode.id} onSelectNode={setSelectedNodeId} selectedSession={selectedSession} records={records} onOpenInspector={setTab} onRecord={record} selectedChoice={selectedChoice} />
            <Inspector current={current} selectedNode={selectedNode} tab={tab} onTabChange={setTab} onRecord={record} />
          </div>
        </section>
      </div>
    </div>
  );
}
