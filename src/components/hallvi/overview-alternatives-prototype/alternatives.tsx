"use client";

// THROWAWAY round two: application life, not a maintenance status sheet.
// All usage, release and log stories below are explicitly illustrative.
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  GitCommit,
  GitBranch,
  Globe,
  Users,
  WarningCircle,
  MagnifyingGlass,
  FileText,
  PencilSimple,
  CheckCircle,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Overview } from "../overview-prototype/overview-model";
import type { Timeline } from "../overview-prototype/timeline-model";
import type { ArchitectureModel } from "../architecture-prototype/model";
import "./alternatives.css";

type Direction = "A" | "B" | "C";
type Props = {
  overview: Overview;
  timeline: Timeline;
  model: ArchitectureModel;
  variant: Direction;
};
const names = {
  A: "Application pulse",
  B: "Activity map",
  C: "The application journal",
};
const days = [
  "Sun 13",
  "Mon 14",
  "Tue 15",
  "Wed 16",
  "Thu 17",
  "Fri 18",
  "Sat 19",
];
const requests = [1420, 1800, 1650, 2040, 2280, 2950, 3460];
const previous = [1200, 1320, 1400, 1680, 1700, 1870, 2100];
const people = [30, 35, 32, 39, 43, 55, 68];
const previousPeople = [24, 29, 31, 32, 36, 42, 48];
const commits = [
  "Add full-text search",
  "Keep search filters",
  "Improve empty results",
];
const number = (n: number) => n.toLocaleString("en-US");

function Sample({ compact = false }: { compact?: boolean }) {
  return (
    <div className="pulse-sample">
      <span>DESIGN STUDY · SAMPLE DATA</span>
      <p>
        {compact
          ? "An alternative to Overview: meaningful changes, as they happen."
          : "Usage, releases and log insights are illustrative. Your application’s analytics are not connected to this preview."}
      </p>
    </div>
  );
}
function Health({ overview }: { overview: Overview }) {
  const vital = overview.vitals.find((v) => v.id === "checks");
  const [open, setOpen] = useState(false);
  const failed = vital?.status.certainty === "failed";
  return (
    <div className="pulse-health">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        <span
          className={failed ? "pulse-health-dot is-failed" : "pulse-health-dot"}
        />
        <b>
          {failed
            ? "A check failed"
            : vital?.status.certainty === "verified" ||
                vital?.status.certainty === "stale"
              ? "Passed its last check"
              : "Health not established"}
        </b>
        <span>{vital?.status.text}</span>
        <CaretDown size={13} />
      </button>
      {open && (
        <p>
          Health checks are snapshots. This result does not tell us whether the
          app is healthy right now. Traffic and error history can add evidence
          between checks.
        </p>
      )}
    </div>
  );
}
function Spark({
  values = requests,
  color = "var(--pulse-purple)",
}: {
  values?: number[];
  color?: string;
}) {
  const max = Math.max(...values) * 1.15;
  return (
    <svg
      viewBox="0 0 240 70"
      role="img"
      aria-label="Illustrative trend over seven days"
    >
      <path
        d={values
          .map((v, i) => `${i ? "L" : "M"}${i * 40} ${65 - (v / max) * 60}`)
          .join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TrafficChart() {
  const [metric, setMetric] = useState<"requests" | "people">("requests");
  const [point, setPoint] = useState<number | null>(null);
  const values = metric === "requests" ? requests : people;
  const prior = metric === "requests" ? previous : previousPeople;
  const max = metric === "requests" ? 4000 : 80;
  const x = (i: number) => 60 + i * 133;
  const y = (n: number) => 242 - (n / max) * 210;
  const line = (list: number[]) =>
    list.map((n, i) => `${i ? "L" : "M"}${x(i)},${y(n)}`).join(" ");
  return (
    <section className="pulse-traffic" aria-label="Illustrative traffic chart">
      <div className="pulse-chart-head">
        <div>
          <h3>
            {metric === "requests"
              ? "Traffic is finding its rhythm."
              : "More people are using it."}
          </h3>
          <p>
            {metric === "requests"
              ? "15,600 requests this week · 38% more than the previous week"
              : "218 distinct signed-in users this week · 42% more than last week"}
          </p>
        </div>
        <div className="pulse-segment" aria-label="Chart metric">
          <button
            aria-pressed={metric === "requests"}
            onClick={() => {
              setMetric("requests");
              setPoint(null);
            }}
          >
            Requests
          </button>
          <button
            aria-pressed={metric === "people"}
            onClick={() => {
              setMetric("people");
              setPoint(null);
            }}
          >
            People
          </button>
        </div>
      </div>
      <svg
        className="pulse-chart"
        viewBox="0 0 900 290"
        role="img"
        aria-label={
          metric === "requests"
            ? "Seven daily request counts: 1420, 1800, 1650, 2040, 2280, 2950, 3460. Previous week is dashed."
            : "Daily active users: 30, 35, 32, 39, 43, 55, 68. A user may appear on several days."
        }
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1="60"
              x2="858"
              y1={y((i * max) / 4)}
              y2={y((i * max) / 4)}
              stroke="var(--line)"
            />
            <text x="44" y={y((i * max) / 4) + 4} textAnchor="end">
              {number((i * max) / 4)}
            </text>
          </g>
        ))}
        <path
          d={`${line(values)} L858,242 L60,242 Z`}
          fill="var(--pulse-purple-soft)"
        />
        <path
          d={line(prior)}
          fill="none"
          stroke="var(--pulse-prior)"
          strokeDasharray="5 7"
          strokeWidth="2"
        />
        <path
          d={line(values)}
          fill="none"
          stroke="var(--pulse-purple)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {values.map((v, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(v)}
              r={point === i ? 6 : 4}
              fill="var(--pulse-purple)"
              stroke="white"
              strokeWidth="2"
            />
            <text x={x(i)} y="277" textAnchor="middle">
              {days[i]}
            </text>
          </g>
        ))}
        <line
          x1={x(4)}
          x2={x(4)}
          y1="20"
          y2="242"
          stroke="var(--pulse-purple)"
          strokeDasharray="2 5"
          opacity=".45"
        />
        <rect
          x={x(4) - 65}
          y="5"
          width="130"
          height="26"
          rx="6"
          fill="var(--pulse-purple-soft)"
        />
        <text
          className="pulse-release-label"
          x={x(4)}
          y="23"
          textAnchor="middle"
        >
          Search update shipped
        </text>
      </svg>
      <div className="pulse-chart-foot">
        <span>
          <i /> This week <i className="is-prior" /> Previous week
        </span>
        <div className="pulse-day-picker">
          {days.map((day, i) => (
            <button
              key={day}
              aria-label={`Inspect ${day}`}
              aria-pressed={point === i}
              onClick={() => setPoint(i)}
            >
              {day.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
      {point !== null && (
        <p className="pulse-chart-reading" role="status">
          {days[point]}:{" "}
          <b>
            {number(values[point])}{" "}
            {metric === "requests" ? "requests" : "active users"}
          </b>
          , compared with {number(prior[point])} on the same day last week.
        </p>
      )}
    </section>
  );
}
function ReleaseDetail() {
  return (
    <details className="pulse-release-detail">
      <summary>
        <GitBranch size={18} />
        <span>
          <b>Search is out in the world.</b>
          <small>3 commits shipped on Thursday · 5 more not deployed</small>
        </span>
        <ArrowUpRight size={18} />
      </summary>
      <ul>
        {commits.map((text) => (
          <li key={text}>
            <GitCommit size={15} />
            {text}
          </li>
        ))}
      </ul>
    </details>
  );
}
function LogDetail() {
  return (
    <details className="pulse-log-detail">
      <summary>
        <WarningCircle size={18} />
        <span>
          <b>One thing worth a look</b>
          <small>7 search requests returned a server error this week.</small>
        </span>
        <CaretDown size={15} />
      </summary>
      <div>
        <p>
          All seven responses came from <code>/api/search</code> between 09:10
          and 09:14 on Friday. Most requests in that window succeeded.
        </p>
        <pre>
          {
            "09:10:14  GET /api/search  500\n09:11:02  GET /api/search  500\n09:14:33  GET /api/search  500"
          }
        </pre>
        <small>Illustrative log excerpt · cause not established</small>
      </div>
    </details>
  );
}

export function VariantA({ overview }: Props) {
  return (
    <div className="pulse-a">
      <Sample />
      <div className="pulse-lead">
        <div>
          <h2>
            A little app.
            <br />A busier week.
          </h2>
          <p>
            <b>218 people</b> used Notes this week.
            <br />
            That’s <span className="pulse-up">42% more</span> than last week.
          </p>
        </div>
        <div
          className="pulse-people-art"
          aria-label="Illustration of a growing audience"
        >
          <div className="pulse-orbit one" />
          <div className="pulse-orbit two" />
          <div className="pulse-audience">
            {Array.from({ length: 28 }, (_, i) => (
              <span key={i} style={{ opacity: 0.45 + (i % 4) * 0.18 }}>
                <Users
                  size={i % 3 === 0 ? 20 : 15}
                  weight={i % 4 === 0 ? "fill" : "regular"}
                />
              </span>
            ))}
          </div>
          <span className="pulse-audience-label">A growing audience</span>
        </div>
      </div>
      <Health overview={overview} />
      <TrafficChart />
      <div className="pulse-bottom">
        <ReleaseDetail />
        <LogDetail />
      </div>
    </div>
  );
}

export function VariantB({ overview }: Props) {
  const [selected, setSelected] = useState<"people" | "app" | "search">("app");
  const descriptions = {
    people: {
      title: "People, not just hits.",
      body: "218 distinct signed-in users used Notes this week, up from 154. Identifying users needs application analytics; distinct IP addresses from access logs are only a visitor estimate.",
    },
    app: {
      title: "Most requests did what they came to do.",
      body: "15,593 of 15,600 sample requests completed successfully. Seven search requests returned a server error. A quiet error log alone cannot prove the whole app is healthy.",
    },
    search: {
      title: "Search is getting used.",
      body: "3,800 requests reached search this week. Seven returned a server error in a four-minute window on Friday. Open the log story below to see the sample evidence.",
    },
  };
  return (
    <div className="pulse-b">
      <Sample />
      <div className="pulse-map-heading">
        <h2>
          What’s happening
          <br />
          inside Notes?
        </h2>
        <p>
          Follow the activity.
          <br />
          13–19 September
        </p>
      </div>
      <Health overview={overview} />
      <div
        className="pulse-map"
        aria-label="Illustrative application activity map"
      >
        <svg
          className="pulse-connectors"
          viewBox="0 0 1000 330"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M185 170 C280 170 300 170 395 170" />
          <path d="M555 170 C670 170 610 62 760 62" />
          <path d="M555 170 C670 170 640 171 760 171" />
          <path d="M555 170 C670 170 610 279 760 279" />
          <circle cx="283" cy="170" r="5" />
          <circle cx="685" cy="83" r="4" />
          <circle cx="681" cy="171" r="4" />
          <circle cx="685" cy="258" r="4" />
        </svg>
        <button
          className="pulse-map-people"
          onClick={() => setSelected("people")}
          aria-pressed={selected === "people"}
        >
          <div className="pulse-avatar-stack">
            {[0, 1, 2].map((i) => (
              <span key={i}>
                <Users size={26} />
              </span>
            ))}
          </div>
          <strong>218</strong>
          <b>people this week</b>
          <small>+42% from last week</small>
        </button>
        <button
          className="pulse-map-app"
          onClick={() => setSelected("app")}
          aria-pressed={selected === "app"}
        >
          <div className="pulse-notes-icon">
            <FileText size={44} weight="duotone" />
          </div>
          <h3>Notes</h3>
          <strong>15,600 requests</strong>
          <small>+38% from last week</small>
        </button>
        <div className="pulse-endpoints">
          <div>
            <FileText size={21} />
            <span>
              <b>Read notes</b>
              <small>9,400 requests</small>
            </span>
            <div className="pulse-path-bar">
              <i style={{ width: "100%" }} />
            </div>
          </div>
          <button
            onClick={() => setSelected("search")}
            aria-pressed={selected === "search"}
          >
            <MagnifyingGlass size={21} />
            <span>
              <b>Search</b>
              <small>3,800 requests · 7 errors</small>
            </span>
            <div className="pulse-path-bar">
              <i style={{ width: "40%" }} />
            </div>
          </button>
          <div>
            <PencilSimple size={21} />
            <span>
              <b>Save a note</b>
              <small>2,400 requests</small>
            </span>
            <div className="pulse-path-bar">
              <i style={{ width: "26%" }} />
            </div>
          </div>
        </div>
      </div>
      <div className="pulse-map-insight" aria-live="polite">
        <span className="pulse-insight-icon">
          <Globe size={21} />
        </span>
        <div>
          <h3>{descriptions[selected].title}</h3>
          <p>{descriptions[selected].body}</p>
        </div>
      </div>
      <div className="pulse-map-footer">
        <div>
          <span>REQUESTS THROUGH THE WEEK</span>
          <div className="pulse-bars">
            {requests.map((v, i) => (
              <div key={i}>
                <b>{number(v)}</b>
                <i style={{ height: (v / 3460) * 76 + "px" }} />
                <small>{days[i].split(" ")[0]}</small>
              </div>
            ))}
          </div>
        </div>
        <div>
          <ReleaseDetail />
          <LogDetail />
        </div>
      </div>
    </div>
  );
}

export function VariantC({ overview }: Props) {
  const [filter, setFilter] = useState<"all" | "releases" | "usage">("all");
  return (
    <div className="pulse-c">
      <Sample compact />
      <div className="pulse-journal-title">
        <div>
          <h2>The story of your app.</h2>
          <p>Changes worth knowing about. The rest can stay in the logs.</p>
        </div>
        <div className="pulse-period">
          13–19 Sep<small>This week</small>
        </div>
      </div>
      <Health overview={overview} />
      <div className="pulse-journal-tools">
        <div className="pulse-segment">
          <button
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Everything
          </button>
          <button
            aria-pressed={filter === "usage"}
            onClick={() => setFilter("usage")}
          >
            Usage & health
          </button>
          <button
            aria-pressed={filter === "releases"}
            onClick={() => setFilter("releases")}
          >
            Releases
          </button>
        </div>
        <span>
          {filter === "all"
            ? "3 meaningful changes"
            : filter === "releases"
              ? "1 release"
              : "2 usage & health changes"}
        </span>
      </div>
      <div className="pulse-journal">
        {filter !== "releases" && (
          <article className="pulse-story pulse-story-audience">
            <div className="pulse-story-time">
              <span className="pulse-story-dot" />
              <b>Today</b>
              <time>10:00</time>
            </div>
            <div className="pulse-story-body">
              <div className="pulse-story-top">
                <Users size={20} />
                <span>Weekly usage</span>
              </div>
              <h3>More people found a reason to use it.</h3>
              <div className="pulse-story-stats">
                <div>
                  <strong>
                    154 <ArrowRight size={22} /> <em>218</em>
                  </strong>
                  <p>people last week → this week</p>
                </div>
                <div className="pulse-story-spark">
                  <Spark values={people} />
                  <span>Daily active users</span>
                </div>
              </div>
              <p>
                Traffic rose too: <b>15,600 requests</b>, up 38%. The increase
                starts around Thursday’s release; that timing alone doesn’t
                establish a cause.
              </p>
              <details>
                <summary>
                  Where this comes from <CaretDown size={13} />
                </summary>
                <p>
                  Sample application analytics: distinct signed-in users across
                  each complete week. Traffic is a separate sample from the
                  access log. Daily active users are not added together to
                  calculate distinct weekly users.
                </p>
              </details>
            </div>
          </article>
        )}
        {filter === "all" || filter === "usage" ? (
          <article className="pulse-story pulse-story-errors">
            <div className="pulse-story-time">
              <span className="pulse-story-dot" />
              <b>Friday</b>
              <time>09:14</time>
            </div>
            <div className="pulse-story-body">
              <div className="pulse-story-top">
                <WarningCircle size={20} />
                <span>From the logs</span>
              </div>
              <h3>A short burst of search errors.</h3>
              <div
                className="pulse-error-plot"
                aria-label="Seven sample server errors in four minutes"
              >
                <span>09:00</span>
                {Array.from({ length: 36 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      height:
                        i === 11
                          ? 34
                          : i === 12
                            ? 55
                            : i === 13
                              ? 24
                              : i === 14
                                ? 42
                                : 3,
                    }}
                    className={i >= 11 && i <= 14 ? "has-error" : ""}
                  />
                ))}
                <span>09:30</span>
              </div>
              <LogDetail />
            </div>
          </article>
        ) : null}
        {filter !== "usage" && (
          <article className="pulse-story pulse-story-release">
            <div className="pulse-story-time">
              <span className="pulse-story-dot" />
              <b>Thursday</b>
              <time>14:32</time>
            </div>
            <div className="pulse-story-body">
              <div className="pulse-story-top">
                <GitBranch size={20} />
                <span>A release landed</span>
              </div>
              <h3>Your notes became searchable.</h3>
              <p>
                Three commits reached the running application. Five newer
                commits are still waiting in the repository.
              </p>
              <div className="pulse-commit-track">
                {commits.map((text, i) => (
                  <div key={text}>
                    <span>
                      <GitCommit size={19} />
                      <code>{["b41d3c8", "8ca240f", "d7026be"][i]}</code>
                    </span>
                    <b>{text}</b>
                  </div>
                ))}
                <div className="pulse-shipped">
                  <CheckCircle size={23} />
                  <b>Deployed</b>
                </div>
              </div>
            </div>
          </article>
        )}
      </div>
      <p className="pulse-journal-end">You’re caught up on the sample week.</p>
    </div>
  );
}

export function OverviewAlternatives(props: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const change = (direction: number) => {
    const keys: Direction[] = ["A", "B", "C"];
    const value = keys[(keys.indexOf(props.variant) + direction + 3) % 3];
    const params = new URLSearchParams(search.toString());
    params.set("variant", value);
    router.replace(`?${params.toString()}${window.location.hash}`, {
      scroll: false,
    });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[contenteditable="true"],[role="textbox"]',
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        change(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (process.env.NODE_ENV === "production") return null;
  const Component = { A: VariantA, B: VariantB, C: VariantC }[props.variant];
  return (
    <section className="pulse" aria-label="Visual application prototype">
      <Component key={props.variant} {...props} />
      <nav className="pulse-switcher" aria-label="Prototype variants">
        <button onClick={() => change(-1)} aria-label="Previous variant">
          <ArrowLeft size={18} />
        </button>
        <span>
          <small>ROUND TWO · {props.variant}</small>
          <b>{names[props.variant]}</b>
        </span>
        <button onClick={() => change(1)} aria-label="Next variant">
          <ArrowRight size={18} />
        </button>
      </nav>
    </section>
  );
}
