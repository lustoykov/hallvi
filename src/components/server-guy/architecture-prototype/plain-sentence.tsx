"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction B — Plain sentence. The architecture is explained in words
// first, and a cross-section answers to the words. The depth slider rewrites
// the paragraph from plain to exact; a phrase opens its evidence in place,
// splitting the paragraph where it stands. How sure each part is lives on a
// time axis below, so ageing evidence can be seen sliding into the past.

import {
  ArrowRight,
  ChatCircleText,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { applicationSections } from "../application-sections";
import { CertaintyTag, FactList } from "./bits";
import { Caretaker, type CaretakerPose } from "./caretaker";
import type { DirectionProps } from "./index";
import {
  ago,
  explain,
  type ArchitectureModel,
  type Certainty,
  type Depth,
  type Part,
  type Sentence,
} from "./model";
import { burstAt, reducedMotion, sparklePalettes } from "./motion";
import { TactileSlider } from "./tactile-slider";
import "./plain-sentence.css";

const DAY = 86_400_000;
const WINDOW = 4 * DAY;

const depthOptions: { id: "0" | "1" | "2"; label: string; hint: string }[] = [
  { id: "0", label: "Plainly", hint: "What it is, in everyday words" },
  { id: "1", label: "With specifics", hint: "Names, ports, places and prices" },
  { id: "2", label: "Exactly", hint: "Addresses, digests and paths" },
];

const conditionWord: Record<Certainty, string> = {
  verified: "Verified",
  stale: "Stale",
  failed: "Failed",
  planned: "Planned",
  unknown: "Not observed",
  absent: "Not set up",
};

const sectionLabel = (id: string | undefined) =>
  applicationSections.find((section) => section.id === id)?.label ?? id;

function draftFor(part: Part, model: ArchitectureModel) {
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

/** The failure, when there is one, is the first thing the paragraph says. */
function withCondition(model: ArchitectureModel, sentences: Sentence[]) {
  const failed = model.parts.find(
    (part) => part.evidence.certainty === "failed",
  );
  if (!failed) return sentences;
  return [
    {
      id: "failure",
      segments: [
        "Right now ",
        { ref: failed.id, text: `${failed.name} isn't answering` },
        ".",
      ],
    },
    ...sentences,
  ];
}

// ---------- The cross-section ----------

function labelOf(part: Part | undefined, depth: Depth, model: ArchitectureModel) {
  if (!part) return ["", ""];
  const fact = (label: string) =>
    part.facts.find((item) => item.label === label)?.value ?? "";
  switch (part.kind) {
    case "controller":
      return depth === 0
        ? ["Your network", ""]
        : ["Server Guy", fact("Network address")];
    case "source":
      return depth === 0
        ? ["Its setup", "comes from here"]
        : depth === 1
          ? [part.name.split("/")[1] ?? part.name, "on GitHub"]
          : [part.name.split("/")[1] ?? part.name, fact("Revision").slice(0, 12)];
    case "host":
      return depth === 0
        ? ["One server", model.region?.split(", ")[1] ?? ""]
        : depth === 1
          ? [part.name, model.region?.split(", ")[0] ?? ""]
          : [fact("Server"), fact("Address")];
    case "web":
    case "private":
      return depth === 0
        ? [part.name, part.kind === "private" ? "private" : "what people open"]
        : depth === 1
          ? [part.name, fact("Inside the server") || `port ${fact("Listens on")}`]
          : [part.name, fact("Image").split("@")[1] ?? fact("Image")];
    case "volume":
      return depth === 0
        ? [part.role.includes("database") ? "Database file" : "Its files", ""]
        : depth === 1
          ? [part.name, `volume ${fact("Volume")}`]
          : (() => {
              const path = fact("Database file") || fact("Mounted at");
              const slash = path.lastIndexOf("/");
              return slash > 0
                ? [path.slice(slash + 1), path.slice(0, slash)]
                : [path, `volume ${fact("Volume")}`];
            })();
    case "offsite":
      return depth === 0
        ? ["Copies", "off the server"]
        : depth === 1
          ? [part.name, "every night"]
          : [fact("Bucket"), fact("Schedule").split(",")[0] ?? ""];
    default:
      return [part.name, ""];
  }
}

function DiagramLabel({
  part,
  depth,
  model,
  x,
  y,
  anchor = "middle",
}: {
  part: Part | undefined;
  depth: Depth;
  model: ArchitectureModel;
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
}) {
  const [main, sub] = labelOf(part, depth, model);
  return (
    <g key={depth} className="axs-label">
      <text x={x} y={y} textAnchor={anchor} className="axs-label-main">
        {main}
      </text>
      {sub && (
        <text
          x={x}
          y={y + 15}
          textAnchor={anchor}
          className={`axs-label-sub${depth === 2 ? " is-mono" : ""}`}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function CrossSection({
  model,
  depth,
  hot,
  onHover,
  onOpen,
}: {
  model: ArchitectureModel;
  depth: Depth;
  hot: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const p = model.byId;
  const service = model.parts.find((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const appVolume = volumes.find((volume) => volume.owner === "app");
  const serviceVolume = service
    ? volumes.find((volume) => volume.owner === service.id)
    : undefined;
  const el = (id: string | undefined) => {
    const part = id ? p[id] : undefined;
    return {
      className: `axs-el k-${part?.kind ?? "none"}${hot === id ? " is-hot" : ""}${part?.checking ? " is-checking" : ""}`,
      "data-c": part ? (part.quiet ? "quiet" : part.evidence.certainty) : "none",
      onPointerEnter: () => onHover(id ?? null),
      onPointerLeave: () => onHover(null),
      onClick: () => id && onOpen(id),
    };
  };
  const dot = (x: number, y: number) => <circle className="axs-dot" cx={x} cy={y} r="4" />;
  const planned = model.status !== "live";

  return (
    <svg
      className={`axs-diagram${hot ? " has-hot" : ""}${planned ? " is-planned" : ""}`}
      viewBox="0 0 480 470"
      role="img"
      aria-label="A cross-section of the server: what is inside what, and the ways in"
    >
      <defs>
        <marker
          id="axsArrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0L8 4L0 8Z" fill="#3e4a60" />
        </marker>
      </defs>

      {/* Server Guy delivers the setup over SSH: source → your network → port 22. */}
      <path className="axs-route is-release" d="M59 70V180" />
      <path className="axs-route is-release" d="M59 236C59 292 96 313 134 313" />

      {/* The server itself. */}
      <g {...el("host")}>
        <rect className="axs-body axs-server" x="140" y="24" width="330" height="348" rx="18" />
        {dot(452, 42)}
      </g>
      <DiagramLabel model={model} depth={depth} part={p["host"]} x={160} y={50} anchor="start" />

      {/* The firewall is the server's wall; the doors are the ways in. */}
      <path className="axs-wall" d="M140 36V190M140 220V300M140 326V360" />
      <g {...el("gate:http")}>
        <rect className="axs-body axs-door" x="133" y="190" width="14" height="30" rx="4" />
        {dot(147, 188)}
      </g>
      <text x="126" y="186" textAnchor="end" className="axs-port">
        80
      </text>
      <g {...el("gate:ssh")}>
        <rect className="axs-body axs-door" x="133" y="300" width="14" height="26" rx="4" />
        {dot(147, 298)}
      </g>
      <text x="126" y="296" textAnchor="end" className="axs-port">
        22
      </text>

      {/* HTTPS, where it would stand: in front of the door, not there yet. */}
      <g {...el("tls")}>
        <circle className="axs-body axs-ghost" cx="122" cy="205" r="14" />
      </g>
      <text x="114" y="170" textAnchor="end" className="axs-ghost-label">
        {depth === 0 ? "no HTTPS" : "no domain · HTTP"}
      </text>

      {/* Your network and the source, outside. */}
      <g {...el("controller")}>
        <rect className="axs-body" x="6" y="180" width="106" height="56" rx="10" />
      </g>
      <DiagramLabel model={model} depth={depth} part={p["controller"]} x={59} y={203} />
      <g {...el("source")}>
        <rect className="axs-body" x="6" y="24" width="106" height="46" rx="9" />
        {dot(104, 30)}
      </g>
      <DiagramLabel model={model} depth={depth} part={p["source"]} x={59} y={43} />

      {/* A visit: your network → port 80 → the application. */}
      <path className="axs-route is-visit" d="M112 208H176" markerEnd="url(#axsArrow)" />

      {/* The application and what it calls. */}
      <g {...el("app")}>
        <rect className="axs-body axs-app" x="176" y="176" width="116" height="60" rx="10" />
        {dot(284, 184)}
      </g>
      <DiagramLabel model={model} depth={depth} part={p["app"]} x={234} y={202} />
      {service && (
        <>
          <rect className="axs-private" x="312" y="150" width="146" height="112" rx="12" />
          <text x="322" y="167" className="axs-private-label">
            private network
          </text>
          <path className="axs-route is-private" d="M292 206H326" />
          <g {...el(service.id)}>
            <rect className="axs-body" x="326" y="180" width="118" height="56" rx="10" />
            {dot(436, 188)}
          </g>
          <DiagramLabel model={model} depth={depth} part={p[service.id]} x={385} y={204} />
        </>
      )}

      {/* The disk, and what must survive a container replacement. */}
      <rect className="axs-shelf" x="158" y="282" width="300" height="76" rx="12" />
      <text x="170" y="298" className="axs-shelf-label">
        disk
      </text>
      {appVolume && (
        <>
          <path className="axs-route is-mount" d="M234 236V300" />
          <g {...el(appVolume.id)}>
            <rect className="axs-body axs-drawer" x="178" y="300" width="114" height="46" rx="8" />
            {dot(284, 308)}
          </g>
          <DiagramLabel model={model} depth={depth} part={p[appVolume.id]} x={235} y={320} />
        </>
      )}
      {serviceVolume && (
        <>
          <path className="axs-route is-mount" d="M385 236V300" />
          <g {...el(serviceVolume.id)}>
            <rect className="axs-body axs-drawer" x="328" y="300" width="114" height="46" rx="8" />
            {dot(434, 308)}
          </g>
          <DiagramLabel model={model} depth={depth} part={p[serviceVolume.id]} x={385} y={320} />
        </>
      )}

      {/* Off the server. */}
      <path
        className={`axs-route is-data${p.offsite.evidence.certainty === "absent" ? " is-absent" : ""}`}
        d="M385 358V404"
        markerEnd="url(#axsArrow)"
      />
      <text x="395" y="386" className="axs-route-label">
        every night
      </text>
      <g {...el("offsite")}>
        <rect className="axs-body axs-offsite" x="300" y="404" width="170" height="56" rx="12" />
        {dot(462, 412)}
      </g>
      <DiagramLabel model={model} depth={depth} part={p["offsite"]} x={385} y={427} />
    </svg>
  );
}

// ---------- The freshness ribbon ----------

function Ribbon({
  model,
  onOpen,
}: {
  model: ArchitectureModel;
  onOpen: (id: string) => void;
}) {
  const rows = model.parts.filter((part) => !part.quiet);
  return (
    <section className="axs-ribbon" aria-label="How sure is each part">
      <h3>How sure is each part?</h3>
      <div className="axs-ribbon-grid">
        <div className="axs-ribbon-axis">
          <span style={{ left: "0%" }}>4 days ago</span>
          <span style={{ left: "75%" }} className="is-threshold">
            a day ago · older counts as stale
          </span>
          <span style={{ left: "100%" }} className="is-now">
            now
          </span>
        </div>
        {rows.map((part) => {
          const at = part.evidence.at ? Date.parse(part.evidence.at) : null;
          const x =
            at === null
              ? null
              : Math.max(0, Math.min(1, 1 - (model.now - at) / WINDOW));
          const flip = x !== null && x > 0.62;
          return (
            <div
              key={part.id}
              className="axs-ribbon-row"
              data-c={part.checking ? "checking" : part.evidence.certainty}
            >
              <button
                type="button"
                className="axs-ribbon-name"
                onClick={() => onOpen(part.id)}
              >
                {part.name}
              </button>
              <div className="axs-lane">
                <span className="axs-threshold" />
                {x === null ? (
                  <span className="axs-none">
                    <i />
                    {part.evidence.short}
                  </span>
                ) : (
                  <span
                    className={`axs-mark${flip ? " is-flipped" : ""}`}
                    style={{ left: `${x * 100}%` } as CSSProperties}
                  >
                    <i />
                    <em>{part.checking ? "Checking…" : part.evidence.short}</em>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- The direction ----------

export function SentenceDirection({
  model,
  recheck,
  onOpenDestination,
  onAsk,
}: DirectionProps) {
  const [depth, setDepth] = useState<Depth>(0);
  const [shown, setShown] = useState<Depth>(0);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [hot, setHot] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [cheer, setCheer] = useState(false);
  const [shimmer, setShimmer] = useState(false);
  const [shake, setShake] = useState<string | null>(null);
  const [gaze, setGaze] = useState(0);
  const [woken, setWoken] = useState(false);
  const [wash, setWash] = useState<Certainty | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const caretaker = useRef<HTMLSpanElement>(null);
  const from = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const later = (fn: () => void, ms: number) =>
    timers.current.push(window.setTimeout(fn, ms));

  const sentences = useMemo(
    () => withCondition(model, explain(model, shown)),
    [model, shown],
  );

  function chooseDepth(next: Depth) {
    if (next === depth) return;
    setDepth(next);
    if (reducedMotion()) {
      setShown(next);
      return;
    }
    from.current = box.current?.getBoundingClientRect().height ?? null;
    setPhase("out");
    later(() => {
      setShown(next);
      setPhase("in");
    }, 190);
    later(() => setPhase("idle"), 190 + 640);
  }

  // The paragraph's height follows its new words instead of jumping.
  useLayoutEffect(() => {
    const element = box.current;
    const start = from.current;
    if (!element || start === null) return;
    from.current = null;
    element.style.height = "auto";
    const end = element.getBoundingClientRect().height;
    element.style.height = `${start}px`;
    void element.offsetHeight;
    element.style.transition = "height 360ms cubic-bezier(0.16, 1, 0.3, 1)";
    element.style.height = `${end}px`;
    const done = () => {
      element.style.height = "auto";
      element.style.transition = "";
      element.removeEventListener("transitionend", done);
    };
    element.addEventListener("transitionend", done);
  }, [shown]);

  // A change of record washes the paragraph once, in the new state's tint.
  const last = useRef(model.condition.certainty);
  useEffect(() => {
    if (last.current === model.condition.certainty) return;
    last.current = model.condition.certainty;
    if (reducedMotion()) return;
    const start = window.setTimeout(() => setWash(model.condition.certainty), 0);
    const end = window.setTimeout(() => setWash(null), 1300);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [model.condition.certainty]);

  // The simulated re-check: celebrate a pass, open the failure.
  useEffect(() => {
    if (recheck.phase === "passed") {
      const t = [
        window.setTimeout(() => {
          setCheer(true);
          setShimmer(true);
          burstAt(caretaker.current, {
            count: 20,
            spread: 56,
            size: 10,
            palette: sparklePalettes.verified,
          });
        }, 60),
        window.setTimeout(() => setShimmer(false), 1400),
        window.setTimeout(() => setCheer(false), 1800),
      ];
      return () => t.forEach((timer) => window.clearTimeout(timer));
    }
    if (recheck.phase === "failed" && recheck.active) {
      const id = recheck.active;
      const t = [
        window.setTimeout(() => {
          setShake(id);
          setOpen(id);
          burstAt(caretaker.current, {
            count: 8,
            spread: 28,
            palette: sparklePalettes.failed,
          });
        }, 60),
        window.setTimeout(() => setShake(null), 700),
      ];
      return () => t.forEach((timer) => window.clearTimeout(timer));
    }
  }, [recheck.phase, recheck.active]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const look = (event: PointerEvent<HTMLElement>, id: string) => {
    setHot(id);
    const target = event.currentTarget.getBoundingClientRect();
    const self = caretaker.current?.getBoundingClientRect();
    if (self)
      setGaze(
        Math.max(
          -1,
          Math.min(
            1,
            (target.left + target.width / 2 - (self.left + self.width / 2)) / 260,
          ),
        ),
      );
  };
  const toggle = (id: string) =>
    setOpen((current) => (current === id ? null : id));

  const pose: CaretakerPose =
    recheck.phase === "running"
      ? "check"
      : cheer
        ? "cheer"
        : recheck.phase === "failed" || model.condition.certainty === "failed"
          ? "worry"
          : model.condition.certainty === "stale" && !woken
            ? "sleep"
            : "idle";
  const openIndex = open
    ? sentences.findIndex((sentence) =>
        sentence.segments.some(
          (segment) => typeof segment !== "string" && segment.ref === open,
        ),
      )
    : -1;
  const part = open ? model.byId[open] : null;
  const planned = model.status !== "live";
  const order = [
    "host",
    "gate:http",
    "app",
    ...model.parts.filter((p) => p.kind === "private").map((p) => p.id),
  ].filter((id) => model.byId[id]);

  const renderSentence = (sentence: Sentence, index: number) => (
    <span
      key={`${shown}:${sentence.id}`}
      className="axs-sentence"
      style={{ "--i": index } as CSSProperties}
    >
      {sentence.segments.map((segment, i) => {
        if (typeof segment === "string")
          return <Fragment key={i}>{segment}</Fragment>;
        const ref = segment.ref ? model.byId[segment.ref] : undefined;
        if (!ref)
          return (
            <span key={i} className={segment.mono ? "axs-mono" : undefined}>
              {segment.text}
            </span>
          );
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            className={`axs-phrase${segment.mono ? " axs-mono" : ""}${hot === ref.id ? " is-hot" : ""}${open === ref.id ? " is-open" : ""}${shake === ref.id ? " is-shake" : ""}`}
            data-c={ref.quiet ? "quiet" : ref.evidence.certainty}
            data-checking={ref.checking ? "" : undefined}
            aria-expanded={open === ref.id}
            onPointerEnter={(event) => look(event, ref.id)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(ref.id)}
            onBlur={() => setHot(null)}
            onClick={() => toggle(ref.id)}
            onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle(ref.id);
              }
            }}
          >
            {segment.text}
          </span>
        );
      })}{" "}
    </span>
  );

  const companion = (
    <span ref={caretaker} className="axs-ct">
      <Caretaker
        pose={pose}
        size={34}
        gaze={gaze}
        onPoke={() => {
          burstAt(caretaker.current, { count: 8, spread: 24 });
          if (pose === "sleep") {
            setWoken(true);
            later(() => setWoken(false), 2800);
          }
        }}
      />
    </span>
  );

  return (
    <section className="axs" aria-label="Architecture as a plain sentence">
      <div className="axs-controls">
        <span className="axs-label">Explain it</span>
        <TactileSlider
          label="Explain it"
          options={depthOptions}
          value={String(depth) as "0" | "1" | "2"}
          onChange={(value) => chooseDepth(Number(value) as Depth)}
        />
        <span className="axs-spacer" />
        <button
          type="button"
          className="ax-button"
          disabled={recheck.phase === "running" || planned}
          onClick={() => {
            setOpen(null);
            recheck.run(order, 900);
          }}
        >
          {recheck.phase === "running" && (
            <SpinnerGap weight="bold" className="ax-spin" />
          )}
          {recheck.phase === "running" ? "Checking…" : "Ask Server Guy to re-check"}
          <span className="ax-invented">simulated</span>
        </button>
      </div>

      <div className="axs-lead">
        <div
          ref={box}
          className={`axs-box${wash ? " is-washing" : ""}`}
          data-wash={wash ?? undefined}
        >
          <div
            className={`axs-flow axs-depth-${shown} is-${phase}${shimmer ? " is-shimmer" : ""}`}
          >
            <p className="axs-text">
              <CertaintyTag certainty={model.condition.certainty}>
                {conditionWord[model.condition.certainty]}
              </CertaintyTag>{" "}
              {(openIndex >= 0 ? sentences.slice(0, openIndex + 1) : sentences).map(
                renderSentence,
              )}
              {openIndex < 0 && companion}
            </p>
            <div className={`axs-card-slot${part ? " is-open" : ""}`}>
              <div>
                {part && (
                  <article
                    key={part.id}
                    className="axs-card"
                    data-c={part.evidence.certainty}
                  >
                    <header>
                      {!part.quiet && <CertaintyTag part={part} />}
                      <h2>{part.name}</h2>
                      <span>{part.role}</span>
                      <button
                        type="button"
                        className="axs-card-close"
                        aria-label="Close"
                        onClick={() => setOpen(null)}
                      >
                        <X weight="bold" />
                      </button>
                    </header>
                    <p className="axs-card-plain">{part.plain}</p>
                    {!part.quiet && (
                      <p className="axs-card-evidence">
                        {part.evidence.detail}
                        {part.evidence.invented && (
                          <span className="ax-invented">invented</span>
                        )}
                      </p>
                    )}
                    <FactList part={part} />
                    <div className="axs-card-links">
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
                  </article>
                )}
              </div>
            </div>
            {openIndex >= 0 && (
              <p className="axs-text">
                {sentences.slice(openIndex + 1).map((sentence, i) =>
                  renderSentence(sentence, openIndex + 1 + i),
                )}
                {companion}
              </p>
            )}
          </div>
        </div>
        <div className="axs-figure">
          <CrossSection
            model={model}
            depth={shown}
            hot={hot}
            onHover={setHot}
            onOpen={toggle}
          />
        </div>
      </div>

      <Ribbon model={model} onOpen={toggle} />

      {model.gaps.length > 0 && (
        <div className="axs-gaps">
          <h3>Not set up yet</h3>
          {model.gaps.map((gap) => (
            <div key={gap.id} className="axs-gap">
              <CertaintyTag certainty="absent">Not set up</CertaintyTag>
              <p>
                <b>{gap.title}.</b> {gap.detail}
              </p>
              <button
                type="button"
                className="ax-textlink"
                onClick={() =>
                  onAsk(
                    gap.id === "tls"
                      ? `Set up a domain with HTTPS for ${model.headline}.`
                      : `Watch ${model.headline} continuously and tell me when something fails.`,
                  )
                }
              >
                <ChatCircleText weight="bold" />
                Ask in the conversation
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
