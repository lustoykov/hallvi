"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction A, second pass: Journeys, polished. The same idea as the first
// pass (a visit, your data and a release travel through one server), drawn
// as crafted cards on a quiet canvas. Thin wires carry light; stops light up
// as it passes; details open beside the stop. Below the map, the agent's
// terminal shows its recorded work, and Little Server hops down from the
// server's roof to walk along it whenever it works.

import {
  ArrowRight,
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
  LockOpen,
  Prohibit,
  ShieldCheck,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { applicationSections } from "../application-sections";
import type { MascotMood } from "../home/mascot-scene";
import { CertaintyTag } from "./bits";
import type { DirectionProps } from "./index";
import {
  ago,
  type ArchitectureModel,
  type Certainty,
  type JourneyId,
  type LogLine,
  type Part,
} from "./model";
import {
  burstAt,
  reducedMotion,
  sparklePalettes,
  useReducedMotion,
} from "./motion";
import { TactileSlider } from "./tactile-slider";
import "./journey-v2.css";

const LittleServer = dynamic(
  () => import("../home/mascot-scene").then((module) => module.MascotScene),
  { ssr: false },
);

const W = 1120;
const H = 560;
type Rect = { x: number; y: number; w: number; h: number };

const pct = (value: number, total: number) => `${(value / total) * 100}%`;
const place = (r: Rect): CSSProperties => ({
  left: pct(r.x, W),
  top: pct(r.y, H),
  width: pct(r.w, W),
  height: pct(r.h, H),
});
const point = (x: number, y: number): CSSProperties => ({
  left: pct(x, W),
  top: pct(y, H),
});

const BOX: Record<string, Rect> = {
  source: { x: 24, y: 96, w: 172, h: 72 },
  controller: { x: 24, y: 264, w: 172, h: 72 },
  server: { x: 262, y: 80, w: 616, h: 452 },
  header: { x: 262, y: 80, w: 616, h: 54 },
  private: { x: 566, y: 206, w: 292, h: 170 },
  shelf: { x: 290, y: 398, w: 568, h: 114 },
  app: { x: 332, y: 262, w: 196, h: 76 },
  svc: { x: 612, y: 262, w: 196, h: 76 },
  appVol: { x: 332, y: 434, w: 196, h: 60 },
  svcVol: { x: 612, y: 434, w: 196, h: 60 },
  offsite: { x: 924, y: 428, w: 176, h: 72 },
  http: { x: 211, y: 286, w: 102, h: 28 },
  ssh: { x: 211, y: 368, w: 102, h: 28 },
};
/** Where Little Server stands on the roof, in stage units. */
const ROOF = { x: 770, y: -14, size: 112 };

interface Layout {
  rects: Record<string, Rect>;
  legs: Record<JourneyId, string[][]>;
  wires: { d: string; journey: JourneyId }[];
  stops: Record<JourneyId, string[]>;
}

function layoutFor(model: ArchitectureModel): Layout {
  const service = model.parts.find((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const appVolume = volumes.find((volume) => volume.owner === "app");
  const serviceVolume = service
    ? volumes.find((volume) => volume.owner === service.id)
    : undefined;
  const rects: Record<string, Rect> = {
    source: BOX.source,
    controller: BOX.controller,
    host: BOX.header,
    app: BOX.app,
    offsite: BOX.offsite,
    "gate:http": BOX.http,
    "gate:ssh": BOX.ssh,
    tls: { x: 226, y: 322, w: 72, h: 22 },
  };
  if (service) rects[service.id] = BOX.svc;
  if (appVolume) rects[appVolume.id] = BOX.appVol;
  if (serviceVolume) rects[serviceVolume.id] = BOX.svcVol;

  const visitEnd = service ? 612 : 332;
  const visitMain = `M196 300H${visitEnd}`;
  const visitBranches = [
    appVolume ? "M430 338V434" : null,
    serviceVolume ? "M710 338V434" : null,
  ].filter((d): d is string => Boolean(d));
  const dataStart = appVolume ? 430 : 710;
  const dataMain = `M${dataStart} 464H924`;
  const releaseMain = "M110 168V368Q110 382 124 382H372Q386 382 386 368V338";
  const releaseFork = service ? "M386 382H652Q666 382 666 368V338" : null;
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
    legs,
    wires,
    stops: {
      visit: ids(
        "controller",
        "gate:http",
        "tls",
        "app",
        service?.id,
        appVolume?.id,
        serviceVolume?.id,
      ),
      data: ids(appVolume?.id, serviceVolume?.id, "offsite"),
      release: ids("source", "controller", "gate:ssh", "host", "app", service?.id),
    },
  };
}

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

/** What a simulated check of a part would say it saw. */
function checkLine(part: Part) {
  const fact = (label: string) =>
    part.facts.find((item) => item.label === label)?.value;
  switch (part.kind) {
    case "host":
      return `${fact("Address") ?? part.name} answered over SSH`;
    case "gate":
      return `${part.name}: open to ${fact("Allowed from") ?? "its rule"}`;
    case "web":
      return `${fact("Health") ?? "GET /"} → 200 · ${part.name} is healthy`;
    case "private":
      return `${fact("Readiness") ?? "readiness"} → ready · ${part.name}`;
    default:
      return `${part.name} answered`;
  }
}

const conditionWord: Record<Certainty, string> = {
  verified: "Verified",
  stale: "Stale",
  failed: "Failed",
  planned: "Planned",
  unknown: "Not observed",
  absent: "Not set up",
};

/** Little Server's face, as the controller's icon. */
function ServerGuyFace() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="5" fill="#192338" />
      <rect x="7" y="8.5" width="2.6" height="5.2" rx="1.3" fill="#edf3ff" />
      <rect x="14.4" y="8.5" width="2.6" height="5.2" rx="1.3" fill="#edf3ff" />
      <path
        d="M9.2 15.6Q12 17.4 14.8 15.6"
        stroke="#d6e5ff"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function iconFor(part: Part, restricted: boolean): ReactNode {
  switch (part.kind) {
    case "controller":
      return <ServerGuyFace />;
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
      ) : restricted ? (
        <ShieldCheck weight="bold" />
      ) : (
        <Globe weight="bold" />
      );
    case "tls":
      return <LockOpen weight="bold" />;
  }
}

function titleFor(part: Part) {
  return part.kind === "source" ? (part.name.split("/").pop() ?? part.name) : part.name;
}

function subtitleFor(part: Part, model: ArchitectureModel) {
  const fact = (label: string) =>
    part.facts.find((item) => item.label === label)?.value;
  switch (part.kind) {
    case "controller":
      return "your network";
    case "source":
      return `${part.name.split("/")[0]} · ${fact("Revision")?.slice(0, 7) ?? "not chosen"}`;
    case "web":
      return model.restricted ? "your application" : "your application, public";
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
  popped,
  compact,
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
  popped: boolean;
  compact?: boolean;
  onSelect: (id: string) => void;
}) {
  const certainty = part.quiet ? "quiet" : part.evidence.certainty;
  return (
    <button
      type="button"
      className={`axj2-card k-${part.kind}${compact ? " is-compact" : ""}${selected ? " is-selected" : ""}${dim ? " is-dim" : ""}${lit ? " is-lit" : ""}${arriving ? " is-arriving" : ""}${popped ? " is-popped" : ""}${part.checking ? " is-checking" : ""}`}
      data-c={certainty}
      style={{ ...place(rect), ["--i" as string]: index }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(part.id);
      }}
      aria-expanded={selected}
      aria-label={`${part.name}, ${part.role}.${part.quiet ? "" : ` ${part.checking ? "Checking" : part.evidence.short}.`}`}
    >
      <span className="axj2-icon" aria-hidden="true">
        {iconFor(part, model.restricted)}
      </span>
      <span className="axj2-text">
        <b>{titleFor(part)}</b>
        {!compact && <small>{subtitleFor(part, model)}</small>}
        {!part.quiet && (
          <span className="axj2-status">
            <i aria-hidden="true" />
            {part.checking ? "Checking…" : part.evidence.short}
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
      {iconFor(part, model.restricted)}
      <span>{part.name.replace("Port ", "")}</span>
      <em>
        {part.id === "gate:ssh"
          ? "Server Guy"
          : model.restricted
            ? "you only"
            : "anyone"}
      </em>
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
    const wanted = (Math.max(0, rect.y - 8) / H) * stageHeight;
    const top = Math.max(-8, Math.min(wanted, stageHeight - pop.offsetHeight + 24));
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
          {iconFor(part, model.restricted)}
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
              <dd className={fact.mono ? "ax-mono" : undefined}>{fact.value}</dd>
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

const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const day = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const glyph: Record<LogLine["tone"], string> = {
  pass: "✓",
  fail: "✗",
  work: "›",
  info: "·",
};

export function JourneyDirection({
  model,
  recheck,
  onOpenDestination,
  onAsk,
}: DirectionProps) {
  const reduced = useReducedMotion();
  const layout = useMemo(() => layoutFor(model), [model]);
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const [journey, setJourney] = useState<JourneyId>("visit");
  const [replay, setReplay] = useState(0);
  const [touring, setTouring] = useState(false);
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const [arriving, setArriving] = useState<Set<string>>(() => new Set());
  const [popped, setPopped] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [entering, setEntering] = useState(true);
  const [shift, setShift] = useState<Certainty | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [mood, setMood] = useState<MascotMood | null>(null);
  const [gesture, setGesture] = useState(0);
  const [liveLines, setLiveLines] = useState<LogLine[]>([]);
  const [perch, setPerch] = useState<"roof" | "terminal">("roof");
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const terminal = useRef<HTMLDivElement>(null);
  const newest = useRef<HTMLSpanElement>(null);
  const mascot = useRef<HTMLDivElement>(null);
  const spot = useRef<{ x: number; y: number } | null>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const comets = useRef<(SVGGElement | null)[]>([]);
  const tourId = useRef(0);
  const firstTour = useRef(true);
  const seenMarks = useRef<Record<string, string>>({});
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const say = useCallback(
    (text: string, ms = 2800) => {
      setBubble(text);
      later(() => setBubble((current) => (current === text ? null : current)), ms);
    },
    [later],
  );

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
    const start = window.setTimeout(() => {
      setShift(model.condition.certainty);
      if (model.condition.certainty === "stale")
        say("I haven't looked in a while.", 3200);
      if (model.condition.certainty === "planned")
        say("Nothing to look after yet.", 3200);
    }, 0);
    const end = window.setTimeout(() => setShift(null), 1300);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [model.condition.certainty, say]);

  // The simulated re-check writes to the terminal, step by step.
  useEffect(() => {
    if (recheck.phase === "idle") {
      seenMarks.current = {};
      const timer = window.setTimeout(() => setLiveLines([]), 0);
      return () => window.clearTimeout(timer);
    }
    const at = new Date().toISOString();
    const add: LogLine[] = [];
    for (const [id, mark] of Object.entries(recheck.marks)) {
      if (seenMarks.current[id] === mark) continue;
      const part = model.byId[id];
      if (!part) continue;
      add.push(
        mark === "checking"
          ? { id: `live:${id}:checking`, at, tone: "work", text: `Checking ${part.name}…`, invented: true }
          : mark === "passed"
            ? { id: `live:${id}:passed`, at, tone: "pass", text: checkLine(part), invented: true }
            : {
                id: `live:${id}:failed`,
                at,
                tone: "fail",
                text: `${part.name} isn't answering · ${part.evidence.detail.replace(/^Simulated re-check\. /, "")}`,
                invented: true,
              },
      );
    }
    seenMarks.current = { ...recheck.marks };
    if (recheck.phase === "passed")
      add.push({ id: "live:done", at, tone: "pass", text: "Everything answered.", invented: true });
    if (!add.length) return;
    const timer = window.setTimeout(
      () =>
        setLiveLines((previous) => [
          ...previous,
          ...add.filter((line) => !previous.some((old) => old.id === line.id)),
        ]),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [recheck.marks, recheck.phase, model.byId]);

  // Celebrate a pass, open a failure, and send Little Server where the work is.
  useEffect(() => {
    if (recheck.phase === "running") {
      const timer = window.setTimeout(() => setPerch("terminal"), 0);
      return () => window.clearTimeout(timer);
    }
    if (recheck.phase === "idle") {
      const timer = window.setTimeout(() => setPerch("roof"), 0);
      return () => window.clearTimeout(timer);
    }
    if (recheck.phase === "passed") {
      const timers = [
        window.setTimeout(() => {
          setPopped(true);
          setMood("celebrating");
          setGesture((value) => value + 1);
          burstAt(mascot.current, {
            count: 22,
            spread: 64,
            size: 10,
            palette: sparklePalettes.verified,
          });
        }, 120),
        window.setTimeout(() => setPopped(false), 1200),
        window.setTimeout(() => setMood(null), 2800),
        window.setTimeout(() => setPerch("roof"), 3300),
      ];
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    if (recheck.phase === "failed" && recheck.active) {
      const failed = recheck.active;
      const timer = window.setTimeout(() => {
        setSelected(failed);
        burstAt(mascot.current, {
          count: 8,
          spread: 30,
          palette: sparklePalettes.failed,
        });
      }, 120);
      return () => window.clearTimeout(timer);
    }
  }, [recheck.phase, recheck.active]);

  // Little Server's spot: the roof of the server, or the end of the newest
  // terminal line. It hops between them and walks along the terminal.
  const lines = useMemo(
    () => [...model.log, ...liveLines].slice(-8),
    [model.log, liveLines],
  );
  const reposition = useCallback(
    (animate: boolean) => {
      const host = section.current;
      const map = stage.current;
      const element = mascot.current;
      if (!host || !map || !element) return;
      const origin = host.getBoundingClientRect();
      const size = element.offsetWidth;
      let x: number;
      let y: number;
      const term = terminal.current?.getBoundingClientRect();
      if (perch === "terminal" && term) {
        const end = newest.current?.getBoundingClientRect().right ?? term.left + 200;
        x = Math.min(term.right - size - 10, Math.max(term.left + 10, end - size * 0.3)) - origin.left;
        y = term.top - origin.top - size * 0.84;
      } else {
        const r = map.getBoundingClientRect();
        x = r.left - origin.left + (ROOF.x / W) * r.width;
        y = r.top - origin.top + (ROOF.y / H) * r.height;
      }
      const from = spot.current;
      spot.current = { x, y };
      const to = `translate(${x}px, ${y}px)`;
      element.style.transform = to;
      if (!animate || !from || reducedMotion()) return;
      const distance = Math.hypot(x - from.x, y - from.y);
      if (distance < 2) return;
      const lift = Math.min(90, 18 + distance * 0.16);
      element.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px)` },
          {
            transform: `translate(${(from.x + x) / 2}px, ${Math.min(from.y, y) - lift}px)`,
            offset: 0.5,
          },
          { transform: to },
        ],
        {
          duration: Math.min(820, 360 + distance * 0.55),
          easing: "cubic-bezier(0.35, 0.1, 0.25, 1)",
        },
      );
    },
    [perch],
  );
  const newestId = lines[lines.length - 1]?.id;
  useLayoutEffect(() => {
    reposition(true);
  }, [reposition, newestId]);
  useEffect(() => {
    const host = section.current;
    if (!host) return;
    const observer = new ResizeObserver(() => reposition(false));
    observer.observe(host);
    return () => observer.disconnect();
  }, [reposition]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const failedPart = model.parts.find(
    (part) => part.evidence.certainty === "failed",
  );
  const mascotMood: MascotMood =
    mood ??
    (recheck.phase === "running"
      ? "checking"
      : recheck.phase === "failed" || failedPart
        ? "attention"
        : model.condition.certainty === "stale"
          ? "resting"
          : "ready");

  const onPath = new Set(layout.stops[journey]);
  const service = model.parts.find((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const planned = model.status !== "live";
  const host = model.byId.host;
  const order = ["host", "gate:http", "app", service?.id].filter(
    (id): id is string => Boolean(id && model.byId[id]),
  );
  const current = model.journeys.find((item) => item.id === journey);
  const selectedPart = selected ? model.byId[selected] : null;
  const selectedRect = selected ? layout.rects[selected] : null;
  const simulating = recheck.phase !== "idle";
  const lastRecorded = model.log[model.log.length - 1];
  const cardProps = (part: Part) => ({
    part,
    model,
    selected: selected === part.id,
    dim: !onPath.has(part.id) && !touring,
    lit: lit.has(part.id),
    arriving: arriving.has(part.id),
    popped: popped && order.includes(part.id),
    onSelect: (id: string) =>
      setSelected((currentId) => (currentId === id ? null : id)),
  });

  return (
    <section
      ref={section}
      className="axj2"
      aria-label="Architecture as journeys"
    >
      <div className="axj2-condition">
        <CertaintyTag certainty={model.condition.certainty}>
          {conditionWord[model.condition.certainty]}
        </CertaintyTag>
        <p key={model.condition.text}>{model.condition.text}</p>
      </div>

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
        <button
          type="button"
          className="ax-button"
          disabled={recheck.phase === "running" || planned}
          onClick={() => {
            setSelected(null);
            recheck.run(order, 1100);
          }}
        >
          {recheck.phase === "running" && (
            <SpinnerGap weight="bold" className="ax-spin" />
          )}
          {recheck.phase === "running" ? "Checking…" : "Ask Server Guy to re-check"}
          <span className="ax-invented">simulated</span>
        </button>
      </div>

      <div
        ref={stage}
        className={`axj2-stage${entering ? " is-entering" : ""}${planned ? " is-planned" : ""}${shift ? " is-shifting" : ""}`}
        data-journey={journey}
        data-shift={shift ?? undefined}
        onClick={() => setSelected(null)}
      >
        {/* The server, as a place. */}
        <div className="axj2-server" style={place(BOX.server)}>
          <button
            type="button"
            className={`axj2-server-head${selected === "host" ? " is-selected" : ""}${host?.checking ? " is-checking" : ""}${popped ? " is-popped" : ""}`}
            data-c={host?.evidence.certainty}
            onClick={(event) => {
              event.stopPropagation();
              setSelected((currentId) => (currentId === "host" ? null : "host"));
            }}
          >
            <span className="axj2-icon" aria-hidden="true">
              <HardDrives weight="duotone" />
            </span>
            <b>{planned ? `${host?.name ?? "Your server"}, once approved` : host?.name}</b>
            <small>{model.region}</small>
            <span className="axj2-status">
              <i aria-hidden="true" />
              {host?.checking ? "Checking…" : host?.evidence.short}
            </span>
          </button>
        </div>
        {service && (
          <div className="axj2-region axj2-private" style={place(BOX.private)}>
            <span>Private network · no ports open</span>
          </div>
        )}
        {volumes.length > 0 && (
          <div className="axj2-region axj2-shelf" style={place(BOX.shelf)}>
            <span>Disk · kept when containers are replaced</span>
          </div>
        )}
        <span className="axj2-zone" style={point(924, 404)}>
          Off the server
        </span>

        {/* Wires, and the light that travels them. */}
        <svg
          className="axj2-wires"
          viewBox={`0 0 ${W} ${H}`}
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
          {!planned &&
            layout.legs[journey].flat().map((d) => (
              <g key={`glow:${journey}:${d}`} className={`axj2-glow${touring ? "" : " is-lit"}`}>
                <path d={d} className="axj2-glow-soft" filter="url(#axj2Blur)" pathLength={1} />
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
                <circle key={k} r={Math.max(1.1, 5 - k * 0.55)} style={{ opacity: 1 - k * 0.12 }} />
              ))}
            </g>
          ))}
        </svg>

        {/* The ways in. */}
        {model.restricted && (
          <span className="axj2-ghost axj2-ghost-refused" style={point(262, 250)}>
            <Prohibit weight="bold" /> Everyone else: turned away
          </span>
        )}
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
            service?.id,
            ...volumes.map((volume) => volume.id),
            "offsite",
          ].filter(Boolean) as string[]
        ).map((id, index) =>
          model.byId[id] && layout.rects[id] ? (
            <Card
              key={id}
              index={index}
              rect={layout.rects[id]}
              compact={model.byId[id].kind === "volume"}
              {...cardProps(model.byId[id])}
            />
          ) : null,
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

      {/* The agent's terminal: what it did, and what it is doing. */}
      <div
        ref={terminal}
        className={`axj2-term${simulating ? " is-live" : ""}`}
        aria-label="Server Guy's recent work"
      >
        <header>
          <span>
            server-guy · {model.headline.toLowerCase()} · {host?.name.toLowerCase() ?? "server"}
          </span>
          <em className={simulating ? "is-simulated" : undefined}>
            {simulating
              ? recheck.phase === "running"
                ? "Simulated re-check · nothing is contacted"
                : "Simulated re-check · nothing was contacted"
              : lastRecorded
                ? `Recorded work · last ${ago(lastRecorded.at, model.now)}`
                : "No work recorded yet"}
          </em>
        </header>
        <div className="axj2-term-lines" role="log" aria-live="polite">
          {lines.length === 0 && (
            <div className="axj2-term-line" data-tone="info">
              <time>--:--:--</time>
              <b>·</b>
              <span ref={newest}>
                {planned
                  ? "Nothing has run yet. The plan waits for your approval."
                  : "No work recorded yet."}
              </span>
            </div>
          )}
          {lines.map((line, i) => {
            const previous = lines[i - 1];
            const isNewest = i === lines.length - 1;
            return (
              <Fragment key={line.id}>
                {(!previous || day(previous.at) !== day(line.at)) && (
                  <div className="axj2-term-day">{day(line.at)}</div>
                )}
                <div
                  className={`axj2-term-line${isNewest ? " is-newest" : ""}${line.invented ? " is-invented" : ""}`}
                  data-tone={line.tone}
                >
                  <time>{clock(line.at)}</time>
                  <b aria-hidden="true">{glyph[line.tone]}</b>
                  <span
                    ref={isNewest ? newest : undefined}
                    data-tag={
                      line.invented
                        ? line.id.startsWith("live:")
                          ? "sim"
                          : "invented"
                        : undefined
                    }
                  >
                    {line.text}
                    {isNewest && recheck.phase === "running" && (
                      <i className="axj2-caret" aria-hidden="true" />
                    )}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Little Server: on the roof of its server, or at work on the terminal. */}
      <div
        ref={mascot}
        className={`axj2-mascot${perch === "terminal" ? " is-working" : ""}`}
        onClick={() => {
          setMood("waving");
          setGesture((value) => value + 1);
          say(
            planned
              ? "I'll build this once you approve the plan."
              : "Hi! I look after this server.",
          );
          later(() => setMood(null), 2600);
        }}
        role="button"
        tabIndex={0}
        aria-label="Little Server. Say hello."
      >
        <LittleServer color={3} mood={mascotMood} gesture={gesture} paused={reduced} />
        {bubble && (
          <div className="axj2-bubble" key={bubble}>
            {bubble}
          </div>
        )}
      </div>

      {model.gaps.length > 0 && (
        <div className="axj2-gaps">
          {model.gaps.map((gap) => (
            <div key={gap.id} className="axj2-gap">
              <span className="axj2-gap-icon" aria-hidden="true">
                {gap.id === "tls" ? <LockOpen weight="bold" /> : <Heartbeat weight="bold" />}
              </span>
              <div>
                <b>{gap.title}</b>
                <p>{gap.detail}</p>
              </div>
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
