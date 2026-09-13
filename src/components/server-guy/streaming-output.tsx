"use client";

import { useEffect, useRef, useState } from "react";
import { clip, commandOf, essence, plainText } from "./execution-text";
import type { ExecutionRecord } from "@/server/operator-execution";

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

export function StreamingOutput({ item }: { item: ExecutionRecord }) {
  // A command waiting for a decision opens closed. The terminal was open by
  // default, which made a dark block of shell the primary content of the one
  // moment in the product where a person is being asked to decide something —
  // and the decision itself was never stated in words at all. What it wants
  // to do goes above; the full payload stays one click away.
  const [open, setOpen] = useState(
    item.status === "running" ||
      (item.status !== "succeeded" &&
        item.status !== "declined" &&
        item.status !== "awaiting-approval"),
  );
  const [follow, setFollow] = useState(true);
  const [copyStatus, setCopyStatus] = useState("");
  const viewport = useRef<HTMLPreElement>(null);
  const output = outputText(item);
  const command = plainText(item.input);
  const running = item.status === "running";
  const awaiting = item.status === "awaiting-approval";

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
    <>
      {awaiting && (
        <div className="sg-ask">
          <p className="sg-ask-what">
            Server Guy wants to run a command on your server.
          </p>
          <code className="sg-ask-command">
            {clip(essence(commandOf(item.input)), 120)}
          </code>
          {/* Scoped to this command, and only this command. "Nothing has
              run yet" is a claim about the whole turn, and it is false the
              moment an earlier command in the same turn has already
              executed — which is the ordinary case by the time Pi asks. */}
          <p className="sg-ask-safe">
            This command has not run. It starts only if you approve.
          </p>
        </div>
      )}
      <details
        className="sg-stream"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>
          {awaiting
            ? "Review the full command"
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
                element.scrollHeight -
                  element.clientHeight -
                  element.scrollTop <
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
                      ? "You declined this command, so it did not run."
                      : "No output recorded."}
              </span>
            )}
          </pre>
          {/* Nothing to follow and nothing worth copying until something has
            run; offering both beside an empty pane is two dead controls. */}
          <div className="sg-stream-controls">
            {Boolean(output) && (
              <button
                type="button"
                aria-pressed={follow}
                onClick={() => setFollow(!follow)}
              >
                {follow ? "Following output" : "Follow latest"}
              </button>
            )}
            <button type="button" onClick={() => void copy()}>
              {output ? "Copy" : "Copy command"}
            </button>
            <span role="status">{copyStatus}</span>
          </div>
        </div>
      </details>
    </>
  );
}
