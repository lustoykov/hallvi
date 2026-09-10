"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction A — Journeys. The one server drawn as a place that three things
// travel through: a visit, your data and a release. Choosing a journey sends
// it through once, so the path explains itself; choosing a stop unfolds what
// is exactly there and how Server Guy knows. Chat stays the place to act.

import {
  ArrowRight,
  ArrowsClockwise,
  ChatCircleText,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { applicationSections } from "../application-sections";
import { CertaintyTag, certaintyWord, FactList } from "./bits";
import { Caretaker, type CaretakerPose } from "./caretaker";
import type { DirectionProps } from "./index";
import {
  ago,
  type ArchitectureModel,
  type Certainty,
  type JourneyId,
  type Part,
} from "./model";
import {
  burstAt,
  reducedMotion,
  sparklePalettes,
  useReducedMotion,
} from "./motion";
import { TactileSlider } from "./tactile-slider";
import "./journey.css";

const W = 1120;
const H = 456;
const Y = { source: 84, visit: 196, ssh: 304, disk: 394 };
type Point = { x: number; y: number };
type Place = "above" | "below" | "left" | "below-right" | "below-left";

interface Layout {
  at: Record<string, Point>;
  place: Record<string, Place>;
  paths: Record<string, string>;
  lines: Record<JourneyId, string[]>;
  tours: Record<JourneyId, string[][]>;
}

/** Along, then round a corner and up (or down) into the target. */
function elbow(from: Point, to: Point, r = 24) {
  const dir = to.y < from.y ? -1 : 1;
  return `M${from.x} ${from.y}H${to.x - r}Q${to.x} ${from.y} ${to.x} ${from.y + dir * r}V${to.y}`;
}

function layoutFor(model: ArchitectureModel): Layout {
  const services = model.parts.filter((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const at: Record<string, Point> = {
    source: { x: 120, y: Y.source },
    controller: { x: 120, y: Y.visit },
    tls: { x: 214, y: Y.visit },
    "gate:http": { x: 300, y: Y.visit },
    "gate:ssh": { x: 300, y: Y.ssh },
    host: { x: 384, y: Y.ssh },
    app: { x: 462, y: Y.visit },
    offsite: { x: 1022, y: Y.disk },
  };
  const place: Record<string, Place> = {
    source: "above",
    controller: "left",
    tls: "below",
    "gate:http": "below-right",
    "gate:ssh": "below-left",
    host: "below",
    app: "above",
    offsite: "below",
  };
  services.forEach((service, i) => {
    const spread =
      services.length > 1 ? (i / (services.length - 1) - 0.5) * 150 : 0;
    at[service.id] = { x: 742 + spread, y: Y.visit };
    place[service.id] = "above";
  });
  const stacked: Record<string, number> = {};
  volumes.forEach((volume) => {
    const owner = volume.owner && at[volume.owner] ? volume.owner : "app";
    const n = (stacked[owner] = (stacked[owner] ?? 0) + 1);
    at[volume.id] = { x: at[owner].x + (n - 1) * 96, y: Y.disk };
    place[volume.id] = "below";
  });

  const paths: Record<string, string> = {};
  const add = (a: string, b: string, d?: string) => {
    const p = at[a];
    const q = at[b];
    if (!p || !q) return null;
    const key = `${a}>${b}`;
    paths[key] =
      d ??
      (p.y === q.y
        ? `M${p.x} ${p.y}H${q.x}`
        : p.x === q.x
          ? `M${p.x} ${p.y}V${q.y}`
          : elbow(p, q));
    return key;
  };
  const keys = (...values: (string | null | undefined)[]) =>
    values.filter((value): value is string => Boolean(value));
  const ownerOf = (volume: Part) =>
    volume.owner && at[volume.owner] ? volume.owner : "app";
  const called = services.filter((service) => service.owner === "app");

  const visit = keys(
    add("controller", "tls"),
    add("tls", "gate:http"),
    add("gate:http", "app"),
    ...called.map((service) => add("app", service.id)),
    ...volumes.map((volume) => add(ownerOf(volume), volume.id)),
  );
  const shelf = [...volumes].sort((a, b) => at[a.id].x - at[b.id].x);
  const data = keys(
    ...shelf.slice(1).map((volume, i) => add(shelf[i].id, volume.id)),
    shelf.length ? add(shelf[shelf.length - 1].id, "offsite") : null,
  );
  const release = keys(
    add("source", "controller"),
    add(
      "controller",
      "gate:ssh",
      `M120 ${Y.visit}C120 ${Y.visit + 78} 196 ${Y.ssh} 300 ${Y.ssh}`,
    ),
    add("gate:ssh", "host"),
    add("host", "app", elbow(at.host, { x: at.app.x + 14, y: Y.visit + 18 })),
    ...services.map((service) =>
      add(
        "host",
        service.id,
        elbow(at.host, { x: at[service.id].x + 14, y: Y.visit + 18 }),
      ),
    ),
  );

  const tours: Record<JourneyId, string[][]> = {
    visit: [
      ["controller>tls"],
      ["tls>gate:http"],
      ["gate:http>app"],
      [
        ...called.map((service) => `app>${service.id}`),
        ...volumes
          .filter((volume) => ownerOf(volume) === "app")
          .map((volume) => `app>${volume.id}`),
      ],
      volumes
        .filter((volume) => ownerOf(volume) !== "app")
        .map((volume) => `${ownerOf(volume)}>${volume.id}`),
    ],
    data: [
      ...shelf.slice(1).map((volume, i) => [`${shelf[i].id}>${volume.id}`]),
      shelf.length ? [`${shelf[shelf.length - 1].id}>offsite`] : [],
    ],
    release: [
      ["source>controller"],
      ["controller>gate:ssh"],
      ["gate:ssh>host"],
      ["host>app", ...services.map((service) => `host>${service.id}`)],
    ],
  };
  for (const id of Object.keys(tours) as JourneyId[])
    tours[id] = tours[id]
      .map((leg) => leg.filter((key) => paths[key]))
      .filter((leg) => leg.length);
  return { at, place, paths, lines: { visit, data, release }, tours };
}

const pct = (p: Point): CSSProperties => ({
  left: `${(p.x / W) * 100}%`,
  top: `${(p.y / H) * 100}%`,
});

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

const conditionWord: Record<Certainty, string> = {
  ...certaintyWord,
  verified: "Verified",
};

function Station({
  part,
  at,
  selected,
  hovered,
  dim,
  register,
}: {
  part: Part;
  at: Point;
  selected: boolean;
  hovered: boolean;
  dim: boolean;
  register: (element: SVGGElement | null) => void;
}) {
  const certainty = part.evidence.certainty;
  const shape =
    part.kind === "web"
      ? "capsule"
      : part.kind === "volume" || part.kind === "offsite"
        ? "square"
        : part.kind === "gate"
          ? "door"
          : "circle";
  const core =
    shape === "capsule" ? (
      <rect x="-25" y="-13" width="50" height="26" rx="13" />
    ) : shape === "square" ? (
      <rect x="-11" y="-11" width="22" height="22" rx="6" />
    ) : shape === "door" ? (
      <rect x="-7.5" y="-15" width="15" height="30" rx="4" />
    ) : (
      <circle r="10" />
    );
  const ring =
    shape === "capsule" ? (
      <rect x="-32" y="-20" width="64" height="40" rx="20" />
    ) : shape === "square" ? (
      <rect x="-18" y="-18" width="36" height="36" rx="11" />
    ) : shape === "door" ? (
      <rect x="-14" y="-22" width="28" height="44" rx="9" />
    ) : (
      <circle r="17" />
    );
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <g
        ref={register}
        className={`axj-st k-${part.kind}${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}${dim ? " is-dim" : ""}${part.checking ? " is-checking" : ""}`}
        data-c={part.quiet ? "quiet" : certainty}
      >
        <circle className="axj-st-ping" r="12" />
        <g className="axj-st-ring">{ring}</g>
        <g className="axj-st-core">{core}</g>
        {part.kind === "controller" && (
          <circle className="axj-st-you" r="3.4" />
        )}
        <circle className="axj-st-spin" r="25" pathLength={100} />
      </g>
    </g>
  );
}

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
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const [entering, setEntering] = useState(true);
  const [shift, setShift] = useState<Certainty | null>(null);
  const [wave, setWave] = useState(false);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const stationRefs = useRef<Record<string, SVGGElement | null>>({});
  const tokenRefs = useRef<(SVGGElement | null)[]>([]);
  const caretaker = useRef<HTMLDivElement>(null);
  const tourId = useRef(0);
  const firstTour = useRef(true);
  const lastTouch = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  const ping = useCallback((id: string) => {
    const element = stationRefs.current[id];
    if (!element) return;
    element.classList.remove("is-pinged");
    void element.getBoundingClientRect();
    element.classList.add("is-pinged");
  }, []);

  // A journey travels once when chosen, lighting its line behind the token.
  useEffect(() => {
    const id = ++tourId.current;
    const { tours, lines } = layoutRef.current;
    const legs = tours[journey];
    const all = new Set(lines[journey]);
    const timers: number[] = [];
    let raf = 0;
    const alive = () => tourId.current === id;
    const hideTokens = () =>
      tokenRefs.current.forEach((token) => {
        if (token) token.style.opacity = "0";
      });
    const delay = firstTour.current ? 1150 : 140;
    firstTour.current = false;
    if (reducedMotion()) {
      timers.push(window.setTimeout(() => setLit(all), 0));
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });
    const travel = (segmentKeys: string[], ms: number) =>
      new Promise<void>((resolve) => {
        const paths = segmentKeys
          .map((key) => pathRefs.current[key])
          .filter((path): path is SVGPathElement => Boolean(path));
        const lengths = paths.map((path) => path.getTotalLength());
        const start = performance.now();
        const frame = (time: number) => {
          if (!alive()) {
            resolve();
            return;
          }
          const t = Math.min(1, (time - start) / ms);
          const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
          paths.forEach((path, i) => {
            const token = tokenRefs.current[i];
            if (!token) return;
            const point = path.getPointAtLength(lengths[i] * e);
            token.setAttribute("transform", `translate(${point.x} ${point.y})`);
            token.style.opacity = "1";
          });
          if (t < 1) raf = requestAnimationFrame(frame);
          else resolve();
        };
        raf = requestAnimationFrame(frame);
      });
    void (async () => {
      timers.push(window.setTimeout(() => setLit(new Set()), 0));
      await wait(delay);
      for (const leg of legs) {
        if (!alive()) return;
        setLit((previous) => new Set([...previous, ...leg]));
        await travel(leg, 640);
        if (!alive()) return;
        hideTokens();
        leg.forEach((key) => ping(key.split(">")[1]));
        await wait(130);
      }
      if (alive()) setLit(all);
    })();
    return () => {
      tourId.current++;
      timers.forEach((timer) => window.clearTimeout(timer));
      cancelAnimationFrame(raf);
      hideTokens();
    };
  }, [journey, replay, ping]);

  // A change of record explains itself once: a wash in the new state's tint.
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

  // ---- The caretaker: rests by state, walks to what it checks.
  const failedId =
    model.parts.find((part) => part.evidence.certainty === "failed")?.id ??
    null;
  const resting: CaretakerPose =
    model.condition.certainty === "stale"
      ? "sleep"
      : model.condition.certainty === "failed"
        ? "worry"
        : "idle";
  const beside = useCallback(
    (id: string): Point => {
      const p = layoutRef.current.at[id] ?? layout.at.app;
      return { x: p.x + 34, y: p.y };
    },
    [layout.at.app],
  );
  const home = useCallback((): Point => {
    if (model.status !== "live") return { x: 172, y: Y.visit };
    if (failedId) return beside(failedId);
    return { x: 566, y: Y.visit };
  }, [model.status, failedId, beside]);
  const [ct, setCt] = useState<{
    spot: Point;
    pose: CaretakerPose;
    facing: 1 | -1;
    ms: number;
  }>(() => ({ spot: home(), pose: resting, facing: 1, ms: 0 }));
  const spotRef = useRef(ct.spot);
  const walkTimers = useRef<number[]>([]);
  const walk = useCallback(
    (to: Point, then: CaretakerPose, onArrive?: () => void) => {
      const from = spotRef.current;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const ms =
        reducedMotion() || distance < 2
          ? 0
          : Math.max(260, Math.min(900, distance / 0.55));
      spotRef.current = to;
      walkTimers.current.forEach((timer) => window.clearTimeout(timer));
      walkTimers.current = [];
      setCt({
        spot: to,
        pose: ms ? "walk" : then,
        facing: to.x < from.x ? -1 : 1,
        ms,
      });
      walkTimers.current.push(
        window.setTimeout(() => {
          setCt((current) =>
            current.spot === to ? { ...current, pose: then } : current,
          );
          onArrive?.();
        }, ms),
      );
    },
    [],
  );
  useEffect(
    () => () => walkTimers.current.forEach((timer) => window.clearTimeout(timer)),
    [],
  );

  const restingRef = useRef(resting);
  const homeRef = useRef(home);
  const phaseRef = useRef(recheck.phase);
  useEffect(() => {
    restingRef.current = resting;
    homeRef.current = home;
    phaseRef.current = recheck.phase;
  });

  // Settle when the record changes and nothing is being checked.
  useEffect(() => {
    if (recheck.phase === "running") return;
    if (recheck.phase === "passed" || recheck.phase === "failed") return;
    const timer = window.setTimeout(() => walk(home(), resting), 0);
    return () => window.clearTimeout(timer);
  }, [resting, home, walk, recheck.phase]);

  useEffect(() => {
    if (recheck.phase === "running" && recheck.active) {
      const timer = window.setTimeout(
        () => walk(beside(recheck.active!), "check"),
        0,
      );
      return () => window.clearTimeout(timer);
    }
    if (recheck.phase === "passed") {
      const timers = [
        window.setTimeout(() => {
          setCt((current) => ({ ...current, pose: "cheer" }));
          burstAt(caretaker.current, {
            count: 20,
            spread: 58,
            palette: sparklePalettes.verified,
            size: 10,
          });
          if (!reducedMotion()) setWave(true);
        }, 60),
        window.setTimeout(() => setWave(false), 1500),
        window.setTimeout(() => walk(homeRef.current(), restingRef.current), 2600),
      ];
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }
    if (recheck.phase === "failed" && recheck.active) {
      const failedPart = recheck.active;
      const timer = window.setTimeout(() => {
        setCt((current) => ({ ...current, pose: "worry" }));
        setSelected(failedPart);
        burstAt(caretaker.current, {
          count: 8,
          spread: 30,
          palette: sparklePalettes.failed,
        });
      }, 40);
      return () => window.clearTimeout(timer);
    }
  }, [recheck.phase, recheck.active, walk, beside]);

  // Now and then, with nothing else going on, it wanders to a stop and looks.
  useEffect(() => {
    if (reduced) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          const quiet =
            phaseRef.current === "idle" &&
            !document.hidden &&
            Date.now() - lastTouch.current > 12_000 &&
            restingRef.current === "idle";
          if (quiet) {
            const stops = layoutRef.current.lines.visit
              .map((key) => key.split(">")[1])
              .filter((id) => id !== "tls");
            const id = stops[Math.floor(Math.random() * stops.length)];
            walk(beside(id), "check", () => {
              walkTimers.current.push(
                window.setTimeout(
                  () => walk(homeRef.current(), restingRef.current),
                  1500,
                ),
              );
            });
          }
          schedule();
        },
        24_000 + Math.random() * 16_000,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [reduced, walk, beside]);

  const touch = () => {
    lastTouch.current = Date.now();
  };
  const select = (id: string) => {
    touch();
    setSelected((current) => (current === id ? null : id));
  };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const order = [
    "host",
    "gate:http",
    "app",
    ...model.parts
      .filter((part) => part.kind === "private")
      .map((part) => part.id),
  ].filter((id) => model.byId[id]);
  const inJourney = new Set(
    layout.lines[journey].flatMap((key) => key.split(">")),
  );
  const stationIds = Object.keys(layout.at).filter((id) => model.byId[id]);
  const current = model.journeys.find((item) => item.id === journey);
  const part = selected ? model.byId[selected] : null;
  const planned = model.status !== "live";

  return (
    <section className="axj" aria-label="Architecture as journeys">
      <div className="axj-condition">
        <CertaintyTag certainty={model.condition.certainty}>
          {conditionWord[model.condition.certainty]}
        </CertaintyTag>
        <p key={model.condition.text}>{model.condition.text}</p>
      </div>

      <div className="axj-controls">
        <span className="axj-follow" id="axj-follow">
          Follow
        </span>
        <TactileSlider
          label="Follow a journey"
          options={model.journeys.map((item) => ({
            id: item.id,
            label: item.label,
          }))}
          value={journey}
          onChange={(value) => {
            touch();
            setJourney(value);
          }}
        />
        <button
          type="button"
          className="axj-replay"
          onClick={() => {
            touch();
            setReplay((value) => value + 1);
          }}
          aria-label="Send the journey through again"
          title="Send it through again"
        >
          <ArrowsClockwise weight="bold" />
        </button>
        <span className="axj-spacer" />
        <button
          type="button"
          className="ax-button"
          disabled={recheck.phase === "running" || planned}
          onClick={() => {
            touch();
            setSelected(null);
            recheck.run(order, 1050);
          }}
        >
          {recheck.phase === "running" ? (
            <SpinnerGap weight="bold" className="ax-spin" />
          ) : null}
          {recheck.phase === "running"
            ? "Checking…"
            : "Ask Server Guy to re-check"}
          <span className="ax-invented">simulated</span>
        </button>
      </div>
      <p className="axj-caption" key={`${journey}:${replay}`}>
        {current?.summary}
      </p>

      <div
        className={`axj-stage${entering ? " is-entering" : ""}${planned ? " is-planned" : ""}${wave ? " is-wave" : ""}${shift ? " is-shifting" : ""}`}
        data-journey={journey}
        data-shift={shift ?? undefined}
        onPointerMove={touch}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="axj-map"
          aria-hidden="true"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient
              id="axjLit"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={W}
              y2="0"
            >
              <stop offset="0" stopColor="#285ad8" />
              <stop offset="0.38" stopColor="#5f82ee" />
              <stop offset="0.66" stopColor="#46a2de" />
              <stop offset="1" stopColor="#285ad8" />
            </linearGradient>
          </defs>
          <rect className="axj-band" x="300" y="34" width="600" height="414" rx="22" />
          <rect className="axj-private" x="600" y="110" width="290" height="170" rx="16" />
          <rect className="axj-shelf" x="316" y="364" width="570" height="72" rx="12" />
          <rect className="axj-offsite-band" x="936" y="312" width="170" height="136" rx="16" />
          <path
            className="axj-wall"
            d={`M300 46V${Y.visit - 19}M300 ${Y.visit + 19}V${Y.ssh - 19}M300 ${Y.ssh + 19}V440`}
          />
          {model.restricted && (
            <g className="axj-refused">
              <path d="M164 116C214 124 252 150 284 180" />
              <path d="M270 166l12 12m0-12l-12 12" />
            </g>
          )}
          {(["release", "data", "visit"] as JourneyId[]).map((id) =>
            layout.lines[id].map((key) => (
              <g key={key} className={`axj-lines j-${id}`}>
                <path
                  ref={(element) => {
                    pathRefs.current[key] = element;
                  }}
                  d={layout.paths[key]}
                  className={`axj-line j-${id}`}
                />
                {id === "data" && (
                  <path d={layout.paths[key]} className="axj-line j-data-inner" />
                )}
              </g>
            )),
          )}
          {layout.lines[journey].map((key) => (
            <path
              key={`lit:${journey}:${key}`}
              d={layout.paths[key]}
              pathLength={1}
              className={`axj-lit j-${journey}${lit.has(key) ? " is-on" : ""}`}
            />
          ))}
          {stationIds.map((id) => (
            <Station
              key={id}
              part={model.byId[id]}
              at={layout.at[id]}
              selected={selected === id}
              hovered={hovered === id}
              dim={!inJourney.has(id)}
              register={(element) => {
                stationRefs.current[id] = element;
              }}
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <g
              key={i}
              ref={(element) => {
                tokenRefs.current[i] = element;
              }}
              className="axj-token"
              style={{ opacity: 0 }}
            >
              <circle r="15" className="axj-token-halo" />
              <circle r="6.5" className="axj-token-dot" />
            </g>
          ))}
        </svg>

        <span className="axj-zone" style={pct({ x: 22, y: 424 })}>
          Outside
        </span>
        <button
          type="button"
          className="axj-zone axj-zone-host"
          style={pct({ x: 320, y: 56 })}
          onClick={() => select("host")}
        >
          {planned ? "Your server, once approved" : "Your server"}
          {model.region ? ` · ${model.region}` : ""}
        </button>
        <span className="axj-zone axj-zone-private" style={pct({ x: 614, y: 254 })}>
          Private network
          <br />
          no ports open
        </span>
        <span className="axj-zone" style={pct({ x: 330, y: 422 })}>
          Disk
        </span>
        <span className="axj-zone" style={pct({ x: 950, y: 332 })}>
          Off the server
        </span>
        {model.restricted && (
          <span
            className="axj-zone axj-zone-refused"
            style={pct({ x: 150, y: 100 })}
          >
            Anyone else is turned away
          </span>
        )}

        {stationIds.map((id) => {
          const item = model.byId[id];
          const dim = !inJourney.has(id);
          return (
            <div key={id}>
              <button
                type="button"
                className="axj-hit"
                style={pct(layout.at[id])}
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => select(id)}
                onPointerEnter={() => setHovered(id)}
                onPointerLeave={() => setHovered(null)}
              />
              <button
                type="button"
                className={`axj-label${dim ? " is-dim" : ""}${selected === id ? " is-selected" : ""}`}
                data-place={layout.place[id]}
                style={pct(layout.at[id])}
                onClick={() => select(id)}
                onPointerEnter={() => setHovered(id)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(id)}
                onBlur={() => setHovered(null)}
                aria-expanded={selected === id}
                aria-label={`${item.name}: ${item.role}.${item.quiet ? "" : ` ${item.checking ? "Checking" : item.evidence.short}.`}`}
              >
                <b>{item.name}</b>
                {item.quiet ? (
                  <span className="axj-label-role">your network</span>
                ) : (
                  <CertaintyTag part={item} />
                )}
              </button>
            </div>
          );
        })}

        <div
          ref={caretaker}
          className="axj-ct"
          style={{ ...pct(ct.spot), transitionDuration: `${ct.ms}ms` }}
        >
          <Caretaker
            pose={ct.pose}
            facing={ct.facing}
            size={38}
            onPoke={() => {
              touch();
              burstAt(caretaker.current, { count: 8, spread: 26 });
              if (ct.pose === "sleep") {
                setCt((c) => ({ ...c, pose: "idle" }));
                walkTimers.current.push(
                  window.setTimeout(
                    () =>
                      setCt((c) =>
                        c.pose === "idle"
                          ? { ...c, pose: restingRef.current }
                          : c,
                      ),
                    2600,
                  ),
                );
              }
            }}
          />
        </div>
      </div>

      <div className={`axj-drawer${part ? " is-open" : ""}`}>
        <div>
          {part && (
            <article
              key={part.id}
              className="axj-card"
              data-c={part.evidence.certainty}
              style={
                {
                  "--caret": `${(layout.at[part.id].x / W) * 100}%`,
                } as CSSProperties
              }
            >
              <div className="axj-card-main">
                <header>
                  {!part.quiet && <CertaintyTag part={part} />}
                  <h2>{part.name}</h2>
                  <span>{part.role}</span>
                </header>
                <p className="axj-card-plain">{part.plain}</p>
                {!part.quiet && (
                  <p className="axj-card-evidence">
                    {part.evidence.detail}
                    {part.evidence.invented && (
                      <span className="ax-invented">invented</span>
                    )}
                  </p>
                )}
                <div className="axj-card-links">
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
                className="axj-card-close"
                aria-label="Close"
                onClick={() => setSelected(null)}
              >
                <X weight="bold" />
              </button>
            </article>
          )}
        </div>
      </div>

      {model.gaps.length > 0 && (
        <div className="axj-gaps">
          <h3>Not set up yet</h3>
          {model.gaps.map((gap) => (
            <div key={gap.id} className="axj-gap">
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
