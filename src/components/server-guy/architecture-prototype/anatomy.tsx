"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction C — Exploded server. The one server as an object you can pull
// apart: the host, its disk, the private network, the services, and the
// cover whose doors are the ways in. A lens re-lights the same object for
// one question at a time; callouts read like an engineering plate. The
// missing pieces are drawn as ghosts where they would go. Three.js.

import {
  ArrowCounterClockwise,
  ArrowRight,
  ChatCircleText,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { applicationSections } from "../application-sections";
import type { MascotMood } from "../home/mascot-scene";
import type { Kit } from "./anatomy-kit";
import { AnatomyScene, type Lens, type ScenePart } from "./anatomy-scene";
import { CertaintyTag, FactList } from "./bits";
import type { DirectionProps } from "./index";
import { ago, type ArchitectureModel, type Gap, type Part } from "./model";
import {
  burstAt,
  reducedMotion,
  sparklePalettes,
  stepSpring,
  useReducedMotion,
  type Spring,
} from "./motion";
import { TactileSlider } from "./tactile-slider";
import "./anatomy.css";

const LittleServer = dynamic(
  () => import("../home/mascot-scene").then((module) => module.MascotScene),
  { ssr: false },
);

/** Model styles for the same scene; each is a kit in ./kits. */
type ModelId = "clay" | "chassis" | "glass" | "sketch";
const models: { id: ModelId; label: string; hint: string }[] = [
  { id: "clay", label: "Clay", hint: "Little Server's world, a toy diorama" },
  { id: "chassis", label: "Chassis", hint: "A premium machine in aluminium" },
  { id: "glass", label: "Glass", hint: "Frosted glass you can see into" },
  { id: "sketch", label: "Sketch", hint: "The plain reference model" },
];

const lenses: { id: Lens; label: string; hint: string }[] = [
  {
    id: "structure",
    label: "What's inside",
    hint: "The parts, and what holds what",
  },
  {
    id: "exposure",
    label: "Ways in",
    hint: "What can be reached from outside, and by whom",
  },
  {
    id: "data",
    label: "Your data",
    hint: "What must survive, and where its copies go",
  },
  {
    id: "certainty",
    label: "How sure",
    hint: "Each part tinted by the age of its evidence",
  },
];

const lensNote: Record<Lens, string> = {
  structure:
    "Bottom to top: the server, its disk, the private network, the services, and the cover whose doors are the ways in.",
  exposure:
    "Blue is the way in: port 80, and only for your network. Prometheus has no door at all.",
  data: "What must survive lives on the disk; every night a copy leaves the server.",
  certainty:
    "Green while the evidence is under a day old, amber when older, grey if never observed.",
};

function gapPart(gap: Gap): Part {
  return {
    id: `gap:${gap.id}`,
    kind: "tls",
    name: gap.id === "monitoring" ? "Monitoring" : gap.title,
    role: gap.title,
    plain: gap.detail,
    facts: [],
    evidence: {
      certainty: "absent",
      short: "Not set up",
      detail: gap.detail,
      at: null,
    },
    destination: gap.destination,
  };
}

function inFocus(part: Part, lens: Lens) {
  if (part.id.startsWith("gap:")) return lens !== "exposure" && lens !== "data";
  if (lens === "exposure")
    return ["gate", "tls", "web", "private", "controller"].includes(part.kind);
  if (lens === "data") return part.kind === "volume" || part.kind === "offsite";
  return true;
}

function lensLine(part: Part, lens: Lens, model: ArchitectureModel) {
  const fact = (label: string) =>
    part.facts.find((item) => item.label === label)?.value;
  if (lens === "certainty") return null;
  if (lens === "exposure") {
    if (part.id === "gate:http")
      return model.restricted
        ? `Open only to ${fact("Allowed from") ?? "your network"}`
        : "Open to everyone";
    if (part.id === "gate:ssh") return "SSH, for Server Guy's key";
    if (part.id === "tls") return "No encryption yet";
    if (part.kind === "web") return "Reached through port 80";
    if (part.kind === "private") return "No way in from outside";
    if (part.kind === "controller") return "The one network let in";
  }
  if (lens === "data") {
    if (part.kind === "volume")
      return part.evidence.certainty === "absent"
        ? "Only on this disk"
        : (fact("Off-site copy") ?? part.role);
    if (part.kind === "offsite") return fact("Schedule") ?? part.role;
  }
  if (part.kind === "controller") return "your network";
  return part.role;
}

const sectionLabel = (id: string | undefined) =>
  applicationSections.find((section) => section.id === id)?.label ?? id;

function draftFor(part: Part, model: ArchitectureModel) {
  if (part.id === "gap:monitoring")
    return `Watch ${model.headline} continuously and tell me when something fails.`;
  switch (part.evidence.certainty) {
    case "failed":
      return `Investigate why ${part.name} isn't answering.`;
    case "stale":
      return `Re-check ${part.name}; the last evidence is ${ago(part.evidence.at, model.now)}.`;
    case "absent":
      return part.id === "tls"
        ? `Set up a domain with HTTPS for ${model.headline}.`
        : `Set up ${part.name.toLowerCase()} for ${model.headline}.`;
    case "unknown":
      return `Read ${part.name} back and tell me what you find.`;
    default:
      return `Explain ${part.name} in more detail.`;
  }
}

/** A physical control: the thumb follows your finger, the object follows the thumb on a spring. */
function ApartControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const setFrom = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;
    onChange(
      Math.max(0, Math.min(1, (clientX - rect.left - 14) / (rect.width - 28))),
    );
  };
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 0.1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -0.1
          : 0;
    if (event.key === "Home") onChange(0);
    else if (event.key === "End") onChange(1);
    else if (step) onChange(Math.max(0, Math.min(1, value + step)));
    else return;
    event.preventDefault();
  }
  return (
    <div className="axc-apart">
      <span>Assembled</span>
      <div
        ref={track}
        className={`axc-apart-track${dragging ? " is-dragging" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Pull the server apart"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          setFrom(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging) setFrom(event.clientX);
        }}
        onPointerUp={(event) => {
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => onChange(value > 0.5 ? 0 : 1)}
        onKeyDown={onKey}
      >
        <span
          className="axc-apart-fill"
          style={{ width: `calc(${value} * (100% - 28px) + 22px)` }}
        />
        {[0, 0.5, 1].map((tick) => (
          <span
            key={tick}
            className="axc-apart-tick"
            style={{ left: `calc(${tick} * (100% - 28px) + 14px)` }}
          />
        ))}
        <span
          className="axc-apart-thumb"
          style={{ left: `calc(${value} * (100% - 28px) + 3px)` }}
        />
      </div>
      <span>Apart</span>
    </div>
  );
}

export function AnatomyDirection({
  model,
  recheck,
  onOpenDestination,
  onAsk,
}: DirectionProps) {
  const [lens, setLens] = useState<Lens>("structure");
  const [apart, setApart] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [glFailed, setGlFailed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [mood, setMood] = useState<MascotMood | null>(null);
  const [gesture, setGesture] = useState(0);
  const [modelId, setModelId] = useState<ModelId>("clay");
  const reduced = useReducedMotion();
  const modelPicker = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const scene = useRef<AnatomyScene | null>(null);
  const callouts = useRef<Record<string, HTMLButtonElement | null>>({});
  const leaders = useRef<Record<string, SVGPathElement | null>>({});
  const dots = useRef<Record<string, SVGCircleElement | null>>({});
  const caretaker = useRef<HTMLDivElement>(null);
  const explode = useRef<Spring>({ x: 0, v: 0 });
  const explodeTarget = useRef(0);
  const springRaf = useRef(0);

  const monitoringGap = model.gaps.find((gap) => gap.id === "monitoring");
  const parts = useMemo(
    () => [...model.parts, ...(monitoringGap ? [gapPart(monitoringGap)] : [])],
    [model.parts, monitoringGap],
  );
  const byId = useMemo(
    () => Object.fromEntries(parts.map((part) => [part.id, part])),
    [parts],
  );
  const sceneParts = useMemo<ScenePart[]>(
    () =>
      parts.map((part) => ({
        id: part.id,
        kind: part.id.startsWith("gap:") ? "gap" : part.kind,
        label: part.name,
        certainty: part.evidence.certainty,
        checking: Boolean(part.checking),
        owner: part.owner,
      })),
    [parts],
  );
  const hostLabel = `${model.byId.host?.name ?? "Server"}${model.region ? ` · ${model.region.split(", ")[0]}` : ""}`;

  const ids = useRef<string[]>([]);
  useEffect(() => {
    ids.current = parts.map((part) => part.id);
  }, [parts]);

  const place = useCallback(() => {
    const instance = scene.current;
    const box = stage.current;
    if (!instance || !box) return;
    const width = box.clientWidth;
    const height = box.clientHeight;
    // Half the callouts on each side, by where their parts sit, then each
    // column resolves overlaps top-down and bottom-up so none leave the plate.
    const entries: { id: string; x: number; y: number }[] = [];
    for (const id of ids.current) {
      const anchor = instance.anchor(id);
      if (anchor) entries.push({ id, ...anchor });
    }
    entries.sort((a, b) => a.x - b.x);
    const half = Math.ceil(entries.length / 2);
    const sides = { left: entries.slice(0, half), right: entries.slice(half) };
    for (const side of ["left", "right"] as const) {
      const list = sides[side]
        .filter((entry) => callouts.current[entry.id])
        .sort((a, b) => a.y - b.y);
      const heights = list.map(
        (entry) => callouts.current[entry.id]!.offsetHeight,
      );
      const top = 12;
      const bottom = height - 40;
      const sum = heights.reduce((total, h) => total + h, 0);
      const gap =
        list.length > 1
          ? Math.max(2, Math.min(8, (bottom - top - sum) / (list.length - 1)))
          : 8;
      const ys: number[] = [];
      let cursor = top;
      list.forEach((entry, i) => {
        ys[i] = Math.max(cursor, entry.y - heights[i] / 2);
        cursor = ys[i] + heights[i] + gap;
      });
      let limit = bottom;
      for (let i = list.length - 1; i >= 0; i--) {
        if (ys[i] + heights[i] > limit) ys[i] = limit - heights[i];
        limit = ys[i] - gap;
      }
      // Never above the plate: when a column is too full, it runs long instead.
      if (ys.length && ys[0] < top) {
        const shift = top - ys[0];
        for (let i = 0; i < ys.length; i++) ys[i] += shift;
      }
      list.forEach((entry, i) => {
        const element = callouts.current[entry.id]!;
        const w = element.offsetWidth;
        const h = heights[i];
        const y = ys[i];
        const x = side === "left" ? 14 : width - 14 - w;
        element.style.transform = `translate(${x}px, ${y}px)`;
        element.dataset.side = side;
        const cx = side === "left" ? x + w + 4 : x - 4;
        const cy = y + Math.min(h / 2, 15);
        const knee = side === "left" ? cx + 22 : cx - 22;
        leaders.current[entry.id]?.setAttribute(
          "d",
          `M${cx} ${cy}H${knee}L${entry.x} ${entry.y}`,
        );
        const dot = dots.current[entry.id];
        if (dot) {
          dot.setAttribute("cx", String(entry.x));
          dot.setAttribute("cy", String(entry.y));
        }
      });
    }
    const roof = instance.roof();
    if (caretaker.current)
      caretaker.current.style.transform = `translate(${roof.x}px, ${roof.y}px) translate(-50%, -84%)`;
  }, []);

  // The scene is created once and lives as long as the direction does.
  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    let instance: AnatomyScene;
    try {
      instance = new AnatomyScene(host, {
        onHover: (id) => setHovered(id),
        onSelect: (id) => setSelected(id),
        onFrame: () => place(),
      });
    } catch {
      const timer = window.setTimeout(() => setGlFailed(true), 0);
      return () => window.clearTimeout(timer);
    }
    scene.current = instance;
    // Debug handle for headless captures of the prototype.
    (window as unknown as { __axcScene?: AnatomyScene }).__axcScene = instance;
    return () => {
      instance.dispose();
      scene.current = null;
    };
  }, [place]);

  useEffect(() => {
    scene.current?.setParts(sceneParts, hostLabel);
  }, [sceneParts, hostLabel]);
  useEffect(() => {
    scene.current?.setLens(lens);
  }, [lens]);
  useEffect(() => {
    scene.current?.setHighlight(hovered, selected);
  }, [hovered, selected]);

  // The model style: ?model=clay|chassis|glass|sketch, then the picker.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("model");
    const found = models.find((item) => item.id === wanted);
    if (!found) return;
    const timer = window.setTimeout(() => setModelId(found.id), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    import(`./kits/${modelId}`)
      .then((module: { default: Kit }) => {
        if (!cancelled) scene.current?.setKit(module.default);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  // The trays follow the control on a soft spring, so a quick pull overshoots.
  const drive = useCallback(() => {
    cancelAnimationFrame(springRaf.current);
    if (reducedMotion()) {
      explode.current = { x: explodeTarget.current, v: 0 };
      scene.current?.setExplode(explode.current.x);
      return;
    }
    let last = performance.now();
    const tick = (time: number) => {
      const dt = Math.min(0.032, (time - last) / 1000);
      last = time;
      const done = stepSpring(explode.current, explodeTarget.current, dt, 110, 12);
      scene.current?.setExplode(Math.max(-0.03, explode.current.x));
      if (!done) springRaf.current = requestAnimationFrame(tick);
    };
    springRaf.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => {
    explodeTarget.current = apart;
    drive();
  }, [apart, drive]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setApart(0.66),
      reducedMotion() ? 0 : 700,
    );
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(springRaf.current);
    };
  }, []);

  // ---- The simulated re-check scans the object from the cover down.
  const order = [
    "gate:http",
    "app",
    ...model.parts.filter((part) => part.kind === "private").map((p) => p.id),
    "host",
  ].filter((id) => model.byId[id]);
  const orderKey = order.join(",");
  useEffect(() => {
    const instance = scene.current;
    if (!instance) return;
    const list = orderKey.split(",");
    if (recheck.phase === "running" && recheck.active) {
      const index = list.indexOf(recheck.active);
      instance.setScan((index + 0.6) / list.length);
      return;
    }
    instance.setScan(null);
    if (recheck.phase === "passed") {
      instance.celebrate(list);
      const timers = [
        window.setTimeout(() => {
          setCelebrating(true);
          setGesture((value) => value + 1);
          burstAt(caretaker.current, {
            count: 20,
            spread: 58,
            size: 10,
            palette: sparklePalettes.verified,
          });
        }, 80),
        window.setTimeout(() => setCelebrating(false), 2200),
      ];
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    if (recheck.phase === "failed" && recheck.active) {
      const failed = recheck.active;
      const timer = window.setTimeout(() => {
        setSelected(failed);
        burstAt(caretaker.current, {
          count: 8,
          spread: 28,
          palette: sparklePalettes.failed,
        });
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [recheck.phase, recheck.active, orderKey]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mascotMood: MascotMood =
    mood ??
    (recheck.phase === "running"
      ? "checking"
      : celebrating
        ? "celebrating"
        : recheck.phase === "failed" || model.condition.certainty === "failed"
          ? "attention"
          : model.condition.certainty === "stale"
            ? "resting"
            : "ready");
  const part = selected ? byId[selected] : null;
  const planned = model.status !== "live";
  const missing = parts.filter(
    (item) => item.evidence.certainty === "absent" && !item.quiet,
  );

  return (
    <section className="axc" aria-label="Architecture as an exploded server">
      <div className="axc-condition">
        <CertaintyTag certainty={model.condition.certainty}>
          {model.condition.certainty === "verified"
            ? "Verified"
            : model.condition.certainty === "stale"
              ? "Stale"
              : model.condition.certainty === "failed"
                ? "Failed"
                : "Planned"}
        </CertaintyTag>
        <p key={model.condition.text}>{model.condition.text}</p>
      </div>

      <div className="axc-controls">
        <span className="axc-label">Look at</span>
        <TactileSlider
          label="Look at"
          options={lenses}
          value={lens}
          onChange={setLens}
        />
        <ApartControl value={apart} onChange={setApart} />
        <span className="axc-spacer" />
        <button
          type="button"
          className="ax-button"
          disabled={recheck.phase === "running" || planned}
          onClick={() => {
            setSelected(null);
            recheck.run(order, 1000);
          }}
        >
          {recheck.phase === "running" && (
            <SpinnerGap weight="bold" className="ax-spin" />
          )}
          {recheck.phase === "running" ? "Scanning…" : "Ask Server Guy to re-check"}
          <span className="ax-invented">simulated</span>
        </button>
      </div>

      <p className="axc-note" key={lens}>
        {lensNote[lens]}
      </p>

      <div
        ref={stage}
        className={`axc-stage axc-lens-${lens}${planned ? " is-planned" : ""}`}
      >
        <div ref={canvasHost} className="axc-canvas-host" />
        {glFailed && (
          <p className="axc-fallback">
            This browser couldn&apos;t start WebGL, so the 3D model isn&apos;t
            available. The same parts are listed in the other directions.
          </p>
        )}
        <svg className="axc-leaders" aria-hidden="true">
          {parts.map((item) => (
            <g
              key={item.id}
              className={`axc-leader${inFocus(item, lens) ? "" : " is-dim"}${hovered === item.id || selected === item.id ? " is-hot" : ""}`}
            >
              <path
                ref={(element) => {
                  leaders.current[item.id] = element;
                }}
              />
              <circle
                r="3"
                ref={(element) => {
                  dots.current[item.id] = element;
                }}
              />
            </g>
          ))}
        </svg>
        {parts.map((item) => {
          const line = lensLine(item, lens, model);
          return (
            <button
              key={item.id}
              type="button"
              ref={(element) => {
                callouts.current[item.id] = element;
              }}
              className={`axc-callout${inFocus(item, lens) ? "" : " is-dim"}${hovered === item.id ? " is-hot" : ""}${selected === item.id ? " is-selected" : ""}`}
              data-c={item.evidence.certainty}
              onClick={() =>
                setSelected((current) => (current === item.id ? null : item.id))
              }
              onPointerEnter={() => setHovered(item.id)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(item.id)}
              onBlur={() => setHovered(null)}
              aria-expanded={selected === item.id}
              aria-label={`${item.name}: ${item.role}.${item.quiet ? "" : ` ${item.evidence.short}.`}`}
            >
              <b>{item.name}</b>
              {!item.quiet && <CertaintyTag part={item} />}
              {line && <span className="axc-callout-line">{line}</span>}
            </button>
          );
        })}
        <div
          ref={caretaker}
          className="axc-ct"
          role="button"
          tabIndex={0}
          aria-label="Little Server. Say hello."
          onClick={() => {
            setMood("waving");
            setGesture((value) => value + 1);
            burstAt(caretaker.current, { count: 8, spread: 26 });
            window.setTimeout(() => setMood(null), 2600);
          }}
        >
          <LittleServer
            color={3}
            mood={mascotMood}
            gesture={gesture}
            paused={reduced}
          />
        </div>
        <div ref={modelPicker} className="axc-models">
          <span className="axc-label">Model</span>
          <TactileSlider
            label="Model style"
            options={models}
            value={modelId}
            onChange={(value) => {
              setModelId(value);
              const url = new URL(window.location.href);
              url.searchParams.set("model", value);
              window.history.replaceState(window.history.state, "", url);
              burstAt(modelPicker.current, { count: 12, spread: 40 });
            }}
          />
          <span className="ax-invented">prototype only</span>
        </div>
        <button
          type="button"
          className="axc-reset"
          onClick={() => scene.current?.resetView()}
          title="Reset the view (or double-click the model)"
        >
          <ArrowCounterClockwise weight="bold" /> Drag to turn
        </button>
      </div>

      {missing.length > 0 && (
        <p className="axc-missing">
          <CertaintyTag certainty="absent">Not set up</CertaintyTag>
          {missing.map((item, i) => (
            <span key={item.id}>
              {i > 0 && " · "}
              <button
                type="button"
                className="ax-textlink"
                onClick={() => setSelected(item.id)}
              >
                {item.id === "tls" ? "HTTPS and a domain" : item.name}
              </button>
            </span>
          ))}
          <span className="axc-missing-note">
            drawn as ghosts where they would go
          </span>
        </p>
      )}

      <div className={`axc-drawer${part ? " is-open" : ""}`}>
        <div>
          {part && (
            <article
              key={part.id}
              className="axc-card"
              data-c={part.evidence.certainty}
              style={{} as CSSProperties}
            >
              <div>
                <header>
                  {!part.quiet && <CertaintyTag part={part} />}
                  <h2>{part.name}</h2>
                  <span>{part.role}</span>
                </header>
                <p className="axc-card-plain">{part.plain}</p>
                {!part.quiet && (
                  <p className="axc-card-evidence">
                    {part.evidence.detail}
                    {part.evidence.invented && (
                      <span className="ax-invented">invented</span>
                    )}
                  </p>
                )}
                <div className="axc-card-links">
                  {part.destination && (
                    <button
                      type="button"
                      className="ax-textlink"
                      onClick={() => onOpenDestination(part.destination!)}
                    >
                      Open {sectionLabel(part.destination)}
                      <ArrowRight weight="bold" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ax-textlink"
                    onClick={() => onAsk(draftFor(part, model))}
                  >
                    <ChatCircleText weight="bold" />
                    Ask in the conversation
                  </button>
                </div>
              </div>
              <FactList part={part} />
              <button
                type="button"
                className="axc-card-close"
                aria-label="Close"
                onClick={() => setSelected(null)}
              >
                <X weight="bold" />
              </button>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
