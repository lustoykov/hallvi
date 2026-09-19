"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction A, third pass: Journeys. A visit, your data and a release travel
// through one server, drawn as crafted cards on a quiet canvas; stops light
// up as the light passes and open their details beside themselves. The header
// keeps the way back and Open, then comes the map, with what is not set up
// drawn where it would go. Hallvi's report lives on Overview, which
// shares this map's shape in miniature.

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
const { place, point } = placer(H);

const BOX: Record<string, Rect> = {
  source: { x: 24, y: 96, w: 172, h: 72 },
  controller: { x: 24, y: 264, w: 172, h: 72 },
  server: { x: 262, y: 80, w: 616, h: 452 },
  header: { x: 262, y: 80, w: 616, h: 54 },
  private: { x: 566, y: 206, w: 292, h: 170 },
  shelf: { x: 290, y: 398, w: 568, h: 114 },
  // Wider than the original 196: `paperless-webserver` is an ordinary
  // container name and it wrapped to two lines, which pushed the reading out
  // of the bottom of the card.
  app: { x: 308, y: 262, w: 244, h: 84 },
  svc: { x: 612, y: 262, w: 196, h: 76 },
  appVol: { x: 332, y: 434, w: 196, h: 60 },
  svcVol: { x: 612, y: 434, w: 196, h: 60 },
  offsite: { x: 924, y: 428, w: 176, h: 72 },
  // Taller than its neighbours on purpose: this slot holds a placeholder
  // whose headline is a sentence, and at 1280 a 72-unit box cut it off.
  watch: { x: 918, y: 96, w: 190, h: 86 },
  http: { x: 204, y: 284, w: 116, h: 32 },
  ssh: { x: 204, y: 366, w: 116, h: 32 },
};

interface Layout {
  rects: Record<string, Rect>;
  /** The canvas height this model needs, in the same units as the boxes. */
  height: number;
  legs: Record<JourneyId, string[][]>;
  wires: { d: string; journey: JourneyId }[];
  stops: Record<JourneyId, string[]>;
}

/**
 * Stacks n boxes down a band, or lays them along a row, keeping the single
 * case exactly where the design put it.
 */
function share(
  count: number,
  span: { start: number; end: number },
  thickness: number,
  gap = 12,
) {
  if (count < 1) return [];
  const room = span.end - span.start;
  // The floor is what a name and its reading-dot need, not an arbitrary
  // small number. Below it the box stops being a box with a label in it.
  const size = Math.min(
    thickness,
    Math.max(46, (room - gap * (count - 1)) / count),
  );
  const step = size + gap;
  const used = size * count + gap * (count - 1);
  const start = span.start + Math.max(0, (room - used) / 2);
  return Array.from({ length: count }, (_, index) => ({
    at: start + index * step,
    size,
  }));
}

function layoutFor(model: ArchitectureModel): Layout {
  // Every backing service, not the first one. Paperless runs PostgreSQL *and*
  // Valkey; Plausible runs PostgreSQL and ClickHouse. Drawing one of them and
  // saying nothing about the other is the map claiming a shape the records
  // contradict, which is the one thing this page must never do.
  const services = model.parts.filter((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const rects: Record<string, Rect> = {
    source: BOX.source,
    controller: BOX.controller,
    host: BOX.header,
    app: BOX.app,
    offsite: BOX.offsite,
    "gate:http": BOX.http,
    "gate:ssh": BOX.ssh,
    tls: { x: 222, y: 315, w: 80, h: 17 },
  };
  // One service sits exactly where the design drew it; several share the
  // zone, which reaches down to just above the disk shelf to make room —
  // two full-height cards fit in it exactly.
  rects.private =
    services.length > 1 ? { ...BOX.private, h: 186 } : BOX.private;
  const serviceRows =
    services.length === 1
      ? [{ at: BOX.svc.y, size: BOX.svc.h }]
      : share(
          services.length,
          // Below the zone's own label, down to just inside its bottom edge.
          { start: 236, end: rects.private.y + rects.private.h - 4 },
          BOX.svc.h,
          6,
        );
  services.forEach((service, index) => {
    rects[service.id] = {
      // Wider than the design's single-service slot, because three of them
      // share the zone and a name that wraps is a name that leaves its box.
      // The zone runs 566..858; this leaves the same margin on both sides.
      x: services.length > 1 ? BOX.private.x + 14 : BOX.svc.x,
      y: serviceRows[index].at,
      w: services.length > 1 ? BOX.private.w - 28 : BOX.svc.w,
      h: serviceRows[index].size,
    };
  });
  // A monitor Pi recorded takes the place the placeholder would have had, so
  // "something is watching this" is visible rather than merely not-missing.
  const monitor = model.parts.find(
    (part) => part.kind === "monitor" && !part.id.startsWith("gap:"),
  );
  if (monitor) rects[monitor.id] = BOX.watch;

  // Volumes keep the design's two slots while they fit it: the application's
  // data under the application, its service's under the service. Beyond that
  // they share the shelf in owner order, and the wire says whose each is.
  const ownerOf = (volume: Part) =>
    volume.owner && rects[volume.owner] ? volume.owner : undefined;
  const appVolumes = volumes.filter(
    (volume) =>
      ownerOf(volume) === "app" || (!ownerOf(volume) && volumes.length === 1),
  );
  const rest = volumes.filter((volume) => !appVolumes.includes(volume));
  const ordered = [...appVolumes, ...rest];
  const classic =
    appVolumes.length <= 1 &&
    rest.length <= 1 &&
    rest.every((volume) => ownerOf(volume) === services[0]?.id);
  if (classic) {
    if (appVolumes[0]) rects[appVolumes[0].id] = BOX.appVol;
    if (rest[0]) rects[rest[0].id] = BOX.svcVol;
  } else {
    // Wrapped, not squeezed.
    //
    // Four data locations in one row made each box 124 wide in a 1120-wide
    // space — about 105px on a 1280 screen — and the names an upstream
    // Compose file uses are longer than that. The box shrank, the text did
    // not, and every one of them rendered as `paperless…`.
    //
    // Two rows of two beats one row of four for the same reason: a name that
    // has to be read whole needs width, and there is more width in the shelf
    // than there is room for a fifth column.
    const perRow = Math.min(3, Math.max(1, Math.ceil(ordered.length / 2)));
    const rows = Math.ceil(ordered.length / perRow);
    // Above the threshold that drops a card to one clamped line: these
    // names are long and a wrapped one is worth more vertical space than a
    // cut one is worth saving.
    const rowHeight = rows > 1 ? 68 : BOX.appVol.h;
    const rowGap = 10;
    // The shelf grows to hold its rows rather than letting them out of it.
    const label = 26;
    const needed = label + rows * rowHeight + (rows - 1) * rowGap + 12;
    rects.shelf =
      needed > BOX.shelf.h ? { ...BOX.shelf, h: needed } : BOX.shelf;
    ordered.forEach((volume, index) => {
      const row = Math.floor(index / perRow);
      const inRow = Math.min(perRow, ordered.length - row * perRow);
      const columns = share(inRow, { start: 302, end: 846 }, 268, 16);
      rects[volume.id] = {
        x: columns[index % perRow].at,
        y: rects.shelf.y + label + row * (rowHeight + rowGap),
        w: columns[index % perRow].size,
        h: rowHeight,
      };
    });
  }
  rects.shelf = rects.shelf ?? BOX.shelf;
  // The server card contains the shelf, and the canvas contains the server.
  // Both follow it down rather than clipping it.
  const grew = Math.max(
    0,
    rects.shelf.y + rects.shelf.h + 20 - (BOX.server.y + BOX.server.h),
  );
  rects.server = { ...BOX.server, h: BOX.server.h + grew };
  rects.host = BOX.header;
  const height = H + grew;

  const visitEnd = services.length ? BOX.svc.x : BOX.app.x;
  const visitMain = `M196 300H${visitEnd}`;
  // A volume's wire starts at whatever mounts it and ends at wherever it was
  // placed, so ownership survives the shelf being shared.
  const centre = (rect: Rect) => rect.x + rect.w / 2;
  const visitBranches = ordered
    .map((volume) => {
      const owner = rects[ownerOf(volume) ?? "app"] ?? BOX.app;
      const from = centre(owner);
      const to = centre(rects[volume.id]);
      const top = owner.y + owner.h;
      const landing = rects[volume.id].y;
      // The elbow sits just above whatever row the volume ended up on.
      const elbow = rects.shelf.y - 6;
      return Math.abs(from - to) < 2
        ? `M${from} ${top}V${landing}`
        : `M${from} ${top}V${elbow}H${to}V${landing}`;
    })
    .filter((d): d is string => Boolean(d));
  const dataStart = ordered.length ? centre(rects[ordered[0].id]) : 710;
  // Out of the first row, at its middle, rather than at a y the shelf may
  // no longer occupy.
  const dataY = ordered.length
    ? rects[ordered[0].id].y + rects[ordered[0].id].h / 2
    : 464;
  const dataMain = `M${dataStart} ${dataY}H924`;
  const releaseMain = "M110 168V368Q110 382 124 382H372Q386 382 386 368V346";
  const releaseFork = services.length
    ? "M386 382H652Q666 382 666 368V338"
    : null;
  const legs: Record<JourneyId, string[][]> = {
    visit: [[visitMain], visitBranches].filter((leg) => leg.length),
    data: [[dataMain]],
    release: [[releaseMain], releaseFork ? [releaseFork] : []].filter(
      (leg) => leg.length,
    ),
  };
  const wires = (Object.keys(legs) as JourneyId[]).flatMap((journey) =>
    legs[journey].flat().map((d) => ({ d, journey })),
  );
  const ids = (...values: (string | undefined)[]) =>
    values.filter((value): value is string => Boolean(value));
  return {
    rects,
    height,
    legs,
    wires,
    stops: {
      visit: ids(
        "controller",
        "gate:http",
        "tls",
        "app",
        ...services.map((service) => service.id),
        ...ordered.map((volume) => volume.id),
      ),
      data: ids(...ordered.map((volume) => volume.id), "offsite"),
      release: ids(
        "source",
        "controller",
        "gate:ssh",
        "host",
        "app",
        ...services.map((service) => service.id),
      ),
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
      return part.id === "gate:ssh" ? (
        <Key weight="bold" />
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
      return `${part.name.split("/")[0]} · ${fact("Revision")?.slice(0, 7) ?? "no revision on record"}`;
    case "web":
      // Only an established public reach says so; silence says nothing.
      return model.openness === "public"
        ? "your application, public"
        : "your application";
    case "private":
      return "private, no way in";
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
  placeAt?: (r: Rect) => CSSProperties;
  ghost?: boolean;
  onSelect: (id: string) => void;
}) {
  const certainty = part.quiet ? "quiet" : part.evidence.certainty;
  return (
    <button
      type="button"
      className={`axj2-card k-${part.kind}${compact ? " is-compact" : ""}${tight ? " is-tight" : ""}${ghost ? " is-ghost" : ""}${selected ? " is-selected" : ""}${dim ? " is-dim" : ""}${lit ? " is-lit" : ""}${arriving ? " is-arriving" : ""}${part.checking ? " is-checking" : ""}`}
      data-c={certainty}
      style={{ ...(placeAt ?? place)(rect), ["--i" as string]: index }}
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
          <span className="axj2-status" data-tight={tight || undefined}>
            <i aria-hidden="true" />
            {tight ? null : part.checking ? "Checking…" : part.evidence.short}
          </span>
        )}
      </span>
    </button>
  );
}

function Port({
  part,
  rect,
  model,
  selected,
  dim,
  lit,
  onSelect,
}: {
  part: Part;
  rect: Rect;
  model: ArchitectureModel;
  selected: boolean;
  dim: boolean;
  lit: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`axj2-port${selected ? " is-selected" : ""}${dim ? " is-dim" : ""}${lit ? " is-lit" : ""}${part.checking ? " is-checking" : ""}`}
      data-c={part.evidence.certainty}
      style={place(rect)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(part.id);
      }}
      aria-expanded={selected}
      aria-label={`${part.name}, ${part.role}. ${part.evidence.short}.`}
      title={part.role}
    >
      {iconFor(part, model.openness)}
      <span className="axj2-port-text">
        <b>
          {part.name.replace("Port ", "")}
          <small> · {part.id === "gate:ssh" ? "SSH" : "HTTP"}</small>
        </b>
        <em>
          {part.id === "gate:ssh"
            ? "Hallvi"
            : model.openness === "restricted"
              ? "your network"
              : model.openness === "public"
                ? "anyone"
                : "not read back"}
        </em>
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
}: {
  part: Part;
  rect: Rect;
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
    const wanted = (Math.max(0, rect.y - TOP - 8) / H) * stageHeight;
    const top = Math.max(
      -8,
      Math.min(wanted, stageHeight - pop.offsetHeight + 24),
    );
    pop.style.top = `${top}px`;
  }, [rect]);
  return (
    <div
      ref={element}
      className={`axj2-pop${right ? " is-right" : " is-left"}`}
      style={point(right ? rect.x + rect.w + 14 : rect.x - 14, rect.y)}
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
        await travel(leg, 0.42);
        if (!alive()) return;
        hide();
        await wait(90);
      }
      if (!alive()) return;
      setLit(all);
      setTouring(false);
    })();
    return () => {
      tourId.current++;
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
          {current?.summary}
        </p>
      </div>

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
            data-c={host?.evidence.certainty}
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
            <b>
              {planned
                ? `${host?.name ?? "Your server"}, once approved`
                : host?.name}
            </b>
            <small>{model.region}</small>
            <span className="axj2-status">
              <i aria-hidden="true" />
              {host?.checking ? "Checking…" : host?.evidence.short}
            </span>
          </button>
        </div>
        {services.length > 0 && (
          <div
            className="axj2-region axj2-private"
            style={place(layout.rects.private ?? BOX.private)}
          >
            <span>Private network · no ports open</span>
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
        <span className="axj2-zone" style={point(924, 404)}>
          Off the server
        </span>

        {/* Wires, and the light that travels them. */}
        <svg
          className="axj2-wires"
          viewBox={`0 ${TOP} ${W} ${H}`}
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
            <filter id="axj2Blur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          {/* The firewall: a wall of blocks, open only where a door is. */}
          <path
            className="axj2-wall"
            d="M262 146V280M262 320V362M262 402V510"
          />
          <path
            className="axj2-jamb"
            d="M255 280H269M255 320H269M255 362H269M255 402H269"
          />
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
          <path
            className="axj2-wire-ssh"
            d="M110 336V368Q110 382 124 382H204"
          />
          {(ghostPart ||
            model.parts.some(
              (part) => part.kind === "monitor" && !part.id.startsWith("gap:"),
            )) && <path d="M878 132H924" className="axj2-wire-ghost" />}
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
              [0, 1, 2].map((i) => (
                <circle key={`p:${d}:${i}`} r="2.4" className="axj2-particle">
                  <animateMotion
                    dur={`${Math.max(1.6, d.length / 12)}s`}
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
              {Array.from({ length: 8 }, (_, k) => (
                <circle
                  key={k}
                  r={Math.max(1.1, 5 - k * 0.55)}
                  style={{ opacity: 1 - k * 0.12 }}
                />
              ))}
            </g>
          ))}
        </svg>

        {/* The ways in. */}
        {/* The firewall is named where its wall begins. */}
        <span className="axj2-wall-label" style={point(276, 151)}>
          Firewall ·{" "}
          {(() => {
            // Count what the map draws rather than assuming two.
            const doors = model.parts.filter(
              (part) => part.kind === "gate" && !part.id.startsWith("gap:"),
            ).length;
            // No door drawn is not a count of zero: it means the rules
            // have not been drawn, which is a different thing from none.
            if (!doors) return "rules not drawn";
            const named = doors === 1 ? "one door" : `${doors} doors`;
            return model.openness === "restricted"
              ? `only ${named} open`
              : model.openness === "public"
                ? `${named} open`
                : `${named} on record`;
          })()}
        </span>
        {(["gate:http", "gate:ssh"] as const).map((id) =>
          model.byId[id] ? (
            <Port
              key={id}
              part={model.byId[id]}
              rect={layout.rects[id]}
              model={model}
              selected={selected === id}
              dim={!onPath.has(id) && !touring}
              lit={lit.has(id)}
              onSelect={(value) =>
                setSelected((currentId) => (currentId === value ? null : value))
              }
            />
          ) : null,
        )}
        {model.byId.tls && model.byId.tls.evidence.certainty === "absent" && (
          <button
            type="button"
            className={`axj2-ghost axj2-ghost-tls${selected === "tls" ? " is-selected" : ""}${!onPath.has("tls") && !touring ? " is-dim" : ""}`}
            style={place(layout.rects.tls)}
            onClick={(event) => {
              event.stopPropagation();
              setSelected((currentId) => (currentId === "tls" ? null : "tls"));
            }}
          >
            <LockOpen weight="bold" /> no HTTPS
          </button>
        )}

        {/* The stops. */}
        {(
          [
            "source",
            "controller",
            "app",
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
    </section>
  );
}

export { BOX, layoutFor, W as MAP_W, TOP as MAP_TOP, H as MAP_H };
