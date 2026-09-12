"use client";

import { useEffect, useRef, useState } from "react";
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
          <span role="status">{copyStatus}</span>
        </div>
      </div>
    </details>
  );
}
