"use client";

import { Shuffle } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
} from "react";

import { Mascot, MotionContext, type MascotHandle } from "./mascot";
import {
  CONCEPTS,
  EXPRESSIONS,
  STATES,
  describeExpression,
  stateMeta,
  type Concept,
  type ConceptId,
  type StateId,
} from "./model";
import { STATE_ICONS, StateSelector } from "./state-selector";
import { TerminalPlayground } from "./terminal-playground";

import "./mascot-concepts.css";

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function usePageHidden() {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.hidden,
    () => false,
  );
}

type Handles = Partial<Record<ConceptId, MascotHandle | null>>;

/** The mascot exploration page: controls, six concept cards, the expressions sheet and the terminal. */
export function MascotConcepts() {
  const systemReduced = useMedia("(prefers-reduced-motion: reduce)");
  const [reducedPick, setReducedPick] = useState<boolean | null>(null);
  const reduced = reducedPick ?? systemReduced;
  const hidden = usePageHidden();
  const [state, setState] = useState<StateId>("calm");
  const [selected, setSelected] = useState<ConceptId>("otter");
  const [flash, setFlash] = useState<ConceptId | null>(null);
  const handles = useRef<Handles>({});
  const lastSurprise = useRef<ConceptId | null>(null);
  const motion = useMemo(() => ({ reduced, hidden }), [reduced, hidden]);

  // Verified! is a moment: everyone celebrates, then the control settles back to Calm.
  useEffect(() => {
    if (state !== "verified") return;
    const t = window.setTimeout(() => setState("calm"), 1500);
    return () => clearTimeout(t);
  }, [state]);

  // After 15 s without input, one character at a time plays its idle behaviour.
  useEffect(() => {
    let last = performance.now();
    let turn = 0;
    const bump = () => {
      last = Math.max(last, performance.now());
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = window.setInterval(() => {
      const now = performance.now();
      if (document.hidden || now - last < 15000) return;
      const c = CONCEPTS[turn++ % CONCEPTS.length].id;
      const ms = handles.current[c]?.idle() ?? 0;
      last = now + ms;
    }, 1000);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, []);

  const surprise = () => {
    const pool = CONCEPTS.filter((c) => c.id !== lastSurprise.current);
    const c = pool[Math.floor(Math.random() * pool.length)].id;
    lastSurprise.current = c;
    document.getElementById(`mc-card-${c}`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
    handles.current[c]?.surprise();
    setFlash(c);
    window.setTimeout(() => setFlash((f) => (f === c ? null : f)), 1800);
  };

  const meta = stateMeta(state);
  const concept = CONCEPTS.find((c) => c.id === selected)!;

  return (
    <MotionContext.Provider value={motion}>
      <div className="mc-page" data-motion={reduced ? "reduced" : "full"} data-hidden={hidden ? "1" : undefined}>
        <header className="mc-head">
          <div className="mc-head-row">
            <div className="mc-title">
              <h1>Mascot concepts</h1>
              <span className="mc-tag">Prototype · invented states</span>
            </div>
            <div className="mc-head-actions">
              <button
                type="button"
                role="switch"
                aria-checked={reduced}
                className="mc-switch"
                onClick={() => setReducedPick(!reduced)}
              >
                <span className="mc-switch-track" aria-hidden="true">
                  <span className="mc-switch-knob" />
                </span>
                Reduced motion
              </button>
              <button type="button" className="mc-btn" onClick={surprise}>
                <Shuffle size={14} weight="bold" aria-hidden="true" />
                Surprise me
              </button>
            </div>
          </div>
          <p className="mc-lede">
            Six characters for the agent that deploys and looks after your self-hosted software. Hover and poke them, set
            the application state for all of them at once, or leave them alone for fifteen seconds.
          </p>
          <div className="mc-controls">
            <StateSelector value={state} onChange={setState} />
            <p className="mc-hint" aria-live="polite">
              <strong>{meta.label}</strong>{" "}
              {state === "verified"
                ? "A check just passed. Everyone celebrates once, then settles back to Calm."
                : `${meta.moment}. Drag the thumb or use the arrow keys; three quick pokes on a character for a surprise.`}
            </p>
          </div>
        </header>

        <section className="mc-grid" aria-label="Concepts">
          {CONCEPTS.map((c, i) => (
            <ConceptCard
              key={c.id}
              concept={c}
              state={state}
              index={i}
              selected={selected === c.id}
              flash={flash === c.id}
              onSelect={setSelected}
              handles={handles}
            />
          ))}
        </section>

        <ExpressionSheet concept={concept} />
        <TerminalPlayground concept={selected} />
      </div>
    </MotionContext.Provider>
  );
}

function ConceptCard({
  concept: c,
  state,
  index,
  selected,
  flash,
  onSelect,
  handles,
}: {
  concept: Concept;
  state: StateId;
  index: number;
  selected: boolean;
  flash: boolean;
  onSelect: (id: ConceptId) => void;
  handles: { current: Handles };
}) {
  const cardRef = useRef<HTMLElement>(null);
  const h = useRef<MascotHandle | null>(null);
  const setHandle = useCallback(
    (x: MascotHandle | null) => {
      h.current = x;
      handles.current[c.id] = x;
    },
    [c.id, handles],
  );

  const onStageClick = (e: MouseEvent) => {
    // Pointer pokes happen on press and release; a keyboard click has detail 0.
    if (e.detail === 0) h.current?.poke();
  };

  return (
    <article
      id={`mc-card-${c.id}`}
      ref={cardRef}
      className="mc-card"
      data-concept={c.id}
      data-selected={selected ? "1" : undefined}
      data-flash={flash ? "1" : undefined}
      onClick={() => onSelect(c.id)}
      style={{ "--mc-accent": c.accent } as CSSProperties}
    >
      <button
        type="button"
        className="mc-stage"
        aria-label={`Poke ${c.name} the ${c.species.toLowerCase()}`}
        onPointerDown={(e) => {
          if (e.button === 0) h.current?.pressStart();
        }}
        onPointerUp={() => h.current?.pressEnd()}
        onPointerLeave={() => h.current?.pressEnd()}
        onClick={onStageClick}
      >
        <StageMotif concept={c.id} />
        {selected && <span className="mc-selected">Selected</span>}
        <Mascot
          concept={c.id}
          state={state}
          size={236}
          live
          track
          trackRef={cardRef}
          celebrateDelay={index * 70}
          handleRef={setHandle}
        />
      </button>
      <div className="mc-card-body">
        <div className="mc-card-title">
          <h3>{c.name}</h3>
          <span className="mc-species">{c.species}</span>
        </div>
        <p className="mc-pitch">{c.pitch}</p>
        <p className="mc-metaphor">{c.metaphor}</p>
        <ul className="mc-words" aria-label="Personality">
          {c.words.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="mc-small">
          <span className="mc-small-label">At small sizes</span>
          <div className="mc-small-row">
            <figure>
              <span className="mc-tile">
                <Mascot concept={c.id} state={state} size={48} />
              </span>
              <figcaption>48 · nav mark</figcaption>
            </figure>
            <figure>
              <span className="mc-tile mc-tile--sm">
                <Mascot concept={c.id} state={state} size={24} />
              </span>
              <figcaption>24 · favicon</figcaption>
            </figure>
            <figure>
              <span className="mc-tile mc-tile--sm mc-tile--dark">
                <Mascot concept={c.id} state={state} size={24} />
              </span>
              <figcaption>24 · dark tab</figcaption>
            </figure>
            <span className="mc-accent">
              <i style={{ background: c.accent }} />
              {c.accentName}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** A few quiet strokes of each character's world behind it. */
function StageMotif({ concept }: { concept: ConceptId }) {
  const common = { fill: "none", stroke: "#d9dee7", strokeWidth: 2, strokeLinecap: "round" as const };
  return (
    <svg className="mc-motif" viewBox="0 0 400 280" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {concept === "otter" && (
        <g {...common}>
          <path d="M40 236 q14 -8 28 0 t28 0 t28 0" />
          <path d="M280 248 q14 -8 28 0 t28 0 t28 0" />
          <path d="M300 60 q10 -6 20 0 t20 0" />
        </g>
      )}
      {concept === "crab" && (
        <g fill="#dcd4c8">
          {[
            [52, 250], [72, 242], [96, 256], [300, 246], [326, 256], [348, 240], [64, 262], [336, 264],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={2.2} />
          ))}
        </g>
      )}
      {concept === "tardigrade" && (
        <g {...common}>
          <path d="M54 70 q-8 12 0 16 q8 -4 0 -16z" />
          <path d="M338 92 q-6 9 0 12 q6 -3 0 -12z" />
          <circle cx={318} cy={228} r={5} />
          <circle cx={72} cy={214} r={3.5} />
        </g>
      )}
      {concept === "lantern" && (
        <g>
          <path d="M318 44 a22 22 0 1 0 18 34 a17 17 0 1 1 -18 -34z" fill="#dfe4f0" />
          <path d="M70 70 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#dfe4f0" />
          <path d="M104 40 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" fill="#dfe4f0" />
        </g>
      )}
      {concept === "beaver" && (
        <g {...common}>
          <rect x={46} y={240} width={34} height={9} rx={4.5} />
          <rect x={318} y={248} width={28} height={8} rx={4} />
          <path d="M330 232 l8 -4 M60 228 l-6 -5" />
        </g>
      )}
      {concept === "mote" && (
        <g fill="#dde3ec">
          <circle cx={70} cy={80} r={3} />
          <circle cx={96} cy={52} r={2} />
          <circle cx={326} cy={70} r={2.6} />
          <circle cx={344} cy={210} r={2} />
        </g>
      )}
    </svg>
  );
}

function ExpressionSheet({ concept: c }: { concept: Concept }) {
  const refs = useRef<Partial<Record<StateId, MascotHandle | null>>>({});
  const setters = useMemo(
    () =>
      Object.fromEntries(
        STATES.map((s) => [s.id, (x: MascotHandle | null) => void (refs.current[s.id] = x)]),
      ) as Record<StateId, (x: MascotHandle | null) => void>,
    [],
  );

  return (
    <section className="mc-section" aria-labelledby="mc-sheet-title">
      <div className="mc-section-head">
        <div>
          <h2 id="mc-sheet-title">Expressions · {c.name}</h2>
          <p>
            Each application state for the selected concept. Poses are held still; hover one to play its motion. Select
            another card above to switch.
          </p>
        </div>
      </div>
      <div className="mc-sheet">
        {STATES.map((s) => {
          const I = STATE_ICONS[s.id];
          return (
            <figure
              key={s.id}
              className="mc-sheet-item"
              onPointerEnter={() => {
                if (s.id === "verified") refs.current.verified?.celebrate();
              }}
            >
              <div className="mc-sheet-stage">
                <Mascot
                  key={c.id}
                  concept={c.id}
                  state={s.id}
                  size={112}
                  className="mc-still"
                  handleRef={setters[s.id]}
                />
              </div>
              <figcaption>
                <span className="mc-chip" data-tone={s.tone}>
                  <I size={12} weight="bold" aria-hidden="true" />
                  {s.label}
                </span>
                <span className="mc-moment">{s.moment}</span>
                <code className="mc-params">{describeExpression(EXPRESSIONS[s.id])}</code>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
