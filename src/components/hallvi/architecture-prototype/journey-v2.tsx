"use client";

// Architecture journeys drawn from saved topology and connection evidence.
// The original visual direction is preserved; routes follow recorded parts.

import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  ChartLineUp,
  ChatCircleText,
  CloudArrowUp,
  Database,
  Fire,
  GithubLogo,
  Globe,
  HardDrive,
  HardDrives,
  Heartbeat,
  Key,
  Question,
  LockOpen,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  applicationSections,
  type ApplicationSection,
} from "../application-sections";
import type { PageContext } from "../deployment-prototype/page-head";
import { CertaintyTag } from "./bits";
/** What the architecture page hands this journey. */
export interface DirectionProps {
  model: ArchitectureModel;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
  page?: PageContext;
}
import {
  ago,
  type ArchitectureModel,
  type Certainty,
  type Gap,
  type JourneyId,
  type Part,
} from "./model";
import { reducedMotion, useReducedMotion } from "./motion";
import { TactileSlider } from "./tactile-slider";
import "./journey-v2.css";

/** Session key: a part another page asked Architecture to open. */
export const ARCHITECTURE_FOCUS = "hv-prototype:architecture-focus";

const W = 1120;
/**
 * The map is drawn from y = 0; the view starts at TOP, just above the server.
 */
const TOP = 60;
const H = 500;
type Rect = { x: number; y: number; w: number; h: number };

const pct = (value: number, total: number) => `${(value / total) * 100}%`;
/**
 * The canvas is a fixed width and a height that depends on what is on it.
 *
 * Everything is placed as a percentage, so the drawing scales with the
 * container — which is right for the shapes and wrong for the words, because
 * the words do not scale. The answer is not to shrink boxes until the text
 * leaves them; it is to make the canvas taller when there is more to draw,
 * so a box keeps the size its label needs however many neighbours it has.
 */
const placer = (height: number) => ({
  place: (r: Rect): CSSProperties => ({
    left: pct(r.x, W),
    top: pct(r.y - TOP, height),
    width: pct(r.w, W),
    height: pct(r.h, height),
  }),
  point: (x: number, y: number): CSSProperties => ({
    left: pct(x, W),
    top: pct(y - TOP, height),
  }),
});

const BOX: Record<string, Rect> = {
  source: { x: 24, y: 96, w: 172, h: 96 },
  controller: { x: 24, y: 264, w: 172, h: 84 },
  server: { x: 262, y: 80, w: 640, h: 452 },
  header: { x: 262, y: 80, w: 640, h: 54 },
  private: { x: 566, y: 206, w: 292, h: 170 },
  shelf: { x: 290, y: 398, w: 568, h: 114 },
  // Wider than the original 196: `paperless-webserver` is an ordinary
  // container name and it wrapped to two lines, which pushed the reading out
  // of the bottom of the card.
  app: { x: 308, y: 262, w: 244, h: 96 },
  svc: { x: 612, y: 262, w: 196, h: 76 },
  appVol: { x: 332, y: 434, w: 196, h: 70 },
  svcVol: { x: 612, y: 434, w: 196, h: 70 },
  offsite: { x: 924, y: 428, w: 176, h: 96 },
  // Taller than its neighbours on purpose: this slot holds a placeholder
  // whose headline is a sentence, and at 1280 a 72-unit box cut it off.
  watch: { x: 918, y: 96, w: 190, h: 96 },
  http: { x: 204, y: 284, w: 116, h: 32 },
  ssh: { x: 204, y: 366, w: 116, h: 32 },
};

interface Layout {
  rects: Record<string, Rect>;
  height: number;
  legs: Record<JourneyId, string[][]>;
  wires: { d: string; journey: JourneyId }[];
  labels: { x: number; y: number; text: string }[];
  stops: Record<JourneyId, string[]>;
}

/** Recorded routes and generous routing lanes; probes are listed separately. */
function layoutFor(model: ArchitectureModel): Layout {
  const services = model.parts.filter((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const gateways = model.parts.filter(
    (part) =>
      (part.kind === "gate" || part.kind === "tls") &&
      model.edges.some((edge) => edge.from === part.id || edge.to === part.id),
  );
  const appY = 190 + gateways.length * 120;
  const shelfY = Math.max(appY + 150, appY + services.length * 108 + 48);
  const rows = Math.ceil(volumes.length / 2);
  const shelfHeight = Math.max(114, 36 + rows * 108);
  const rects: Record<string, Rect> = {
    source: { ...BOX.source, y: 176 },
    controller: { ...BOX.controller, y: appY },
    host: BOX.header,
    app: { ...BOX.app, y: appY },
    private: {
      x: 596,
      y: appY - 34,
      w: 262,
      h: Math.max(126, services.length * 108 + 22),
    },
    shelf: { ...BOX.shelf, y: shelfY, h: shelfHeight },
    offsite: { ...BOX.offsite, y: shelfY + 36 },
    server: { ...BOX.server, h: shelfY + shelfHeight + 20 - BOX.server.y },
  };
  gateways.forEach((part, index) => {
    rects[part.id] = {
      x: BOX.app.x,
      y: 166 + index * 120,
      w: BOX.app.w,
      h: 76,
    };
  });
  services.forEach((part, index) => {
    rects[part.id] = { x: 610, y: appY + index * 108, w: 234, h: 76 };
  });
  const ordered = [...volumes].sort(
    (a, b) => Number(b.owner === "app") - Number(a.owner === "app"),
  );
  ordered.forEach((part, index) => {
    const lastAlone = index === ordered.length - 1 && index % 2 === 0;
    rects[part.id] = {
      x: lastAlone ? 444 : 302 + (index % 2) * 280,
      y: shelfY + 36 + Math.floor(index / 2) * 108,
      w: 264,
      h: 68,
    };
  });
  const monitor = model.parts.find(
    (part) => part.kind === "monitor" && !part.id.startsWith("gap:"),
  );
  if (monitor) rects[monitor.id] = BOX.watch;
  const centre = (r: Rect) => r.x + r.w / 2;
  const middle = (r: Rect) => r.y + r.h / 2;
  const visit: string[] = [];
  const labels: Layout["labels"] = [];
  const stops = new Set<string>();
  for (const edge of model.edges) {
    if (edge.network === "disk") continue;
    const from = rects[edge.from];
    const to = rects[edge.to];
    if (!from || !to || edge.to === "host") continue;
    const origin = model.byId[edge.from];
    if (origin?.kind === "gate" && origin.admits === "refused") continue;
    if (
      origin?.kind === "source" &&
      origin.facts.some((fact) => fact.label === "Revision")
    )
      continue;
    // A host-to-service private edge describes placement, not traffic.
    if (
      edge.from === "host" &&
      edge.network !== "loopback" &&
      edge.network !== "public"
    )
      continue;
    let d: string;
    let label: { x: number; y: number };
    if (edge.from === "host") {
      d = `M${BOX.server.x} ${middle(to)}H${to.x}`;
      label = { x: BOX.server.x + 4, y: middle(to) - 12 };
    } else if (from.x === to.x && to.y >= from.y + from.h) {
      d = `M${centre(from)} ${from.y + from.h}V${to.y}`;
      label = { x: centre(from) + 12, y: (from.y + from.h + to.y) / 2 };
    } else if (to.x >= from.x + from.w) {
      const lane = (from.x + from.w + to.x) / 2;
      d = `M${from.x + from.w} ${middle(from)}H${lane}V${middle(to)}H${to.x}`;
      label = { x: from.x + from.w + 8, y: middle(from) - 12 };
    } else {
      const lane = Math.min(from.x, to.x) - 18;
      d = `M${from.x} ${middle(from)}H${lane}V${middle(to)}H${to.x}`;
      label = { x: lane + 8, y: (middle(from) + middle(to)) / 2 };
    }
    visit.push(d);
    stops.add(edge.from);
    stops.add(edge.to);
    // Detailed labels on short service links belong in the connection list.
    if (edge.label && (edge.from === "source" || from.x === to.x))
      labels.push({ ...label, text: edge.label });
  }
  const disk = ordered.flatMap((volume) => {
    const owner = volume.owner && rects[volume.owner];
    if (!owner) return [];
    const target = rects[volume.id];
    const row = Math.floor(ordered.indexOf(volume) / 2);
    const laneY = row === 0 ? shelfY - 20 : shelfY + row * 108 + 16;
    if (volume.owner === "app")
      return [
        `M${centre(owner)} ${owner.y + owner.h}V${laneY}H${centre(target)}V${target.y}`,
      ];
    // Leave a backing service sideways: dropping out of PostgreSQL would
    // cut through Redis below it. Enter each storage row through its gap.
    return [
      `M${owner.x + owner.w} ${middle(owner)}H880V${laneY}H${centre(target)}V${target.y}`,
    ];
  });
  const copies =
    model.byId.offsite && ordered.length
      ? ordered.map((volume) => {
          const r = rects[volume.id];
          return `M${centre(r)} ${r.y + r.h}V${r.y + r.h + 16}H894V${middle(rects.offsite)}H${rects.offsite.x}`;
        })
      : [];
  const release =
    model.byId.source?.facts.some((fact) => fact.label === "Revision") &&
    model.byId.app
      ? [
          `M${rects.source.x + rects.source.w / 2} ${rects.source.y + rects.source.h}V${appY + 126}H286V${middle(rects.app)}H${rects.app.x}`,
        ]
      : [];
  const legs: Layout["legs"] = {
    visit: visit.map((path) => [path]),
    data: [...disk, ...copies].map((path) => [path]),
    release: release.map((path) => [path]),
  };
  return {
    rects,
    height: rects.server.y + rects.server.h - TOP + 24,
    labels,
    legs,
    wires: (Object.keys(legs) as JourneyId[]).flatMap((journey) =>
      legs[journey].flat().map((d) => ({ d, journey })),
    ),
    stops: {
      visit: [...stops],
      data: [
        ...new Set(
          ordered.flatMap((part) =>
            part.owner ? [part.owner, part.id] : [part.id],
          ),
        ),
        ...(model.byId.offsite ? ["offsite"] : []),
      ],
      release: release.length ? ["source", "app"] : [],
    },
  };
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

/** Little Server's face, antennas and all, as the controller's icon. */
function HallviFace() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.6 6V3.4M16.4 6V3.4"
        stroke="#3e4a60"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="7.6" cy="2.9" r="1.35" fill="#9dbbff" />
      <circle cx="16.4" cy="2.9" r="1.35" fill="#9dbbff" />
      <rect x="2" y="6" width="20" height="15" rx="4.8" fill="#192338" />
      <rect x="7" y="10" width="2.6" height="4.8" rx="1.3" fill="#edf3ff" />
      <rect x="14.4" y="10" width="2.6" height="4.8" rx="1.3" fill="#edf3ff" />
      <path
        d="M9.2 16.6Q12 18.3 14.8 16.6"
        stroke="#d6e5ff"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function iconFor(
  part: Part,
  openness: ArchitectureModel["openness"],
): ReactNode {
  if (part.id.startsWith("gap:")) return <Heartbeat weight="bold" />;
  switch (part.kind) {
    case "controller":
      return <HallviFace />;
    case "source":
      if (!part.facts.some((fact) => fact.label === "Revision"))
        return <Globe weight="duotone" />;
      return <GithubLogo weight="duotone" />;
    case "host":
      return <HardDrives weight="duotone" />;
    case "web":
      return <ChartLineUp weight="duotone" />;
    case "private":
      return <Fire weight="duotone" />;
    case "volume":
      return part.role.includes("database") ? (
        <Database weight="duotone" />
      ) : (
        <HardDrive weight="duotone" />
      );
    case "offsite":
      return <CloudArrowUp weight="duotone" />;
    case "gate":
      // This door's own check first: a port that refuses is a shield whatever
      // the application's reach is. Only when the door itself says nothing
      // does the application's openness get a vote, and when that says
      // nothing either it is a question mark rather than a claim.
      return part.id === "gate:ssh" ? (
        <Key weight="bold" />
      ) : part.admits === "refused" ? (
        <ShieldCheck weight="bold" />
      ) : part.admits === "open" ? (
        <Globe weight="bold" />
      ) : openness === "restricted" ? (
        <ShieldCheck weight="bold" />
      ) : openness === "public" ? (
        <Globe weight="bold" />
      ) : (
        // Nobody has read the rules back, so neither a shield nor a globe.
        <Question weight="bold" />
      );
    case "tls":
      return <LockOpen weight="bold" />;
    case "monitor":
      return <Heartbeat weight="bold" />;
  }
}

function titleFor(part: Part) {
  return part.kind === "source"
    ? (part.name.split("/").pop() ?? part.name)
    : part.name;
}

function subtitleFor(part: Part, model: ArchitectureModel) {
  const fact = (label: string) =>
    part.facts.find((item) => item.label === label)?.value;
  if (part.id.startsWith("gap:"))
    return part.evidence.certainty === "absent"
      ? `not watching ${model.headline}`
      : `nobody has looked`;
  switch (part.kind) {
    case "controller":
      return "your network";
    case "source":
      return fact("Revision")
        ? `${part.name.split("/")[0]} · ${fact("Revision")?.slice(0, 7)}`
        : part.role;
    case "web":
      // Only an established public reach says so; silence says nothing.
      return model.openness === "public"
        ? "your application, public"
        : "your application";
    case "private":
      return part.role;
    case "volume":
      return part.role;
    case "offsite":
      return fact("Schedule")?.split(",")[0] ?? "copies off the server";
    default:
      return part.role;
  }
}

function Card({
  part,
  rect,
  model,
  index,
  selected,
  dim,
  lit,
  arriving,
  compact,
  tight,
  placeAt,
  ghost,
  onSelect,
}: {
  part: Part;
  rect: Rect;
  model: ArchitectureModel;
  index: number;
  selected: boolean;
  dim: boolean;
  lit: boolean;
  arriving: boolean;
  compact?: boolean;
  /** The box is too short for a sentence; show the dot and the name only. */
  tight?: boolean;
  /** The canvas's own placer, since its height depends on the model. */
  placeAt: (r: Rect) => CSSProperties;
  ghost?: boolean;
  onSelect: (id: string) => void;
}) {
  const certainty = part.quiet ? "quiet" : part.evidence.certainty;
  return (
    <button
      type="button"
      className={`axj2-card k-${part.kind}${compact ? " is-compact" : ""}${tight ? " is-tight" : ""}${ghost ? " is-ghost" : ""}${selected ? " is-selected" : ""}${dim ? " is-dim" : ""}${lit ? " is-lit" : ""}${arriving ? " is-arriving" : ""}${part.checking ? " is-checking" : ""}`}
      data-c={certainty}
      style={{ ...placeAt(rect), ["--i" as string]: index }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(part.id);
      }}
      aria-expanded={selected}
      aria-label={`${part.name}, ${part.role}.${part.quiet ? "" : ` ${part.checking ? "Checking" : part.evidence.short}.`}`}
    >
      <span className="axj2-icon" aria-hidden="true">
        {iconFor(part, model.openness)}
      </span>
      <span className="axj2-text">
        {/* Container and volume names are Pi's, and some are sixty characters.
            Two lines is the right budget for a node in a map, so the full
            value stays available rather than being lost to the clamp. */}
        <b title={titleFor(part)}>{titleFor(part)}</b>
        {!compact && !tight && (
          <small title={subtitleFor(part, model)}>
            {subtitleFor(part, model)}
          </small>
        )}
        {/* In a crowded map the reading keeps its dot and loses its sentence.
            The dot already carries the certainty, the full reading is one
            click away in the inspector, and the alternative — the text
            staying while the box shrinks under it — is how
            `paperless-postgres-data` ended up written across a wire. */}
        {!part.quiet && (
          <span
            className="axj2-status"
            data-tight={tight || undefined}
            title={part.checking ? "Checking…" : part.evidence.short}
          >
            <i aria-hidden="true" />
            {tight ? null : part.checking ? "Checking…" : part.evidence.short}
          </span>
        )}
      </span>
    </button>
  );
}

function Popover({
  part,
  rect,
  model,
  onClose,
  onOpenDestination,
  onAsk,
  height,
}: {
  part: Part;
  rect: Rect;
  height: number;
  model: ArchitectureModel;
  onClose: () => void;
  onOpenDestination: DirectionProps["onOpenDestination"];
  onAsk: DirectionProps["onAsk"];
}) {
  const right = rect.x + rect.w / 2 < W * 0.56;
  const element = useRef<HTMLDivElement>(null);
  // Keep it inside the stage: nudge up if it would run past the bottom.
  useLayoutEffect(() => {
    const pop = element.current;
    const stage = pop?.parentElement;
    if (!pop || !stage) return;
    const stageHeight = stage.clientHeight;
    const wanted = (Math.max(0, rect.y - TOP - 8) / height) * stageHeight;
    const top = Math.max(
      -8,
      Math.min(wanted, stageHeight - pop.offsetHeight + 24),
    );
    pop.style.top = `${top}px`;
  }, [rect, height]);
  return (
    <div
      ref={element}
      className={`axj2-pop${right ? " is-right" : " is-left"}`}
      style={placer(height).point(
        right ? rect.x + rect.w + 14 : rect.x - 14,
        rect.y,
      )}
      role="dialog"
      aria-label={part.name}
      onClick={(event) => event.stopPropagation()}
    >
      <header>
        <span className={`axj2-icon k-${part.kind}`} aria-hidden="true">
          {iconFor(part, model.openness)}
        </span>
        <div>
          <b>{part.name}</b>
          <small>{part.role}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X weight="bold" />
        </button>
      </header>
      <p className="axj2-pop-plain">{part.plain}</p>
      {!part.quiet && (
        <div className="axj2-pop-evidence">
          <CertaintyTag part={part} />
          <p>
            {part.evidence.detail}
            {part.evidence.invented && (
              <span className="ax-invented">invented</span>
            )}
          </p>
        </div>
      )}
      {part.facts.length > 0 && (
        <dl>
          {part.facts.slice(0, 5).map((fact) => (
            <div key={`${fact.label}:${fact.value}`}>
              <dt>{fact.label}</dt>
              <dd className={fact.mono ? "ax-mono" : undefined}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <footer>
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
      </footer>
    </div>
  );
}

/** Something not set up, drawn as a ghost where it would go. */
function gapPart(gap: Gap, headline: string): Part {
  return {
    id: `gap:${gap.id}`,
    kind: "offsite",
    name: gap.id === "monitoring" ? "Monitoring" : gap.title,
    role: gap.title,
    plain:
      gap.id === "monitoring"
        ? `A watcher outside the server would check ${headline} every minute and tell you when it stops answering.`
        : gap.detail,
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

export function JourneyDirection({
  model,
  onOpenDestination,
  onAsk,
  page,
}: DirectionProps) {
  const reduced = useReducedMotion();
  const layout = useMemo(() => layoutFor(model), [model]);
  // Shadows the module-level pair on purpose: everything this component draws
  // is placed on the canvas this model actually needs, not on the 500-unit
  // one the design started from.
  const { place, point } = useMemo(
    () => placer(layout.height),
    [layout.height],
  );
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const [journey, setJourney] = useState<JourneyId>("visit");
  const [replay, setReplay] = useState(0);
  const [touring, setTouring] = useState(false);
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const [arriving, setArriving] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [shift, setShift] = useState<Certainty | null>(null);
  const section = useRef<HTMLElement>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const comets = useRef<(SVGGElement | null)[]>([]);
  const tourId = useRef(0);
  const firstTour = useRef(true);

  // Arrived from Overview to see where something is: open that part.
  useEffect(() => {
    let wanted: string | null = null;
    try {
      wanted = window.sessionStorage.getItem(ARCHITECTURE_FOCUS);
    } catch {}
    if (!wanted) return;
    const part = wanted;
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(ARCHITECTURE_FOCUS);
      } catch {}
      setSelected(part);
    }, 500);
    return () => window.clearTimeout(timer);
  }, []);

  // A journey travels once when chosen: a comet of light, stops lighting up
  // as it enters them, then a calm flow along the lit path.
  useEffect(() => {
    const id = ++tourId.current;
    const { legs, stops, rects } = layoutRef.current;
    const all = new Set(stops[journey]);
    const local: number[] = [];
    let raf = 0;
    const alive = () => tourId.current === id;
    const hide = () =>
      comets.current.forEach((comet) => {
        if (comet) comet.style.opacity = "0";
      });
    const delay = firstTour.current ? 1250 : 150;
    firstTour.current = false;
    if (reducedMotion()) {
      local.push(
        window.setTimeout(() => {
          setLit(all);
          setTouring(false);
        }, 0),
      );
      return () => local.forEach((timer) => window.clearTimeout(timer));
    }
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        local.push(window.setTimeout(resolve, ms));
      });
    const light = (ids: string[]) => {
      if (!ids.length) return;
      setLit((previous) => new Set([...previous, ...ids]));
      setArriving((previous) => new Set([...previous, ...ids]));
      local.push(
        window.setTimeout(
          () =>
            setArriving((previous) => {
              const next = new Set(previous);
              ids.forEach((stop) => next.delete(stop));
              return next;
            }),
          700,
        ),
      );
    };
    const travel = (paths: string[], speed: number) =>
      new Promise<void>((resolve) => {
        const elements = paths
          .map((d) => pathRefs.current[d])
          .filter((element): element is SVGPathElement => Boolean(element));
        if (!elements.length) {
          resolve();
          return;
        }
        const lengths = elements.map((element) => element.getTotalLength());
        const entries = elements.map((element, i) => {
          const found: { id: string; at: number }[] = [];
          for (const stop of stops[journey]) {
            const r = rects[stop];
            if (!r) continue;
            for (let s = 0; s <= lengths[i]; s += 3) {
              const p = element.getPointAtLength(s);
              if (
                p.x >= r.x - 4 &&
                p.x <= r.x + r.w + 4 &&
                p.y >= r.y - 4 &&
                p.y <= r.y + r.h + 4
              ) {
                found.push({ id: stop, at: s });
                break;
              }
            }
          }
          return found;
        });
        const done = new Set<string>();
        const duration = Math.max(...lengths) / speed;
        const start = performance.now();
        const frame = (time: number) => {
          if (!alive()) {
            resolve();
            return;
          }
          const t = Math.min(1, (time - start) / duration);
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          elements.forEach((element, i) => {
            const comet = comets.current[i];
            if (!comet) return;
            const head = lengths[i] * eased;
            comet.style.opacity = "1";
            const circles = comet.children;
            for (let k = 0; k < circles.length; k++) {
              const p = element.getPointAtLength(Math.max(0, head - k * 9));
              circles[k].setAttribute("cx", String(p.x));
              circles[k].setAttribute("cy", String(p.y));
            }
            const fresh = entries[i]
              .filter((entry) => entry.at <= head && !done.has(entry.id))
              .map((entry) => entry.id);
            fresh.forEach((stop) => done.add(stop));
            light(fresh);
          });
          if (t < 1) raf = requestAnimationFrame(frame);
          else resolve();
        };
        raf = requestAnimationFrame(frame);
      });
    void (async () => {
      local.push(
        window.setTimeout(() => {
          setLit(new Set());
          setTouring(true);
        }, 0),
      );
      await wait(delay);
      for (const leg of legs[journey]) {
        if (!alive()) return;
        await travel(leg, 0.18);
        if (!alive()) return;
        hide();
        await wait(90);
      }
      if (!alive()) return;
      setLit(all);
      setTouring(false);
    })();
    return () => {
      tourId.current = id + 1;
      local.forEach((timer) => window.clearTimeout(timer));
      cancelAnimationFrame(raf);
      hide();
    };
  }, [journey, replay]);

  // A change of record explains itself once, in the new state's tint.
  const lastCondition = useRef(model.condition.certainty);
  useEffect(() => {
    if (lastCondition.current === model.condition.certainty) return;
    lastCondition.current = model.condition.certainty;
    if (reducedMotion()) return;
    const start = window.setTimeout(
      () => setShift(model.condition.certainty),
      0,
    );
    const end = window.setTimeout(() => setShift(null), 1300);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [model.condition.certainty]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPath = new Set(layout.stops[journey]);
  const services = model.parts.filter((part) => part.kind === "private");
  const gates = model.parts
    .filter(
      (part) =>
        part.kind === "gate" &&
        (part.port || part.admits === "open" || part.admits === "refused"),
    )
    .sort((a, b) => Number(b.admits === "open") - Number(a.admits === "open"));
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const monitoringGap = model.gaps.find((gap) => gap.id === "monitoring");
  // The model owns what the ghost's state is — unassessed is not absent —
  // and this only decides where to put it.
  const ghostPart = monitoringGap
    ? (model.byId[`gap:${monitoringGap.id}`] ??
      gapPart(monitoringGap, model.headline))
    : null;
  const planned = model.status !== "live";
  const host = model.byId.host;
  const current = model.journeys.find((item) => item.id === journey);
  const selectedPart = selected
    ? (model.byId[selected] ?? (ghostPart?.id === selected ? ghostPart : null))
    : null;
  const selectedRect = selected
    ? (layout.rects[selected] ??
      (ghostPart?.id === selected ? BOX.watch : null))
    : null;
  const cardProps = (part: Part) => ({
    part,
    model,
    selected: selected === part.id,
    dim: !onPath.has(part.id) && !touring,
    lit: lit.has(part.id),
    arriving: arriving.has(part.id),
    onSelect: (id: string) =>
      setSelected((currentId) => (currentId === id ? null : id)),
  });

  return (
    <section
      ref={section}
      className="axj2"
      aria-label="Architecture as journeys"
    >
      {/* Where you are, and what you can open. */}
      <header className="axj3-head">
        {page?.chrome.bar && <div className="axj3-bar">{page.chrome.bar}</div>}
        <div className="axj3-title">
          <h1>Architecture</h1>
          {page?.openUrl && !planned && (
            <div className="axj3-open">
              {model.restricted && (
                <small>
                  <ShieldCheck weight="bold" /> Only from your network
                </small>
              )}
              <a href={page.openUrl} target="_blank" rel="noreferrer">
                Open {model.headline}
                <ArrowSquareOut weight="bold" />
              </a>
            </div>
          )}
        </div>
      </header>

      {page?.busy && page.chrome.activity}

      <div className="axj2-controls">
        <span className="axj2-label">Follow</span>
        <TactileSlider
          label="Follow a journey"
          options={model.journeys.map((item) => ({
            id: item.id,
            label: item.label,
          }))}
          value={journey}
          onChange={(value) => {
            setSelected(null);
            setJourney(value);
          }}
        />
        <button
          type="button"
          className="axj2-replay"
          onClick={() => setReplay((value) => value + 1)}
          aria-label="Send it through again"
          title="Send it through again"
        >
          <ArrowsClockwise weight="bold" />
        </button>
        <p className="axj2-caption" key={`${journey}:${replay}`}>
          {journey === "release" && !layout.legs.release.length
            ? "The release route has not been mapped. See Deployment for recorded releases."
            : current?.summary}
        </p>
      </div>

      <div
        className="axj2-viewport"
        tabIndex={0}
        role="region"
        aria-label="Architecture diagram; scroll horizontally to explore"
      >
        <div
          style={{ aspectRatio: `${W} / ${layout.height}` }}
          className={`axj2-stage${touring ? " is-touring" : ""}${planned ? " is-planned" : ""}${shift ? " is-shifting" : ""}`}
          data-journey={journey}
          data-shift={shift ?? undefined}
          onClick={() => setSelected(null)}
        >
          {/* The server, as a place. */}
          <div
            className="axj2-server"
            style={place(layout.rects.server ?? BOX.server)}
          >
            <button
              type="button"
              className={`axj2-server-head${selected === "host" ? " is-selected" : ""}${host?.checking ? " is-checking" : ""}`}
              data-c={host?.evidence.certainty ?? "unknown"}
              onClick={(event) => {
                event.stopPropagation();
                setSelected((currentId) =>
                  currentId === "host" ? null : "host",
                );
              }}
            >
              <span className="axj2-icon" aria-hidden="true">
                <HardDrives weight="duotone" />
              </span>
              {/* The card's header is the machine's name. With no host on
                  record it used to be an empty element beside an empty
                  reading — a server card that looked like it had failed to
                  load. Nothing has been established about the machine, and
                  saying so is both true and the thing a reader can act on. */}
              <b>
                {planned
                  ? `${host?.name ?? "Your server"}, once approved`
                  : (host?.name ?? "This server")}
              </b>
              <small>{model.region}</small>
              <span className="axj2-status">
                <i aria-hidden="true" />
                {host?.checking
                  ? "Checking…"
                  : (host?.evidence.short ?? "Not assessed")}
              </span>
            </button>
          </div>
          {services.length > 0 && (
            <div
              className="axj2-region axj2-private"
              style={place(layout.rects.private ?? BOX.private)}
            >
              <span>Private services</span>
            </div>
          )}
          {volumes.length > 0 && (
            <div
              className="axj2-region axj2-shelf"
              style={place(layout.rects.shelf ?? BOX.shelf)}
            >
              <span>Disk · kept when containers are replaced</span>
            </div>
          )}
          {model.byId.offsite && (
            <span
              className="axj2-zone"
              style={point(layout.rects.offsite.x, layout.rects.offsite.y - 24)}
            >
              Off the server
            </span>
          )}

          {/* Wires, and the light that travels them. */}
          <svg
            className="axj2-wires"
            viewBox={`0 ${TOP} ${W} ${layout.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="axj2Light"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2={W}
                y2="0"
              >
                <stop offset="0" stopColor="#285ad8" />
                <stop offset="0.45" stopColor="#5f82ee" />
                <stop offset="0.75" stopColor="#46a2de" />
                <stop offset="1" stopColor="#285ad8" />
              </linearGradient>
              <filter
                id="axj2Blur"
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
              >
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            {layout.wires.map((wire) => (
              <path
                key={`base:${wire.d}`}
                ref={(element) => {
                  pathRefs.current[wire.d] = element;
                }}
                d={wire.d}
                className={`axj2-wire j-${wire.journey}${wire.journey === journey ? " is-on" : ""}`}
              />
            ))}
            {(ghostPart ||
              model.parts.some(
                (part) =>
                  part.kind === "monitor" && !part.id.startsWith("gap:"),
              )) && <path d="M902 132H918" className="axj2-wire-ghost" />}
            {!planned &&
              layout.legs[journey].flat().map((d) => (
                <g
                  key={`glow:${journey}:${d}`}
                  className={`axj2-glow${touring ? "" : " is-lit"}`}
                >
                  <path
                    d={d}
                    className="axj2-glow-soft"
                    filter="url(#axj2Blur)"
                    pathLength={1}
                  />
                  <path d={d} className="axj2-glow-line" pathLength={1} />
                </g>
              ))}
            {!planned &&
              !touring &&
              !reduced &&
              layout.legs[journey].flat().map((d) =>
                [0].map((i) => (
                  <circle key={`p:${d}:${i}`} r="1.8" className="axj2-particle">
                    <animateMotion
                      dur="12s"
                      begin={`${i * 1.1}s`}
                      repeatCount="indefinite"
                      path={d}
                    />
                  </circle>
                )),
              )}
            {[0, 1].map((i) => (
              <g
                key={i}
                ref={(element) => {
                  comets.current[i] = element;
                }}
                className="axj2-comet"
                style={{ opacity: 0 }}
              >
                {Array.from({ length: 3 }, (_, k) => (
                  <circle
                    key={k}
                    r={Math.max(1, 2.5 - k * 0.5)}
                    style={{ opacity: 1 - k * 0.12 }}
                  />
                ))}
              </g>
            ))}
          </svg>

          {layout.labels.map((label, index) => (
            <span
              key={index}
              className="axj2-edge-label"
              style={point(label.x, label.y)}
            >
              {label.text}
            </span>
          ))}

          {/* The stops. */}
          {(
            [
              "source",
              "controller",
              "app",
              ...model.parts
                .filter(
                  (part) =>
                    (part.kind === "gate" || part.kind === "tls") &&
                    layout.rects[part.id],
                )
                .map((part) => part.id),
              ...services.map((service) => service.id),
              ...volumes.map((volume) => volume.id),
              ...model.parts
                .filter(
                  (part) =>
                    part.kind === "monitor" && !part.id.startsWith("gap:"),
                )
                .map((part) => part.id),
              "offsite",
            ].filter(Boolean) as string[]
          ).map((id, index) =>
            model.byId[id] && layout.rects[id] ? (
              <Card
                key={id}
                index={index}
                rect={layout.rects[id]}
                compact={
                  model.byId[id].kind === "volume" ||
                  model.byId[id].kind === "private" ||
                  // A placeholder's headline already says nothing has looked;
                  // its subtitle said so again, in a card with no room for
                  // either sentence.
                  id.startsWith("gap:")
                }
                // Read from the box the layout actually gave it, so a map that
                // had to make room says less per card rather than saying the
                // same amount outside the card.
                tight={layout.rects[id].h < 58}
                placeAt={place}
                {...cardProps(model.byId[id])}
              />
            ) : null,
          )}

          {ghostPart && (
            <Card
              index={9}
              rect={BOX.watch}
              part={ghostPart}
              model={model}
              selected={selected === ghostPart.id}
              dim={false}
              lit={false}
              arriving={false}
              ghost
              placeAt={place}
              // The headline already says nothing has looked. The subtitle said
              // so a second time, in a card that had room for neither.
              compact
              onSelect={(id) =>
                setSelected((currentId) => (currentId === id ? null : id))
              }
            />
          )}

          {selectedPart && selectedRect && (
            <Popover
              height={layout.height}
              key={selectedPart.id}
              part={selectedPart}
              rect={selectedRect}
              model={model}
              onClose={() => setSelected(null)}
              onOpenDestination={onOpenDestination}
              onAsk={onAsk}
            />
          )}
        </div>
      </div>
      <section className="axj2-connections" aria-label="Recorded connections">
        <h3>Connections</h3>
        {model.edges
          .filter(
            (edge) =>
              edge.network !== "disk" &&
              model.byId[edge.from] &&
              model.byId[edge.to],
          )
          .map((edge, index) => (
            <div className="axj2-connection" key={index}>
              <span>
                {model.byId[edge.from].name} <ArrowRight aria-hidden="true" />{" "}
                {model.byId[edge.to].name}
              </span>
              <span>{edge.label ?? "Endpoint not recorded"}</span>
              <small>
                {edge.network === "loopback"
                  ? "Host loopback"
                  : edge.network === "private"
                    ? "Private network"
                    : "Public network"}
              </small>
            </div>
          ))}
        <h3>Connection checks</h3>
        <p>
          Recorded results, not firewall rules. A connection that did not
          succeed does not establish what blocked it.
        </p>
        {gates.length ? (
          gates.map((part) => (
            <details className="axj2-connection-check" key={part.id}>
              <summary>
                <b>
                  {part.port ?? part.name.replace("Port ", "")}
                  <small>{part.role}</small>
                </b>
                <span>
                  {part.admits === "open"
                    ? "Open when checked"
                    : part.admits === "refused"
                      ? "Did not connect when checked"
                      : "Not confirmed"}
                </span>
                <span>
                  {part.serves
                    ? (model.byId[part.serves]?.name ??
                      "Destination not recorded")
                    : "Destination not recorded"}
                </span>
                <small>{part.evidence.short}</small>
              </summary>
              <p>{part.role}</p>
              {part.sources && <p>Recorded scope: {part.sources}</p>}
              <p>{part.evidence.detail}</p>
              <button
                type="button"
                className="ax-textlink"
                onClick={() => onOpenDestination("security")}
              >
                Open Security <ArrowRight />
              </button>
            </details>
          ))
        ) : (
          <p>No connection checks recorded.</p>
        )}
      </section>
    </section>
  );
}

export { BOX, layoutFor, W as MAP_W, TOP as MAP_TOP, H as MAP_H };
