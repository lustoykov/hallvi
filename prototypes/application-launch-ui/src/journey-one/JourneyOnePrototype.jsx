import { useEffect, useMemo, useRef, useState } from "react";
import { buildScript, defaultChoices, defaultOutcomes, identity, outcomeSwitches } from "./fixture.js";
import { Inspector, HeroOverlay } from "./Inspector.jsx";
import {
  blockingDecisionByBeat,
  gateForBeat,
  isGateSatisfied,
  journeyOnePhases,
  productDecisionsForPhase,
  unresolvedProductDecisions,
} from "./journeyOneModel.js";

const MODES = ["Pi Decides", "Always Ask", "Full Autonomy"];

function statusTone(status) {
  if (!status) return "calm";
  if (/verified/i.test(status)) return "verified";
  if (/complete with gaps/i.test(status)) return "gaps";
  if (/blocked/i.test(status)) return "blocked";
  if (/reachable/i.test(status)) return "reachable";
  if (/waiting/i.test(status)) return "waiting";
  if (/approval/i.test(status)) return "approval";
  if (/acting/i.test(status)) return "acting";
  return "input";
}

function GateDots({ gate }) {
  return (
    <span className="gate-dots" aria-label="Exit gate checks">
      {gate.map((state, index) => (
        <i key={index} className={`gate-dot gate-${state}`} title={state} />
      ))}
    </span>
  );
}

function PhaseRail({ current, gate, onOpenSession, journeyComplete }) {
  return (
    <nav className="phase-rail" aria-label="Application Launch phases">
      {journeyOnePhases.map((phase) => {
        const done = phase.id < current.id || (journeyComplete && phase.id === current.id);
        const active = !journeyComplete && phase.id === current.id;
        return (
          <button key={phase.id} type="button" className={`rail-phase ${active ? "active" : ""} ${done ? "done" : ""}`} onClick={() => done && onOpenSession(phase.id)} disabled={!done && !active}>
            <span className="rail-num">{done ? "✓" : phase.id}</span>
            <span className="rail-copy">
              <strong>{phase.short}</strong>
              {active && <small>{phase.deliverable}</small>}
            </span>
            {active && <GateDots gate={gate} />}
          </button>
        );
      })}
    </nav>
  );
}

function StartCard({ card, mode, setMode }) {
  const approvalModeHelp = {
    "Pi Decides": "Pi chooses when approval is needed and explains why.",
    "Always Ask": "Pi asks before every state-changing action.",
    "Full Autonomy": "Pi acts without asking, within connected permissions.",
  };
  const launchPriorities = [
    { id: "cost", label: "Keep costs low" },
    { id: "data", label: "Protect database data" },
    { id: "downtime", label: "Minimize downtime" },
  ];
  const [priorities, setPriorities] = useState(card.priorities || []);

  function togglePriority(priorityId) {
    setPriorities((current) =>
      current.includes(priorityId)
        ? current.filter((item) => item !== priorityId)
        : [...current, priorityId],
    );
  }

  return (
    <div className="typed-card launch-brief-card">
      <div className="card-title">Launch Brief</div>
      <div className="card-grid launch-basics">
        <label><span>Repository</span><input value={card.repo} readOnly /></label>
        <label><span>Environment</span><input value={card.environment} readOnly /></label>
      </div>

      <fieldset className="launch-setting approval-setting">
        <legend>When should Pi ask?</legend>
        <div className="approval-mode-options">
          {MODES.map((option) => (
            <label key={option} className="approval-mode-option">
              <input type="radio" name="approval-mode" value={option} checked={mode === option} onChange={() => setMode(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <p className="setting-help">{approvalModeHelp[mode]}</p>
      </fieldset>

      <fieldset className="launch-setting priorities-setting">
        <legend>Launch priorities <small>Optional</small></legend>
        <p className="setting-help">Pi uses these when choosing server size, backups, and recovery trade-offs.</p>
        <div className="priority-options">
          {launchPriorities.map((priority) => (
            <label key={priority.id} className={`priority-option ${priorities.includes(priority.id) ? "selected" : ""}`}>
              <input type="checkbox" checked={priorities.includes(priority.id)} onChange={() => togglePriority(priority.id)} />
              <span>{priority.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function RowsCard({ card, onHero }) {
  return (
    <div className="typed-card">
      <div className="card-title">{card.title}</div>
      {card.cost && <div className="card-cost">{card.cost}</div>}
      <dl className="card-rows">
        {card.rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {card.secondary && (
        <button type="button" className="card-secondary-link" onClick={() => onHero(card.secondary.hero)}>
          {card.secondary.label}
        </button>
      )}
    </div>
  );
}

function OptionsCard({ card, onPick }) {
  return (
    <div className="typed-card">
      <div className="card-title">{card.title}</div>
      {card.brief && <p className="card-brief">{card.brief}</p>}
      {card.rows && (
        <dl className="card-rows">
          {card.rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}
      <div className="card-options">
        {card.options.map((option) => (
          <button key={option.label} type="button" className="option-button" onClick={() => onPick(option)}>
            <strong>{option.label}</strong>
            <small>{option.sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function BeatBlock({ beat, isCurrent, rejected, mode, setMode, onAction, onPick, onReconsider, onDetails, onHero }) {
  const tone = statusTone(beat.status);
  const showCard = isCurrent && beat.card;
  return (
    <article className={`beat ${isCurrent ? "current" : "past"}`}>
      <div className="beat-meta">
        <span className="pi-avatar">Pi</span>
        <strong>Pi</strong>
        {beat.status && isCurrent && <em className={`status-chip tone-${tone}`}>{beat.status}</em>}
        <button type="button" className="details-link" onClick={() => onDetails(beat)}>Details</button>
      </div>
      <p className="beat-text">{beat.pi}</p>

      {showCard && beat.kind === "input" && <StartCard card={beat.card} mode={mode} setMode={setMode} />}
      {showCard && (beat.kind === "task" || beat.kind === "approval") && !rejected && <RowsCard card={beat.card} onHero={onHero} />}
      {showCard && (beat.kind === "choice" || beat.kind === "blocker") && beat.card.options && <OptionsCard card={beat.card} onPick={onPick} />}
      {showCard && beat.kind === "blocker" && !beat.card.options && <RowsCard card={beat.card} onHero={onHero} />}

      {isCurrent && rejected && (
        <div className="rejected-note">
          <strong>Rejected. No state changed.</strong> The proposal is preserved and nothing was executed.
          <button type="button" onClick={onReconsider}>Reconsider proposal</button>
        </div>
      )}

      {isCurrent && !rejected && beat.actions && (
        <div className="beat-actions">
          {beat.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.tone === "reject" ? "action-reject" : "action-primary"}
              onClick={() => onAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {isCurrent && !rejected && !beat.actions && !["final", "choice", "blocker"].includes(beat.kind) && (
        <div className="beat-actions">
          <button type="button" className="action-primary" onClick={() => onAction({ label: "Next" })}>Next</button>
        </div>
      )}

      {!isCurrent && <div className="resolved-line"><i>✓</i>{beat.resolvedLine}</div>}
    </article>
  );
}

function ProductDecisionsOverlay({ relevant, onClose }) {
  const relevantIds = new Set(relevant.map((decision) => decision.id));
  return (
    <div className="hero-backdrop" onMouseDown={onClose} role="presentation">
      <section className="decision-panel" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Unresolved product decisions">
        <div className="hero-head">
          <div><strong>Unresolved product decisions</strong><small>Preserved from the V1 acceptance pack · this UI does not choose them</small></div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <p className="decision-intro">Highlighted decisions can affect the phase you are viewing. All sixteen remain product-owner decisions.</p>
        <div className="decision-list">
          {Object.entries(unresolvedProductDecisions).map(([id, text]) => (
            <div key={id} className={relevantIds.has(id) ? "relevant" : ""}>
              <strong>{id}</strong><span>{text}</span>{relevantIds.has(id) && <em>Relevant now</em>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function JourneyOnePrototype() {
  const [mode, setModeState] = useState("Pi Decides");
  const [choices, setChoices] = useState(defaultChoices);
  const [outcomes, setOutcomes] = useState(defaultOutcomes);
  const [cursorId, setCursorId] = useState("start-input");
  const [clicks, setClicks] = useState(0);
  const [rejected, setRejected] = useState({});
  const [extras, setExtras] = useState([]);
  const [sidebar, setSidebar] = useState({ open: true, tab: "record", highlight: null });
  const [hero, setHero] = useState(null);
  const [showProductDecisions, setShowProductDecisions] = useState(false);
  const [prototypeMenuOpen, setPrototypeMenuOpen] = useState(false);
  const [generalChat, setGeneralChat] = useState({ open: false, messages: [] });
  const [viewedPhaseId, setViewedPhaseId] = useState(null);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const chatRef = useRef(null);

  const script = useMemo(() => buildScript({ mode, choices, outcomes }), [mode, choices, outcomes]);
  const idx = Math.max(0, script.findIndex((b) => b.id === cursorId));
  const allVisible = script.slice(0, idx + 1);
  const current = script[idx];
  const journeyComplete = current.id === "workspace";
  const currentPhase = journeyOnePhases[current.phase - 1];
  const currentGate = gateForBeat(current.id, current.phase, outcomes);
  const displayPhaseId = viewedPhaseId && (viewedPhaseId < current.phase || journeyComplete) ? viewedPhaseId : current.phase;
  const phase = journeyOnePhases[displayPhaseId - 1];
  const visible = journeyComplete && !viewedPhaseId
    ? [current]
    : allVisible.filter((beat) => beat.phase === displayPhaseId && !(journeyComplete && viewedPhaseId === 9 && beat.id === "workspace"));
  const displayBeat = visible.at(-1) || current;
  const displayGate = gateForBeat(displayBeat.id, displayBeat.phase, outcomes);
  const viewingArchived = Boolean(viewedPhaseId) && (displayPhaseId !== current.phase || journeyComplete);
  const completedPhases = journeyOnePhases.filter((item) => item.id < current.phase || (journeyComplete && item.id === current.phase));
  const relevantProductDecisions = [
    ...productDecisionsForPhase(displayPhaseId),
    ...visible.flatMap((beat) => beat.openDecisions),
  ].filter((decision, index, all) => all.findIndex((item) => item.id === decision.id) === index);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [cursorId, extras.length, viewedPhaseId, generalChat.open, generalChat.messages.length]);

  function relocate(nextParams, preferredId) {
    const nextScript = buildScript(nextParams);
    const target = preferredId && nextScript.some((b) => b.id === preferredId) ? preferredId : null;
    if (target) return setCursorId(target);
    for (let i = idx; i >= 0; i -= 1) {
      if (nextScript.some((b) => b.id === script[i].id)) return setCursorId(script[i].id);
    }
    setCursorId(nextScript[0].id);
  }

  function setMode(nextMode) {
    relocate({ mode: nextMode, choices, outcomes }, cursorId);
    setModeState(nextMode);
  }

  function resetPrototype() {
    setChoices({ ...defaultChoices });
    setOutcomes({ ...defaultOutcomes });
    setCursorId("start-input");
    setClicks(0);
    setRejected({});
    setExtras([]);
    setModeState("Pi Decides");
    setViewedPhaseId(null);
    setSessionMenuOpen(false);
    setPrototypeMenuOpen(false);
    setGeneralChat({ open: false, messages: [] });
    setShowProductDecisions(false);
    setHero(null);
    setSidebar({ open: true, tab: "record", highlight: null });
  }

  function setOutcome(key, raw) {
    const value = raw === "true" ? true : raw === "false" ? false : raw;
    const nextOutcomes = { ...outcomes, [key]: value };
    const clear = { conformance: { worker: null }, dnsConflict: { conflictResolution: null }, restore: { restoreDecision: null } }[key] || {};
    const nextChoices = { ...choices, ...clear };
    const sw = outcomeSwitches.find((s) => s.key === key);
    const rewindIdx = script.findIndex((b) => b.id === sw.rewindTo);
    const preferred = idx >= rewindIdx && rewindIdx >= 0 ? sw.rewindTo : cursorId;
    setOutcomes(nextOutcomes);
    setChoices(nextChoices);
    relocate({ mode, choices: nextChoices, outcomes: nextOutcomes }, preferred);
  }

  function advanceFrom(params) {
    const nextScript = buildScript(params);
    const here = nextScript.findIndex((b) => b.id === current.id);
    const next = nextScript[Math.min(here + 1, nextScript.length - 1)];
    if (next.phase > current.phase && !isGateSatisfied(currentGate)) {
      const decisionId = blockingDecisionByBeat[current.id];
      const reason = decisionId
        ? `${decisionId} is still unresolved: ${unresolvedProductDecisions[decisionId]}`
        : "The current Exit Gate is not satisfied.";
      setExtras((all) => [
        ...all,
        { phase: current.phase, after: current.id, actor: "Pi", text: `${reason} I will not open the next phase session yet.` },
      ]);
      return;
    }
    setViewedPhaseId(null);
    setSessionMenuOpen(false);
    setCursorId(next.id);
  }

  function doAction(action) {
    setClicks((n) => n + 1);
    if (action.tone === "reject") {
      setRejected((r) => ({ ...r, [current.id]: true }));
      return;
    }
    advanceFrom({ mode, choices, outcomes });
  }

  function pickOption(option) {
    setClicks((n) => n + 1);
    const nextChoices = { ...choices, ...option.set };
    setChoices(nextChoices);
    advanceFrom({ mode, choices: nextChoices, outcomes });
  }

  function reconsider() {
    setRejected((r) => ({ ...r, [current.id]: false }));
  }

  function openDetails(beat) {
    setSidebar({ open: true, tab: beat.detailsTab || "record", highlight: beat.id });
  }

  function askPiAboutCheck(check) {
    setViewedPhaseId(null);
    setExtras((all) => [
      ...all,
      { phase: current.phase, after: current.id, actor: "You", text: `Explain ${check.id} and help me satisfy it.`, isDecision: false },
      { phase: current.phase, after: current.id, actor: "Pi", text: `${check.label}: ${check.satisfies} I’ll inspect the linked source and receipts, then propose the next action.` },
    ]);
  }

  function startGeneralChat() {
    setViewedPhaseId(null);
    setSessionMenuOpen(false);
    setGeneralChat({ open: true, messages: [] });
  }

  function submitChat(event) {
    event.preventDefault();
    const field = event.target.elements.msg;
    const text = field.value.trim();
    if (!text) return;
    if (generalChat.open) {
      setGeneralChat((chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          { actor: "You", text },
          { actor: "Pi", text: "This prototype does not run Pi. In Server Guy, Pi would read the application record, inspect current sources when needed, and link factual claims to their receipts." },
        ],
      }));
      field.value = "";
      return;
    }
    const isQuestion = /[?？]\s*$/.test(text);
    setExtras((all) => [
      ...all,
      { phase: current.phase, after: current.id, actor: "You", text, isDecision: !isQuestion },
      {
        phase: current.phase,
        after: current.id,
        actor: "Pi",
        text: isQuestion
          ? "This prototype cannot reason. Server Guy would answer from the Operator Record and link each factual claim to a receipt."
          : "Recorded. Server Guy would save this as a Decision Record and show its source in the Record tab.",
        recorded: !isQuestion,
      },
    ]);
    field.value = "";
  }

  const userDecisions = extras
    .filter((message) => message.phase === displayPhaseId && message.actor === "You" && message.isDecision)
    .map((message) => message.text);

  return (
    <div className="vertical-shell">
      <header className="vertical-header">
        <div className="app-identity">
          <span className="brand-mark">SG</span>
          <div><h1>{identity.application}</h1><p>Production · <strong>Application Launch</strong></p></div>
        </div>
        <div className="header-right">
          <label className="mode-select">
            <span>Approval Mode</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <div className={`app-status tone-${statusTone(current.status)}`}>
            {current.status || (isGateSatisfied(currentGate) ? "Ready to advance" : "Working")}
          </div>
          <div className="prototype-menu-wrap">
            <button type="button" className="prototype-menu-trigger" aria-expanded={prototypeMenuOpen} onClick={() => setPrototypeMenuOpen((open) => !open)}>
              Prototype <span>16</span>
            </button>
            {prototypeMenuOpen && (
              <section className="prototype-menu" aria-label="Prototype controls">
                <div className="prototype-menu-head">
                  <div><strong>Prototype controls</strong><small>Scenario branches and unresolved choices</small></div>
                  <button type="button" onClick={() => setPrototypeMenuOpen(false)}>Close</button>
                </div>
                <button type="button" className="prototype-decisions-action" onClick={() => { setShowProductDecisions(true); setPrototypeMenuOpen(false); }}>
                  <span>Unresolved product decisions</span><strong>16</strong>
                </button>
                <div className="prototype-switches">
                  {outcomeSwitches.map((sw) => (
                    <label key={sw.key}>
                      <span>{sw.label}</span>
                      <select value={String(outcomes[sw.key])} onChange={(event) => setOutcome(sw.key, event.target.value)}>
                        {sw.values.map(([value, label]) => <option key={String(value)} value={String(value)}>{label}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="prototype-menu-foot">
                  <span>{clicks} prototype clicks</span>
                  <button type="button" onClick={resetPrototype}>Reset prototype</button>
                </div>
              </section>
            )}
          </div>
        </div>
      </header>

      <PhaseRail current={currentPhase} gate={currentGate} journeyComplete={journeyComplete} onOpenSession={(phaseId) => { setViewedPhaseId(phaseId); setSessionMenuOpen(false); setGeneralChat((chat) => ({ ...chat, open: false })); }} />

      <div className="vertical-body">
        <main className="chat-column" aria-label="Chat with Pi">
          <div className="session-bar">
            <div>
              <span>{generalChat.open ? "General application chat" : viewingArchived ? "Archived phase session" : journeyComplete ? "Application workspace" : "Current phase session"}</span>
              <strong>{generalChat.open ? "New chat" : journeyComplete && !viewingArchived ? "Launch complete · 9 phase chats archived" : `Phase ${phase.id} · ${phase.deliverable}`}</strong>
            </div>
            <div className="session-actions">
              {generalChat.open && <button type="button" onClick={() => setGeneralChat((chat) => ({ ...chat, open: false }))}>Return to launch</button>}
              {!generalChat.open && viewingArchived && <button type="button" onClick={() => setViewedPhaseId(null)}>Return to current session</button>}
              {!generalChat.open && (
                <button type="button" onClick={() => setSessionMenuOpen((open) => !open)}>
                  {completedPhases.length} archived
                </button>
              )}
              <button type="button" className="new-chat-button" onClick={startGeneralChat}>New chat</button>
            </div>
            {!generalChat.open && sessionMenuOpen && (
              <div className="session-menu">
                {completedPhases.length === 0 && <p>No archived phase sessions yet.</p>}
                {completedPhases.map((item) => (
                  <button key={item.id} type="button" onClick={() => { setViewedPhaseId(item.id); setSessionMenuOpen(false); }}>
                    <span>Phase {item.id}</span><strong>{item.deliverable}</strong><em>Archived · Gate passed</em>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="chat-scroll" ref={chatRef}>
            {generalChat.open ? (
              <>
                <article className="beat current general-chat-intro">
                  <div className="beat-meta"><span className="pi-avatar">Pi</span><strong>Pi</strong></div>
                  <p className="beat-text">Ask about the application, its server, recent changes, or a receipt. This chat is separate from the launch. The current phase chat stays open.</p>
                </article>
                {generalChat.messages.map((message, index) => (
                  <div key={`${message.actor}-${index}`} className={`extra-message ${message.actor === "Pi" ? "from-pi" : "from-you"}`}>
                    <strong>{message.actor}</strong><p>{message.text}</p>
                  </div>
                ))}
              </>
            ) : (
              <>
                {!viewingArchived && !journeyComplete && current.phase > 1 && visible.length > 0 && (
                  <div className="session-handoff">
                    <strong>Fresh phase chat</strong>
                    <span>Seeded from the Operator Record · Phase {current.phase - 1} chat archived</span>
                  </div>
                )}
                {visible.map((beat) => (
                  <div key={beat.id}>
                    <BeatBlock
                      beat={beat}
                      isCurrent={!viewingArchived && beat.id === current.id}
                      rejected={Boolean(rejected[beat.id])}
                      mode={mode}
                      setMode={setMode}
                      onAction={doAction}
                      onPick={pickOption}
                      onReconsider={reconsider}
                      onDetails={openDetails}
                      onHero={setHero}
                    />
                    {extras.filter((message) => message.phase === displayPhaseId && message.after === beat.id).map((m, i) => (
                      <div key={`${beat.id}-x-${i}`} className={`extra-message ${m.actor === "Pi" ? "from-pi" : "from-you"}`}>
                        <strong>{m.actor}</strong>
                        <p>{m.text}</p>
                        {m.recorded && <span className="recorded-chip">Saved to Record</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
          <form className="composer" onSubmit={submitChat}>
            <input name="msg" placeholder={generalChat.open ? `Ask Pi about ${identity.application}…` : viewingArchived ? "This phase chat is archived" : "Ask Pi, or tell it something that matters…"} aria-label="Message Pi" disabled={!generalChat.open && viewingArchived} />
            <div className="composer-row">
              <span>{generalChat.open ? "Separate from the launch. The current phase chat stays open." : "Answers link to receipts · decisions are saved to Record"}</span>
              <button type="submit" disabled={!generalChat.open && viewingArchived}>Send</button>
            </div>
          </form>
        </main>

        <Inspector
          open={sidebar.open}
          tab={sidebar.tab}
          highlight={sidebar.highlight}
          onTab={(tab) => setSidebar((s) => ({ ...s, tab }))}
          onToggle={() => setSidebar((s) => ({ ...s, open: !s.open }))}
          visible={visible}
          phase={phase}
          gate={displayGate}
          userDecisions={userDecisions}
          mode={mode}
          onHero={setHero}
          onAskPi={askPiAboutCheck}
        />
      </div>

      {hero && <HeroOverlay heroKey={hero} onClose={() => setHero(null)} />}
      {showProductDecisions && <ProductDecisionsOverlay relevant={relevantProductDecisions} onClose={() => setShowProductDecisions(false)} />}
    </div>
  );
}
