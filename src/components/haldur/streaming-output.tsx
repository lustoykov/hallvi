"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clip, commandOf, essence, plainText } from "./execution-text";
import type { ExecutionRecord } from "@/server/operator-execution";
import { TerminalBar } from "./terminal-lights";

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

/** Lines that carry something, so a one-line script is not called two. */
function lineCount(text: string) {
  return text.split("\n").filter((line) => line.trim()).length;
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
  // The command is the content only while it is a proposal. Once it has run,
  // the output is what the reader came for and the command is provenance.
  const [showCommand, setShowCommand] = useState(
    item.status === "awaiting-approval",
  );
  const viewport = useRef<HTMLPreElement>(null);
  const output = outputText(item);
  /** The whole payload: the script, and the settings that travelled with it. */
  const command = plainText(item.input);
  /**
   * The one line that says what this does. Read from the command itself and
   * never from the payload, so a setting printed beside it can never become
   * the caption, and with the shell preamble skipped, because the first line
   * of a script is `set -euo pipefail` and that is not what it is for.
   */
  const line = clip(essence(commandOf(item.input)), 140);
  const script = lineCount(commandOf(item.input));
  /** Whether anything at all is hidden: more script, or settings, or both. */
  const more = command.trim() !== line;
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
    <>
      {awaiting && (
        <div className="hd-ask">
          <p className="hd-ask-what">
            Haldur wants to run a command on your server.
          </p>
          <code className="hd-ask-command">
            {clip(essence(commandOf(item.input)), 120)}
          </code>
          {/* Scoped to this command, and only this command. "Nothing has
              run yet" is a claim about the whole turn, and it is false the
              moment an earlier command in the same turn has already
              executed — which is the ordinary case by the time Pi asks. */}
          <p className="hd-ask-safe">
            This command has not run. It starts only if you approve.
          </p>
        </div>
      )}
      <details
        className="hd-stream"
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
        <div className="hd-stream-terminal">
          <TerminalBar title={running ? "Running" : "Command"} />
          {/* One line, in a strip, deliberately not a <pre>.
              This used to be a second scrolling dark pane above the output
              pane, and two clipped panes in one dark box read as two
              terminals running two things. The command still has to be here —
              output without it is unattributable — but it is a caption, and
              the whole of it is one click away. */}
          <div className="hd-stream-ran">
            <span className="hd-stream-prompt" aria-hidden="true">
              $
            </span>
            <code title={line}>{line}</code>
            {more && (
              <button
                type="button"
                className="hd-stream-more"
                aria-expanded={showCommand}
                onClick={() => setShowCommand(!showCommand)}
              >
                {showCommand
                  ? "Hide"
                  : script > 1
                    ? `Full command · ${script} lines`
                    : "Full command"}
              </button>
            )}
          </div>
          {showCommand && more && (
            <pre className="hd-stream-command" aria-label="Full command">
              <code>{command}</code>
            </pre>
          )}
          <pre
            className="hd-stream-output"
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
              <span className="hd-stream-empty">
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
          <div className="hd-stream-controls">
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
            {/* From the deployment work merged into this branch: a command
                that has gone quiet says how long it has been running and how
                long since it last spoke, so silence is legible as silence
                rather than as a stall. */}
            {running && (
              <span className="hd-stream-pulse" role="status">
                {pulse(item, now)}
              </span>
            )}
            <span role="status">{copyStatus}</span>
          </div>
        </div>
      </details>
    </>
  );
}
