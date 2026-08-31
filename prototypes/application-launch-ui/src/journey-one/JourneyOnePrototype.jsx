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

function primaryChatForPhase(phaseId) {
  const phase = journeyOnePhases[phaseId - 1];
  return {
    id: `phase-${phaseId}-primary`,
    title: phase.deliverable,
    status: "Active",
    primary: true,
    messages: [],
  };
}

function initialPhaseChats() {
  return { 1: [primaryChatForPhase(1)] };
}

function titleFromMessage(message) {
  const clean = message.replace(/[?!.]+$/g, "").trim();
  if (!clean) return "New chat";
  return clean.length > 34 ? `${clean.slice(0, 33)}…` : clean;
}

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
  const [phaseChats, setPhaseChats] = useState(initialPhaseChats);
  const [activeChatByPhase, setActiveChatByPhase] = useState({ 1: "phase-1-primary" });
  const [viewedPhaseId, setViewedPhaseId] = useState(null);
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
  const displayChats = phaseChats[displayPhaseId] || [primaryChatForPhase(displayPhaseId)];
  const activeChatId = activeChatByPhase[displayPhaseId] || displayChats[0].id;
  const activeChat = displayChats.find((chat) => chat.id === activeChatId) || displayChats[0];
  const showingPrimaryChat = Boolean(activeChat?.primary);
  const relevantProductDecisions = [
    ...productDecisionsForPhase(displayPhaseId),
    ...visible.flatMap((beat) => beat.openDecisions),
  ].filter((decision, index, all) => all.findIndex((item) => item.id === decision.id) === index);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [cursorId, extras.length, viewedPhaseId, activeChatId, activeChat?.messages.length]);

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
    setPhaseChats(initialPhaseChats());
    setActiveChatByPhase({ 1: "phase-1-primary" });
    setViewedPhaseId(null);
    setPrototypeMenuOpen(false);
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
        { phase: current.phase, after: current.id, chatId: `phase-${current.phase}-primary`, actor: "Pi", text: `${reason} I will not complete this phase yet.` },
      ]);
      return;
    }
    if (next.phase > current.phase) {
      const nextPrimary = primaryChatForPhase(next.phase);
      setPhaseChats((all) => ({
        ...all,
        [current.phase]: (all[current.phase] || []).map((chat) => ({ ...chat, status: "Resolved" })),
        [next.phase]: all[next.phase] || [nextPrimary],
      }));
      setActiveChatByPhase((all) => ({ ...all, [next.phase]: all[next.phase] || nextPrimary.id }));
    } else if (next.id === "workspace") {
      setPhaseChats((all) => ({
        ...all,
        [current.phase]: (all[current.phase] || []).map((chat) => ({ ...chat, status: "Resolved" })),
      }));
    }
    setViewedPhaseId(null);
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
      { phase: current.phase, after: current.id, chatId: `phase-${current.phase}-primary`, actor: "You", text: `Explain “${check.label}” and help me satisfy it.`, isDecision: false },
      { phase: current.phase, after: current.id, chatId: `phase-${current.phase}-primary`, actor: "Pi", text: `${check.label}: ${check.satisfies} I’ll inspect the linked source and receipts, then propose the next action.` },
    ]);
  }

  function createPhaseChat() {
    if (viewingArchived || journeyComplete) return;
    const phaseId = current.phase;
    const id = `phase-${phaseId}-chat-${Date.now()}`;
    const chat = { id, title: "New chat", status: "Active", primary: false, messages: [] };
    setPhaseChats((all) => ({ ...all, [phaseId]: [...(all[phaseId] || [primaryChatForPhase(phaseId)]), chat] }));
    setActiveChatByPhase((all) => ({ ...all, [phaseId]: id }));
  }

  function openPhaseChat(phaseId, chatId) {
    setViewedPhaseId(phaseId === current.phase && !journeyComplete ? null : phaseId);
    setActiveChatByPhase((all) => ({ ...all, [phaseId]: chatId }));
  }

  function returnToCurrentPhase() {
    setViewedPhaseId(null);
    const currentChats = phaseChats[current.phase] || [primaryChatForPhase(current.phase)];
    setActiveChatByPhase((all) => ({ ...all, [current.phase]: all[current.phase] || currentChats[0].id }));
  }

  function submitChat(event) {
    event.preventDefault();
    const field = event.target.elements.msg;
    const text = field.value.trim();
    if (!text) return;
    const isQuestion = /[?？]\s*$/.test(text);
    if (!showingPrimaryChat) {
      setPhaseChats((all) => ({
        ...all,
        [displayPhaseId]: (all[displayPhaseId] || []).map((chat) => {
          if (chat.id !== activeChatId) return chat;
          const title = chat.messages.length === 0 ? titleFromMessage(text) : chat.title;
          return {
            ...chat,
            title,
            messages: [
              ...chat.messages,
              { actor: "You", text, isDecision: !isQuestion },
              {
                actor: "Pi",
                text: isQuestion
                  ? "This prototype cannot reason. Server Guy would answer from the shared Phase Workspace and link factual claims to receipts."
                  : "Recorded in the shared Phase Workspace. Other chats in this phase can use the decision without importing this transcript.",
                recorded: !isQuestion,
              },
            ],
          };
        }),
      }));
      field.value = "";
      return;
    }
    setExtras((all) => [
      ...all,
      { phase: current.phase, after: current.id, chatId: activeChatId, actor: "You", text, isDecision: !isQuestion },
      {
        phase: current.phase,
        after: current.id,
        chatId: activeChatId,
        actor: "Pi",
        text: isQuestion
          ? "This prototype cannot reason. Server Guy would answer from the Operator Record and link each factual claim to a receipt."
          : "Recorded. Server Guy would save this as a Decision Record and show its source in the Record tab.",
        recorded: !isQuestion,
      },
    ]);
    field.value = "";
  }

  const primaryDecisions = extras
    .filter((message) => message.phase === displayPhaseId && message.actor === "You" && message.isDecision)
    .map((message) => message.text);
  const focusedChatDecisions = displayChats
    .flatMap((chat) => chat.messages)
    .filter((message) => message.actor === "You" && message.isDecision)
    .map((message) => message.text);
  const userDecisions = [...primaryDecisions, ...focusedChatDecisions];

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

      <PhaseRail current={currentPhase} gate={currentGate} journeyComplete={journeyComplete} onOpenSession={(phaseId) => setViewedPhaseId(phaseId)} />

      <div className="vertical-body">
        <aside className="phase-chat-sidebar" aria-label={`Phase ${phase.id} chats`}>
          <div className="phase-chat-head">
            <div><span>Phase {phase.id} chats</span><strong>{phase.short}</strong></div>
            {!viewingArchived && !journeyComplete && <button type="button" onClick={createPhaseChat}>New chat</button>}
          </div>
          <div className="phase-chat-list">
            {displayChats.map((chat) => (
              <button key={chat.id} type="button" className={`phase-chat-item ${chat.id === activeChatId ? "active" : ""}`} onClick={() => openPhaseChat(displayPhaseId, chat.id)}>
                <span className="phase-chat-icon">{chat.primary ? "Pi" : "#"}</span>
                <span className="phase-chat-copy"><strong>{chat.title}</strong><small>{chat.primary ? "Main phase chat" : "Focused chat"}</small></span>
                <em className={`chat-status status-${chat.status.toLowerCase()}`}>{chat.status}</em>
              </button>
            ))}
          </div>
          {(viewingArchived || journeyComplete) && <p className="phase-chat-readonly">Gate passed · chats are read-only</p>}
          <p className="phase-chat-footnote">Chats share this phase’s Record and Exit Gate. Their transcripts stay separate.</p>
        </aside>
        <main className="chat-column" aria-label="Chat with Pi">
          <div className="session-bar">
            <div>
              <span>{viewingArchived ? "Read-only phase chat" : journeyComplete ? "Application workspace" : `Working toward ${phase.deliverable}`}</span>
              <strong>{journeyComplete && !viewingArchived ? "Launch complete" : activeChat.title}</strong>
            </div>
            <div className="session-actions">
              {viewingArchived && <button type="button" onClick={returnToCurrentPhase}>Return to current phase</button>}
            </div>
          </div>
          <div className="chat-scroll" ref={chatRef}>
            {!showingPrimaryChat ? (
              <>
                <article className="beat current general-chat-intro">
                  <div className="beat-meta"><span className="pi-avatar">Pi</span><strong>Pi</strong></div>
                  <p className="beat-text">This is a focused chat for Phase {phase.id}. I can use the shared Phase Workspace, but I do not import sibling chat transcripts. What should we focus on?</p>
                </article>
                {activeChat.messages.map((message, index) => (
                  <div key={`${message.actor}-${index}`} className={`extra-message ${message.actor === "Pi" ? "from-pi" : "from-you"}`}>
                    <strong>{message.actor}</strong><p>{message.text}</p>{message.recorded && <span className="recorded-chip">Saved to shared Record</span>}
                  </div>
                ))}
              </>
            ) : (
              <>
                {!viewingArchived && !journeyComplete && current.phase > 1 && visible.length > 0 && (
                  <div className="session-handoff">
                    <strong>New Phase Workspace</strong>
                    <span>Seeded from the Operator Record · previous phase chats are read-only</span>
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
                    {extras.filter((message) => message.phase === displayPhaseId && message.after === beat.id && (!message.chatId || message.chatId === activeChatId)).map((m, i) => (
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
            <input name="msg" placeholder={viewingArchived || journeyComplete ? "This phase chat is read-only" : "Ask Pi, or tell it something that matters…"} aria-label="Message Pi" disabled={viewingArchived || journeyComplete} />
            <div className="composer-row">
              <span>Answers link to receipts · decisions are saved to the shared Record</span>
              <button type="submit" disabled={viewingArchived || journeyComplete}>Send</button>
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
