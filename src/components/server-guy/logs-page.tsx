"use client";

// Logs, from captured execution evidence.
//
// The output Server Guy already has, with the time it was captured. Nothing
// here collects anything: re-running a command to fill a panel would make the
// page a cause of work rather than a record of it, and the contract allows
// this page Navigate and Ask only. Asking is a message in the conversation,
// and the next captured output is what changes the page.
//
// The streams are where output came from — the server, the repository copy,
// the provider — because a line's meaning depends on where it was read.

import { ArrowUpRight, MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";

import { LocalTime } from "./local-time";
import type { ApplicationSection } from "./application-sections";

const places: { test: (tool: string) => boolean; label: string }[] = [
  { test: (tool) => tool === "server_bash", label: "The server" },
  {
    test: (tool) => tool === "bash" || tool === "powershell",
    label: "The repository copy",
  },
  { test: (tool) => tool === "hetzner_request", label: "The provider" },
];

function placeOf(tool: string) {
  return places.find((place) => place.test(tool))?.label ?? "Server Guy";
}

export function LogsPage({
  executions,
  now,
  bar,
  onAsk,
  onOpenDestination,
}: {
  executions: ExecutionRecord[];
  now: number;
  bar?: React.ReactNode;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<string | null>(null);

  const captured = useMemo(
    () =>
      executions
        .filter((execution) => (execution.output ?? "").trim())
        .sort(
          (a, b) =>
            Date.parse(b.finishedAt ?? b.createdAt) -
            Date.parse(a.finishedAt ?? a.createdAt),
        ),
    [executions],
  );

  const streams = useMemo(() => {
    const counted = new Map<string, { lines: number; lastAt: string }>();
    for (const execution of captured) {
      const key = placeOf(execution.tool);
      const lines = (execution.output ?? "").split("\n").filter(Boolean).length;
      const at = execution.finishedAt ?? execution.createdAt;
      const held = counted.get(key);
      counted.set(key, {
        lines: (held?.lines ?? 0) + lines,
        lastAt: held && held.lastAt > at ? held.lastAt : at,
      });
    }
    return [...counted.entries()].map(([label, value]) => ({
      label,
      ...value,
    }));
  }, [captured]);
  const peak = Math.max(1, ...streams.map((stream) => stream.lines));

  const shown = captured.filter(
    (execution) => !place || placeOf(execution.tool) === place,
  );
  const matching = (line: string) =>
    !query || line.toLowerCase().includes(query.toLowerCase());
  // The captures that still have a line to show once the filter has run.
  const matched = shown.filter(
    (execution) =>
      !query ||
      (execution.output ?? "")
        .split("\n")
        .some((line) => line.trim() && matching(line)),
  );

  return (
    <div className="sg-section-page sg-section-logs">
      {bar}
      <header className="sg-section-header">
        <div>
          <h1>Logs</h1>
          <p>
            Output Server Guy captured while it worked, with when it was
            captured. Nothing here runs anything.
          </p>
        </div>
      </header>
      <div className="sg-section-content">
        {streams.length > 0 && (
          <div className="sg-streams">
            <button
              type="button"
              className={`sg-stream${place === null ? " selected" : ""}`}
              onClick={() => setPlace(null)}
            >
              <strong>Everywhere</strong>
              <small>{captured.length} captured runs</small>
            </button>
            {streams.map((stream) => (
              <button
                type="button"
                key={stream.label}
                className={`sg-stream${place === stream.label ? " selected" : ""}`}
                onClick={() => setPlace(stream.label)}
              >
                <strong>{stream.label}</strong>
                <small>
                  {stream.lines.toLocaleString()} lines · last{" "}
                  <LocalTime value={stream.lastAt} variant="compact" />
                </small>
                <span className="sg-stream-bar" aria-hidden="true">
                  <span
                    className="sg-fill-working"
                    style={{ width: `${(stream.lines / peak) * 100}%` }}
                  />
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="sg-log-toolbar">
          <label>
            <MagnifyingGlass aria-hidden="true" />
            <input
              aria-label="Filter captured lines"
              placeholder="Filter captured lines…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              onAsk(
                "Collect the application's latest logs from the server and tell me what is in them.",
              )
            }
          >
            Ask for fresh output
          </button>
        </div>

        {shown.length === 0 && (
          <div className="sg-section-none">
            <h2>No output has been captured yet.</h2>
            <p>
              That is not a claim the application is quiet — only that nothing
              Server Guy ran has produced output on record. Ask in the
              conversation and whatever it collects is kept here.
            </p>
          </div>
        )}

        {/* A filter that matches nothing left the page blank below the box,
            which reads as a page that broke rather than as a search that
            found nothing. */}
        {shown.length > 0 && query && !matched.length && (
          <div className="sg-section-none">
            <h2>Nothing captured contains “{query}”.</h2>
            <p>
              {shown.length} captured run{shown.length === 1 ? "" : "s"}{" "}
              {shown.length === 1 ? "was" : "were"} searched, from{" "}
              {new Set(shown.map((item) => placeOf(item.tool))).size === 1
                ? "one place"
                : `${new Set(shown.map((item) => placeOf(item.tool))).size} places`}
              . Clear the filter to see them.
            </p>
          </div>
        )}

        {matched.map((execution) => {
          const lines = (execution.output ?? "")
            .split("\n")
            .filter((line) => line.trim() && matching(line));
          const at = execution.finishedAt ?? execution.createdAt;
          return (
            <section className="sg-captured" key={execution.id}>
              <header>
                <strong>{placeOf(execution.tool)}</strong>
                <code>{execution.input.split("\n")[0].slice(0, 96)}</code>
                <span>
                  Captured <LocalTime value={at} variant="compact" />
                  {typeof execution.exitCode === "number" &&
                    ` · exit ${execution.exitCode}`}
                </span>
                {/* In-app navigation, so a button — an href claiming one
                    destination while the click goes to another is a link
                    that lies about where it leads. */}
                <button
                  type="button"
                  onClick={() => onOpenDestination("history")}
                >
                  See it in History
                  <ArrowUpRight weight="bold" aria-hidden="true" />
                </button>
              </header>
              <pre className="sg-logs-output">{lines.join("\n")}</pre>
            </section>
          );
        })}
      </div>
    </div>
  );
}
