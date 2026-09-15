"use client";

// Command output, from captured execution evidence.
//
// Not logs. Nothing in this product retrieves an application's own logs —
// there is no tool that does it — and this page has only ever held what
// Server Guy's own commands printed. Calling that "Logs" told an owner
// looking for their application's errors that they were in the right place.
//
// The output Server Guy already has, with the time it was captured. Nothing
// here collects anything: re-running a command to fill a panel would make the
// page a cause of work rather than a record of it, and the contract allows
// this page Navigate and Ask only. Asking is a message in the conversation,
// and the next captured output is what changes the page.
//
// Where output came from is read from the one table the console and the
// activity transcript read, rather than from a fourth copy of it kept here.

import { ArrowUpRight, MagnifyingGlass } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import {
  clip,
  commandOf,
  essence,
  placeOf as sharedPlaceOf,
} from "./execution-text";
import type { ExecutionRecord } from "@/server/operator-execution";

import { LocalTime } from "./local-time";
import type { ApplicationSection } from "./application-sections";

function placeOf(tool: string) {
  return sharedPlaceOf(tool) ?? "Server Guy";
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
    <div className="ax-root sg-section-page sg-section-logs">
      {bar}
      <header className="sg-section-header">
        <div>
          <h1>Command output</h1>
          <p>
            What Server Guy&rsquo;s own commands printed, with when it was
            captured. Not the application&rsquo;s logs: nothing here collects
            those, and nothing here runs anything. Each of these also sits on
            the event it belongs to in History.
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
              Server Guy ran has printed anything on record. If you are looking
              for the application&rsquo;s own logs, ask for them in the
              conversation: whatever that command prints is kept here.
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
                <code>{clip(essence(commandOf(execution.input)), 96)}</code>
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
