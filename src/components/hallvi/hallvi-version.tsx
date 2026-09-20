"use client";

// Which Hallvi this is, and the one action that changes it.
//
// An update here is not a download the owner then runs. They press one button
// and Hallvi replaces itself while they watch, which means the only honest
// thing this card can do is say exactly where that has got to — and, when it
// fails, say what is still installed. So the phases are the helper's own
// phases, read back from the attempt file, and "done" is not the moment the
// files were swapped: it is the moment the new interface answers with the
// revision that was installed and the worker is back.
import { ArrowClockwise, Check, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { ExternalLink } from "./external-link";
import { LocalTime } from "./local-time";
import s from "./pi-setup-screen.module.css";

type Phase =
  | "checking"
  | "downloading"
  | "verifying"
  | "installing"
  | "reconnecting"
  | "completed"
  | "failed"
  | "blocked";

export interface UpdateAttemptView {
  id: string;
  phase: Phase;
  message: string;
  progress?: number;
  running?: boolean;
  from: { version: string } | null;
  to: { version: string; notes?: string } | null;
}

export interface HallviVersionState {
  installed:
    | {
        kind: "installed";
        version: string;
        revision: string;
        platform: string | null;
      }
    | {
        kind: "development";
        version: string | null;
        revision: string | null;
        reason: string;
      };
  machine: string;
  channel: string;
  ownKey: boolean;
  available: {
    version: string;
    revision: string;
    notes: string;
    releasedAt: string;
    size: number | null;
    blocked: string | null;
  } | null;
  checkedAt: string | null;
  checkError: string | null;
  attempt: UpdateAttemptView | null;
}

/** What each phase is called where the owner can read it. */
const SAYS: Record<Phase, string> = {
  checking: "Checking",
  downloading: "Downloading",
  verifying: "Verifying",
  installing: "Installing",
  reconnecting: "Reconnecting",
  completed: "Updated",
  failed: "Update failed",
  blocked: "Update not started",
};

const RUNNING: Phase[] = [
  "checking",
  "downloading",
  "verifying",
  "installing",
  "reconnecting",
];

function megabytes(size: number | null) {
  return size ? `${Math.round(size / (1024 * 1024))} MB` : null;
}

export function HallviVersion({ initial }: { initial: HallviVersionState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [error, setError] = useState("");
  const running = Boolean(
    state.attempt && RUNNING.includes(state.attempt.phase),
  );

  const ask = useCallback(async (action: "check" | "install" | "dismiss") => {
    const response = await fetch("/api/hallvi/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(value?.error ?? "Hallvi could not do that.");
    return value as HallviVersionState;
  }, []);

  /**
   * While an update runs, this page is one of the things being replaced. It
   * keeps asking, and the requests that fail while the interface is down are
   * the expected shape of "reconnecting" rather than an error to report.
   */
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/hallvi/update", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const value = (await response.json()) as HallviVersionState;
        if (alive) setState(value);
      } catch {
        // The interface is restarting. That is the phase, not a failure.
      }
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [running]);

  async function act(action: "check" | "install" | "dismiss") {
    setError("");
    setBusy(action === "dismiss" ? null : action);
    try {
      setState(await ask(action));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Hallvi could not do that.",
      );
    } finally {
      setBusy(null);
    }
  }

  const installed = state.installed;
  const attempt = state.attempt;
  return (
    <section className={s.card} aria-label="This Hallvi" id="hallvi-version">
      <section className={s.section}>
        <h2>
          <span className={s.step} aria-hidden="true">
            {state.available && !state.available.blocked ? (
              <ArrowClockwise />
            ) : (
              <Check />
            )}
          </span>
          This Hallvi
          {installed.kind === "development" && (
            <em className="hv-connection-state">Development checkout</em>
          )}
        </h2>
        <div className={s.accountRow}>
          <div>
            <p>
              {installed.kind === "installed" ? (
                <>
                  Version {installed.version} ({installed.revision.slice(0, 7)})
                  on {state.machine}
                </>
              ) : (
                <>
                  Running on {state.machine}
                  {installed.version ? ` as ${installed.version}` : ""}
                  {installed.revision
                    ? ` (${installed.revision.slice(0, 7)})`
                    : ""}
                </>
              )}
            </p>
            {installed.kind === "development" ? (
              <p className={s.hint}>
                {installed.reason} It updates when you change the code, so
                Hallvi does not offer to replace it with a release.
              </p>
            ) : (
              <p className={s.hint}>
                Following the {state.channel} channel.{" "}
                {state.checkedAt ? (
                  <>
                    Last looked{" "}
                    <LocalTime value={state.checkedAt} variant="compact" />.
                  </>
                ) : (
                  "Not looked yet."
                )}
                {!state.ownKey &&
                  " This installation trusts a release key from its own settings rather than Hallvi's."}
              </p>
            )}
          </div>
          {installed.kind === "installed" && (
            <button
              type="button"
              className={`${s.textButton} ${s.connectionAction}`}
              disabled={busy !== null || running}
              onClick={() => act("check")}
            >
              {busy === "check" ? "Checking…" : "Check for updates"}
            </button>
          )}
        </div>

        {state.checkError && (
          <p className={s.hint} role="status">
            <Warning aria-hidden="true" /> {state.checkError}
          </p>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        {installed.kind === "installed" && state.available && !running && (
          <div className="hv-update-available">
            <div className={s.accountRow}>
              <div>
                <p>
                  Hallvi {state.available.version} is available
                  {megabytes(state.available.size)
                    ? ` (${megabytes(state.available.size)})`
                    : ""}
                  .
                </p>
                <p className={s.hint}>
                  Published{" "}
                  <LocalTime
                    value={state.available.releasedAt}
                    variant="compact"
                  />
                  .{" "}
                  <ExternalLink href={state.available.notes}>
                    Release notes
                  </ExternalLink>
                </p>
                <p className={s.hint}>
                  {state.available.blocked ??
                    "Hallvi downloads it, checks it against the signed release, then stops and starts itself. Your applications, conversations, credentials and ports stay as they are, and this page comes back on the same address."}
                </p>
              </div>
              {!state.available.blocked && (
                <button
                  type="button"
                  className={s.primary}
                  disabled={busy !== null}
                  onClick={() => act("install")}
                >
                  {busy === "install"
                    ? "Starting…"
                    : `Update to ${state.available.version}`}
                </button>
              )}
            </div>
          </div>
        )}

        {installed.kind === "installed" &&
          !state.available &&
          !attempt &&
          state.checkedAt &&
          !state.checkError && (
            <p className={s.hint}>
              This is the newest {state.channel} release.
            </p>
          )}

        {attempt && (
          <div
            className={`hv-update-attempt hv-update-${attempt.phase}`}
            role="status"
            aria-live="polite"
          >
            <p>
              <strong>{SAYS[attempt.phase]}</strong>
              {attempt.to ? ` · Hallvi ${attempt.to.version}` : ""}
              {attempt.phase === "downloading" && attempt.progress
                ? ` · ${attempt.progress}%`
                : ""}
            </p>
            <p className={s.hint}>{attempt.message}</p>
            {attempt.phase === "failed" && attempt.from && (
              <p className={s.hint}>
                Hallvi {attempt.from.version} is still installed and running.
                Try again, or run <code>hallvi update</code> to see the same
                steps in a terminal.
              </p>
            )}
            {!RUNNING.includes(attempt.phase) && (
              <button
                type="button"
                className={s.textButton}
                onClick={() => act("dismiss")}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
