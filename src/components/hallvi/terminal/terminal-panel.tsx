"use client";

// The owner's shell on the application's server, at the bottom of the
// workspace. It never names a host: it asks the application endpoint for a
// one-use capability, attaches, and shows whatever the controller resolved.
// Nothing here reaches Pi except text the owner selects and sends.

import {
  ArrowsOutSimple,
  ArrowsInSimple,
  ChatCircleText,
  Minus,
  Plug,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import "./terminal-panel.css";
import { TerminalLights } from "../terminal-lights";

export interface TerminalTarget {
  user: string;
  address: string;
  port: number;
}

type Phase =
  | { name: "idle" }
  | { name: "no-host" }
  | { name: "connecting" }
  | { name: "connected" }
  | { name: "failed"; detail: string }
  | { name: "ended"; detail: string };

const SELECTION_LIMIT = 16 * 1024;

export function TerminalPanel({
  applicationId,
  open,
  expanded,
  minimized,
  piBusy,
  onClose,
  onToggleExpanded,
  onToggleMinimized,
  onAskAboutSelection,
}: {
  applicationId: string;
  open: boolean;
  expanded: boolean;
  minimized: boolean;
  /** Pi is running something for this application right now. */
  piBusy: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
  onToggleMinimized: () => void;
  /** Appends an editable draft to the main conversation. Never sends. */
  onAskAboutSelection: (text: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const runtime = useRef<{
    term: import("@xterm/xterm").Terminal;
    fit: import("@xterm/addon-fit").FitAddon;
    socket: WebSocket | null;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [target, setTarget] = useState<TerminalTarget | null>(null);
  const [selected, setSelected] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const label = target
    ? `${target.user}@${target.address}:${target.port}`
    : "Application server";

  const send = useCallback((value: object) => {
    const socket = runtime.current?.socket;
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(value));
  }, []);

  // One effect owns the whole session: it builds the terminal, connects, and
  // tears both down. Re-running it (Retry, Connect again) is a fresh shell —
  // no keystroke is ever replayed.
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let socket: WebSocket | null = null;

    async function begin() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !mount.current) return;

      const term = new Terminal({
        convertEol: false,
        cursorBlink: true,
        fontFamily:
          "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.35,
        scrollback: 5000,
        theme: {
          background: "#202838",
          foreground: "#f7f8fa",
          cursor: "#b8ceff",
          selectionBackground: "#39465d",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(mount.current);
      fit.fit();
      term.onSelectionChange(() => setSelected(term.hasSelection()));
      runtime.current = { term, fit, socket: null };
      setPhase({ name: "connecting" });

      let issued: {
        ticket: string;
        url: string;
        target: TerminalTarget;
      };
      try {
        const response = await fetch(
          `/api/applications/${applicationId}/terminal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              size: { cols: term.cols, rows: term.rows },
            }),
          },
        );
        const value = await response.json();
        if (!response.ok) {
          if (disposed) return;
          setPhase(
            response.status === 409
              ? { name: "no-host" }
              : { name: "failed", detail: value.error ?? "Could not start." },
          );
          return;
        }
        issued = value;
      } catch {
        if (!disposed)
          setPhase({
            name: "failed",
            detail: "The controller did not answer.",
          });
        return;
      }
      if (disposed) return;
      setTarget(issued.target);

      socket = new WebSocket(
        `${issued.url}?ticket=${encodeURIComponent(issued.ticket)}`,
      );
      socket.binaryType = "arraybuffer";
      runtime.current.socket = socket;

      socket.onmessage = (event) => {
        if (disposed) return;
        if (event.data instanceof ArrayBuffer) {
          // Bytes, not text: xterm reassembles split UTF-8 itself.
          term.write(new Uint8Array(event.data));
          return;
        }
        const message = JSON.parse(String(event.data));
        if (message.type === "ready") setTarget(message.target);
        if (message.type !== "state") return;
        const state = message.state;
        if (state.name === "connected") setPhase({ name: "connected" });
        if (state.name === "failed")
          setPhase({ name: "failed", detail: state.detail });
        if (state.name === "ended")
          setPhase({
            name: "ended",
            detail:
              state.signal !== null
                ? "The shell was stopped."
                : `Shell exited${typeof state.code === "number" ? ` (${state.code})` : ""}.`,
          });
      };
      socket.onclose = () => {
        if (disposed) return;
        setPhase((current) =>
          current.name === "connected" || current.name === "connecting"
            ? { name: "ended", detail: "Connection lost." }
            : current,
        );
      };
      socket.onerror = () =>
        setPhase((current) =>
          current.name === "connecting"
            ? { name: "failed", detail: "The terminal transport failed." }
            : current,
        );

      term.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN)
          socket.send(new TextEncoder().encode(data));
      });

      const observer = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          return;
        }
        if (socket?.readyState === WebSocket.OPEN)
          socket.send(
            JSON.stringify({
              type: "resize",
              size: { cols: term.cols, rows: term.rows },
            }),
          );
      });
      observer.observe(mount.current);
      cleanup = () => observer.disconnect();
    }

    let cleanup = () => {};
    void begin().catch(() => {
      if (!disposed)
        setPhase({
          name: "failed",
          detail:
            "The terminal could not be initialized. Retry to connect again.",
        });
    });

    return () => {
      disposed = true;
      cleanup();
      socket?.close();
      runtime.current?.term.dispose();
      runtime.current = null;
      setPhase({ name: "idle" });
      setSelected(false);
    };
  }, [applicationId, open, attempt]);

  // The panel changing shape is a real resize of the remote pty, not a
  // stretched font.
  useEffect(() => {
    const current = runtime.current;
    if (!current || phase.name !== "connected") return;
    const timer = setTimeout(() => {
      try {
        current.fit.fit();
      } catch {
        return;
      }
      send({
        type: "resize",
        size: { cols: current.term.cols, rows: current.term.rows },
      });
    }, 60);
    return () => clearTimeout(timer);
  }, [expanded, minimized, phase.name, send]);

  function askAboutSelection() {
    const term = runtime.current?.term;
    if (!term) return;
    const excerpt = term.getSelection();
    if (!excerpt.trim()) return;
    if (new TextEncoder().encode(excerpt).length > SELECTION_LIMIT) {
      setNotice(
        "That selection is larger than 16 KiB. Select a smaller part and try again — nothing was sent.",
      );
      return;
    }
    setNotice(null);
    // The excerpt is the owner's own text, quoted with where and when it came
    // from. Pi must read it as context, not as instructions.
    onAskAboutSelection(
      `From the application server terminal on ${label} at ${new Date().toISOString()}:\n\n\`\`\`\n${excerpt}\n\`\`\`\n`,
    );
  }

  if (!open) return null;
  const status =
    phase.name === "connected"
      ? "Connected"
      : phase.name === "connecting"
        ? "Connecting…"
        : phase.name === "no-host"
          ? "No server"
          : phase.name === "failed"
            ? "Not connected"
            : phase.name === "ended"
              ? "Ended"
              : "";

  return (
    <section
      className="hv-terminal"
      data-expanded={expanded || undefined}
      data-minimized={minimized || undefined}
      aria-label="Application server terminal"
    >
      <header className="hv-terminal-bar">
        <TerminalLights />
        <strong>Terminal</strong>
        <span className="hv-terminal-target">
          Application server · <code>{label}</code>
        </span>
        <span className="hv-terminal-status" role="status">
          {status}
        </span>
        <div className="hv-terminal-controls">
          {selected && !minimized && (
            <button type="button" onClick={askAboutSelection}>
              <ChatCircleText weight="bold" aria-hidden="true" />
              Ask Pi about selection
            </button>
          )}
          {!minimized && (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-pressed={expanded}
            >
              {expanded ? (
                <ArrowsInSimple weight="bold" aria-hidden="true" />
              ) : (
                <ArrowsOutSimple weight="bold" aria-hidden="true" />
              )}
              {expanded ? "Restore" : "Expand"}
            </button>
          )}
          <button type="button" onClick={onToggleMinimized}>
            {minimized ? (
              <ArrowsOutSimple weight="bold" aria-hidden="true" />
            ) : (
              <Minus weight="bold" aria-hidden="true" />
            )}
            {minimized ? "Expand" : "Minimize"}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Closes this shell. Anything you detached on the server keeps running."
          >
            <X weight="bold" aria-hidden="true" />
            Disconnect
          </button>
        </div>
      </header>

      <div className="hv-terminal-body" hidden={minimized}>
        {piBusy && phase.name === "connected" && (
          <p className="hv-terminal-pi" role="status">
            Pi is also working on this application. Your commands run
            independently and are not sent to Pi.
          </p>
        )}
        {notice && (
          <p className="hv-terminal-notice" role="alert">
            {notice}
          </p>
        )}
        {phase.name === "no-host" && (
          <div className="hv-terminal-empty">
            <p>Connect an application server to use Terminal.</p>
            <button
              type="button"
              onClick={() =>
                onAskAboutSelection(
                  "Connect a server for this application so I can open a terminal on it.",
                )
              }
            >
              <Plug weight="bold" aria-hidden="true" />
              Ask Pi to connect a server
            </button>
          </div>
        )}
        {(phase.name === "failed" || phase.name === "ended") && (
          <p className="hv-terminal-ended" role="status">
            {phase.detail}{" "}
            <button type="button" onClick={() => setAttempt(attempt + 1)}>
              {phase.name === "failed" ? "Retry" : "Connect again"}
            </button>
          </p>
        )}
        <div
          className="hv-terminal-screen"
          ref={mount}
          hidden={phase.name === "no-host"}
        />
      </div>
    </section>
  );
}
