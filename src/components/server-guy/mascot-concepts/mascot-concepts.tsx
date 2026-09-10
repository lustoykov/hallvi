"use client";

import { Shuffle } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
} from "react";

import { LiveMascot, type LiveHandle } from "../mascot-family/live-mascot";
import { FAMILY, type FamilyId, type Member } from "../mascot-family/roster";
import { MascotStage } from "../mascot-family/stage";
import { StillMascot } from "../mascot-family/still-mascot";
import {
  MOOD_FOR,
  PROFILES,
  STATE_POSE,
  STATES,
  stateMeta,
  type StateId,
} from "./model";
import { MotionContext } from "./motion";
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

type Handles = Partial<Record<FamilyId, LiveHandle | null>>;

/**
 * The mascot family page: controls, six cards, the expressions sheet and
 * the terminal.
 */
export function MascotConcepts() {
  const systemReduced = useMedia("(prefers-reduced-motion: reduce)");
  const [reducedPick, setReducedPick] = useState<boolean | null>(null);
  const reduced = reducedPick ?? systemReduced;
  const hidden = usePageHidden();
  const [state, setState] = useState<StateId>("calm");
  const [selected, setSelected] = useState<FamilyId>("server");
  const [flash, setFlash] = useState<FamilyId | null>(null);
  const handles = useRef<Handles>({});
  const register = useCallback((id: FamilyId, x: LiveHandle | null) => {
    handles.current[id] = x;
  }, []);
  const lastSurprise = useRef<FamilyId | null>(null);
  const motion = useMemo(() => ({ reduced, hidden }), [reduced, hidden]);

  // Verified! is a moment: everyone celebrates, then the control settles
  // back to Calm.
  useEffect(() => {
    if (state !== "verified") return;
    const t = window.setTimeout(() => setState("calm"), 2000);
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
      const member = FAMILY[turn++ % FAMILY.length].id;
      const ms = handles.current[member]?.idle() ?? 0;
      last = now + ms;
    }, 1000);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, []);

  const surprise = () => {
    const pool = FAMILY.filter((m) => m.id !== lastSurprise.current);
    const id = pool[Math.floor(Math.random() * pool.length)].id;
    lastSurprise.current = id;
    document.getElementById(`mc-card-${id}`)?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
    handles.current[id]?.surprise();
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1800);
  };

  const meta = stateMeta(state);
  const member = FAMILY.find((m) => m.id === selected)!;

  return (
    <MotionContext.Provider value={motion}>
      <div
        className="mc-page"
        data-motion={reduced ? "reduced" : "full"}
        data-hidden={hidden ? "1" : undefined}
      >
        <header className="mc-head">
          <div className="mc-head-row">
            <div className="mc-title">
              <h1>Mascot family</h1>
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
            Little Server and five cousins for the agent that deploys and looks
            after your self-hosted software. Same screen face, same mitten
            hands, one job each. Hover and poke them, set the application state
            for all of them at once, or leave them alone for fifteen seconds.
          </p>
          <div className="mc-controls">
            <StateSelector value={state} onChange={setState} />
            <p className="mc-hint" aria-live="polite">
              <strong>{meta.label}</strong>{" "}
              {state === "verified"
                ? "A check just passed. Everyone celebrates once, then settles back to Calm."
                : `${meta.moment}. Drag the thumb or use the arrow keys; three quick pokes on a character for its favourite move.`}
            </p>
          </div>
        </header>

        <section className="mc-grid" aria-label="The family">
          {FAMILY.map((m, i) => (
            <FamilyCard
              key={m.id}
              member={m}
              state={state}
              index={i}
              selected={selected === m.id}
              flash={flash === m.id}
              reduced={reduced}
              onSelect={setSelected}
              register={register}
            />
          ))}
        </section>

        <ExpressionSheet member={member} reduced={reduced} />
        <TerminalPlayground member={member} />
      </div>
    </MotionContext.Provider>
  );
}

function FamilyCard({
  member: m,
  state,
  index,
  selected,
  flash,
  reduced,
  onSelect,
  register,
}: {
  member: Member;
  state: StateId;
  index: number;
  selected: boolean;
  flash: boolean;
  reduced: boolean;
  onSelect: (id: FamilyId) => void;
  register: (id: FamilyId, x: LiveHandle | null) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const h = useRef<LiveHandle | null>(null);
  const setHandle = useCallback(
    (x: LiveHandle | null) => {
      h.current = x;
      register(m.id, x);
    },
    [m.id, register],
  );
  const profile = PROFILES[m.id];
  const mood = MOOD_FOR[state];

  const onStageClick = (e: MouseEvent) => {
    // Pointer pokes happen on press and release; a keyboard click has detail 0.
    if (e.detail === 0) h.current?.poke();
  };

  return (
    <article
      id={`mc-card-${m.id}`}
      ref={cardRef}
      className="mc-card"
      data-member={m.id}
      data-selected={selected ? "1" : undefined}
      data-flash={flash ? "1" : undefined}
      onClick={() => onSelect(m.id)}
      style={{ "--mc-accent": m.paint } as CSSProperties}
    >
      <button
        type="button"
        className="mc-stage"
        aria-label={`Poke ${m.name}`}
        onPointerDown={(e) => {
          if (e.button === 0) h.current?.pressStart();
        }}
        onPointerUp={() => h.current?.pressEnd()}
        onPointerLeave={() => h.current?.pressEnd()}
        onClick={onStageClick}
      >
        <StageMotif member={m.id} />
        {selected && <span className="mc-selected">Selected</span>}
        <LiveMascot
          id={m.id}
          mood={mood}
          still={reduced}
          trackRef={cardRef}
          celebrateDelay={index * 70}
          handleRef={setHandle}
        />
      </button>
      <div className="mc-card-body">
        <div className="mc-card-title">
          <h3>{m.name}</h3>
          <span className="mc-species">{profile.role}</span>
        </div>
        <p className="mc-pitch">{profile.pitch}</p>
        <p className="mc-metaphor">{profile.metaphor}</p>
        <ul className="mc-words" aria-label="Personality">
          {profile.words.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <dl className="mc-moves">
          <div>
            <dt>Poke</dt>
            <dd>{profile.poke}</dd>
          </div>
          <div>
            <dt>Three pokes</dt>
            <dd>{m.danceName}</dd>
          </div>
          <div>
            <dt>Left alone</dt>
            <dd>{profile.idle}</dd>
          </div>
        </dl>
        <div className="mc-small">
          <span className="mc-small-label">At small sizes</span>
          <div className="mc-small-row">
            <figure>
              <span className="mc-tile">
                <StillMascot id={m.id} mood={mood} width={48} />
              </span>
              <figcaption>48 · nav mark</figcaption>
            </figure>
            <figure>
              <span className="mc-tile mc-tile--sm">
                <StillMascot id={m.id} mood={mood} width={24} />
              </span>
              <figcaption>24 · favicon</figcaption>
            </figure>
            <figure>
              <span className="mc-tile mc-tile--sm mc-tile--dark">
                <StillMascot id={m.id} mood={mood} width={24} />
              </span>
              <figcaption>24 · dark tab</figcaption>
            </figure>
            <span className="mc-accent">
              <i style={{ background: m.paint }} />
              {m.paintName}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

/** A few quiet strokes of each cousin's world behind it. */
function StageMotif({ member }: { member: FamilyId }) {
  const line = {
    fill: "none",
    stroke: "#d9dee7",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      className="mc-motif"
      viewBox="0 0 400 280"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {member === "server" && (
        <g {...line}>
          <rect x={34} y={56} width={42} height={30} rx={6} />
          <path d="M34 66 h42" />
          <rect x={326} y={74} width={36} height={26} rx={5} />
          <path d="M326 83 h36" />
        </g>
      )}
      {member === "tower" && (
        <g fill="#dde3ee">
          <path d="M322 46 a22 22 0 1 0 18 34 a17 17 0 1 1 -18 -34z" />
          <path d="M66 72 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
          <path d="M104 42 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
          <path d="M282 98 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z" />
        </g>
      )}
      {member === "rack" && (
        <g {...line}>
          <path d="M26 214 h66 M26 234 h66" />
          <path d="M312 206 h64 M312 226 h64" />
          <circle cx={34} cy={224} r={2.5} />
          <circle cx={368} cy={216} r={2.5} />
        </g>
      )}
      {member === "pip" && (
        <g {...line}>
          <path d="M34 70 h28 l14 14 h22" />
          <circle cx={102} cy={84} r={3.5} />
          <path d="M368 196 h-24 l-12 -12 h-18" />
          <circle cx={310} cy={184} r={3.5} />
        </g>
      )}
      {member === "vault" && (
        <g {...line}>
          <rect x={38} y={204} width={30} height={30} rx={5} />
          <rect x={46} y={196} width={30} height={30} rx={5} />
          <rect x={328} y={62} width={30} height={30} rx={5} />
          <path d="M336 62 v8 h14 v-8" />
        </g>
      )}
      {member === "relay" && (
        <g {...line}>
          <path d="M44 92 a34 34 0 0 1 48 0" />
          <path d="M54 102 a20 20 0 0 1 28 0" />
          <path d="M312 70 a34 34 0 0 1 48 0" />
          <path d="M322 80 a20 20 0 0 1 28 0" />
        </g>
      )}
    </svg>
  );
}

/**
 * Every state for the selected character. Tiles are still images from the
 * shared offscreen renderer; hovering one moves a single live canvas into it.
 */
function ExpressionSheet({
  member,
  reduced,
}: {
  member: Member;
  reduced: boolean;
}) {
  const live = useRef<MascotStage | null>(null);
  const stages = useRef<Partial<Record<StateId, HTMLDivElement | null>>>({});
  const [tile, setTile] = useState<{ w: number; h: number } | null>(null);

  // Stills render at the tile's size; measure one tile and follow resizes.
  useLayoutEffect(() => {
    const el = stages.current.calm;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w && h) setTile((t) => (t && t.w === w && t.h === h ? t : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(
    () => () => {
      live.current?.dispose();
      live.current = null;
    },
    [],
  );

  // A different character or reduced motion drops the live canvas.
  useEffect(() => {
    live.current?.unmount();
    Object.values(stages.current).forEach((el) => {
      if (el) delete el.dataset.live;
    });
  }, [member.id, reduced]);

  const enter = (s: StateId) => {
    const el = stages.current[s];
    if (reduced || !el) return;
    const stage = live.current ?? (live.current = MascotStage.create("stage"));
    if (!stage) return;
    stage.setMember(member.id);
    stage.setMood(MOOD_FOR[s], true);
    stage.mount(el);
    el.dataset.live = "1";
    if (s === "verified") stage.play("celebrate");
    if (s === "failed") stage.play("flinch");
  };
  const leave = (s: StateId) => {
    const el = stages.current[s];
    if (el) delete el.dataset.live;
    live.current?.unmount();
  };

  return (
    <section className="mc-section" aria-labelledby="mc-sheet-title">
      <div className="mc-section-head">
        <div>
          <h2 id="mc-sheet-title">Expressions · {member.name}</h2>
          <p>
            Each application state for the selected character. Poses are held
            still; hover one to play its motion. Select another card above to
            switch.
          </p>
        </div>
      </div>
      <div className="mc-sheet">
        {STATES.map((s) => {
          const I = STATE_ICONS[s.id];
          const extra = PROFILES[member.id].signature[s.id];
          return (
            <figure
              key={s.id}
              className="mc-sheet-item"
              data-state={s.id}
              onPointerEnter={() => enter(s.id)}
              onPointerLeave={() => leave(s.id)}
            >
              <div
                className="mc-sheet-stage"
                ref={(el) => {
                  stages.current[s.id] = el;
                }}
              >
                {tile && (
                  <StillMascot
                    key={member.id}
                    id={member.id}
                    mood={MOOD_FOR[s.id]}
                    width={tile.w}
                    height={tile.h}
                    framing="stage"
                  />
                )}
                {s.id === "verified" && (
                  <span className="mc-sheet-glyph" aria-hidden="true" />
                )}
                {s.id === "stale" && (
                  <span className="mc-sheet-z" aria-hidden="true">
                    z
                  </span>
                )}
              </div>
              <figcaption>
                <span className="mc-chip" data-tone={s.tone}>
                  <I size={12} weight="bold" aria-hidden="true" />
                  {s.label}
                </span>
                <span className="mc-moment">{s.moment}</span>
                <code className="mc-params">
                  {STATE_POSE[s.id]}
                  {extra ? ` · ${extra}` : ""}
                </code>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
