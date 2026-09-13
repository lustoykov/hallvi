"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ExecutionRecord } from "@/server/operator-execution";

function commandText(input: string) {
  try {
    const value = JSON.parse(input);
    if (typeof value?.command === "string") return value.command;
  } catch {
    // Some recorded commands are already plain text.
  }
  return input;
}

function outputText(item: ExecutionRecord) {
  // Earlier execution records stored the whole command result as JSON.
  if (item.status !== "running" && item.exitCode !== undefined) {
    try {
      const value = JSON.parse(item.output);
      if (typeof value?.output === "string" && value.exitCode === item.exitCode)
        return value.output;
    } catch {
      // Current records store output directly.
    }
  }
  return item.output;
}

const everySecond = (onChange: () => void) => {
  const tick = setInterval(onChange, 1000);
  return () => clearInterval(tick);
};
const never = () => () => undefined;
/** Bucketed, so the snapshot only changes when the second does. */
const thisSecond = () => Math.floor(Date.now() / 1000) * 1000;
const zero = () => 0;

const spell = (seconds: number) =>
  seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

/**
 * What a long command looks like while it says nothing.
 *
 * Building Paperless-ngx installs 201 Python packages and prints nothing for
 * minutes at a stretch. The last line on screen then reads exactly the same
 * whether the command is working, wedged or gone, and the reader has no way
 * to tell. The clock can: "running 6m 12s · quiet for 3m 40s" is the same
 * screen with the missing fact restored.
 */
export function pulse(item: ExecutionRecord, now: number) {
  const started = Date.parse(item.createdAt);
  if (!now || !Number.isFinite(started) || now < started) return null;
  const running = `running ${spell(Math.floor((now - started) / 1000))}`;
  const spoke = item.outputAt ? Date.parse(item.outputAt) : NaN;
  if (!Number.isFinite(spoke) || now < spoke) return running;
  const quiet = Math.floor((now - spoke) / 1000);
  // Under twenty seconds is not a silence, it is the gap between two lines.
  return quiet < 20 ? running : `${running} · quiet for ${spell(quiet)}`;
}

export function StreamingOutput({ item }: { item: ExecutionRecord }) {
  const [open, setOpen] = useState(
    item.status !== "succeeded" && item.status !== "declined",
  );
  const [follow, setFollow] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");
  const viewport = useRef<HTMLPreElement>(null);
  const output = outputText(item);
  const command = commandText(item.input);
  const running = item.status === "running";
  const awaiting = item.status === "awaiting-approval";
  // The clock is outside React: it ticks on its own and the component reads
  // it. Zero on the server and before the first paint, so there is nothing to
  // mismatch during hydration.
  const now = useSyncExternalStore(
    running ? everySecond : never,
    running ? thisSecond : zero,
    zero,
  );

  useEffect(() => {
    if (!follow || !open) return;
    const frame = requestAnimationFrame(() => {
      if (viewport.current)
        viewport.current.scrollTop = viewport.current.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [output, follow, open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${command}\n\n${output}`);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed — select the text to copy");
    }
  }

  return (
    <details
      className="sg-stream"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {awaiting
          ? "Review command"
          : running
            ? "Live output"
            : "Command and output"}
      </summary>
      <div className="sg-stream-terminal">
        <pre className="sg-stream-command" aria-label="Command">
          <code>{command}</code>
        </pre>
        <pre
          className="sg-stream-output"
          ref={viewport}
          role="region"
          aria-label="Command output"
          tabIndex={0}
          onScroll={(event) => {
            const element = event.currentTarget;
            setFollow(
              element.scrollHeight - element.clientHeight - element.scrollTop <
                16,
            );
          }}
        >
          {output || (
            <span className="sg-stream-empty">
              {awaiting
                ? "Waiting for approval. The command has not started."
                : running
                  ? "Waiting for command output…"
                  : item.status === "declined"
                    ? "Command was not run."
                    : "No output recorded."}
            </span>
          )}
        </pre>
        <div className="sg-stream-controls">
          <button
            type="button"
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
          >
            {follow ? "Following output" : "Follow latest"}
          </button>
          <button type="button" onClick={() => void copy()}>
            Copy
          </button>
          {running && (
            <span className="sg-stream-pulse" role="status">
              {pulse(item, now)}
            </span>
          )}
          <span role="status">{copyStatus}</span>
        </div>
      </div>
    </details>
  );
}
