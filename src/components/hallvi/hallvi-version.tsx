"use client";

// Which Hallvi this is, in the chrome rather than in Settings.
//
// Hallvi's own version is not an account it acts through, so it does not
// belong in the list of those. It belongs where a program's version belongs:
// at the bottom, with an explicit update check below the version. The check
// opens the result panel immediately; installing stays a separate action.
//
// An update is the rare thing here that takes Hallvi away and brings it back,
// so while one runs its phase is on that line whether the panel is open or
// not — and "done" is not the moment the files were swapped, it is the moment
// the new interface answers with the revision that was installed.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";

import { ExternalLink } from "./external-link";
import { LocalTime } from "./local-time";

type Phase =
  | "checking"
  | "downloading"
  | "verifying"
  | "installing"
  | "reconnecting"
  | "completed"
  | "failed"
  | "blocked";

interface UpdateAttemptView {
  id: string;
  phase: Phase;
  message: string;
  progress?: number;
  from: { version: string } | null;
  to: { version: string } | null;
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

const megabytes = (size: number | null) =>
  size ? `${Math.round(size / (1024 * 1024))} MB` : null;

/** One answer per page, however many places ask for it. */
let asked: Promise<HallviVersionState | null> | undefined;
function readState() {
  asked ??= fetch("/api/hallvi/update", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  return asked;
}

export function ThisHallvi({ className }: { className?: string }) {
  const [state, setState] = useState<HallviVersionState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [error, setError] = useState("");
  const here = useRef<HTMLDivElement>(null);

  /** A layer over the page closes the way one is expected to. */
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!here.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    let alive = true;
    void readState().then((found) => alive && setState(found));
    return () => {
      alive = false;
    };
  }, []);

  const attempt = state?.attempt ?? null;
  const running = Boolean(attempt && RUNNING.includes(attempt.phase));

  /**
   * While an update runs, this page is one of the things being replaced. The
   * requests that fail while the interface is down are the shape of
   * "reconnecting", not an error to report.
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
        asked = Promise.resolve(value);
        if (alive) setState(value);
      } catch {
        // The interface is restarting. That is the phase.
      }
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [running]);

  const act = useCallback(async (action: "check" | "install" | "dismiss") => {
    setError("");
    setBusy(action === "dismiss" ? null : action);
    try {
      const response = await fetch("/api/hallvi/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value?.error ?? "Hallvi could not do that.");
      asked = Promise.resolve(value);
      setState(value as HallviVersionState);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Hallvi could not do that.",
      );
    } finally {
      setBusy(null);
    }
  }, []);

  if (!state) return null;
  const { installed, available } = state;
  const offering = Boolean(available && !available.blocked && !running);

  return (
    <div
      className={`hv-this-hallvi${className ? ` ${className}` : ""}`}
      ref={here}
    >
      <button
        type="button"
        className="hv-this-hallvi-line"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        title={
          installed.kind === "installed"
            ? `Hallvi ${installed.version} (${installed.revision.slice(0, 7)}) on ${state.machine}`
            : installed.reason
        }
      >
        <span>
          {installed.kind === "installed"
            ? `Hallvi ${installed.version}`
            : "Hallvi · development checkout"}
        </span>
        {offering && <em className="hv-this-hallvi-ready">Update available</em>}
      </button>

      {installed.kind === "installed" && (
        <button
          type="button"
          className="hv-this-hallvi-check"
          disabled={busy !== null || running}
          onClick={() => {
            setOpen(true);
            void act("check");
          }}
        >
          <ArrowClockwise size={14} aria-hidden="true" />
          {busy === "check" ? "Checking for updates…" : "Check for updates"}
        </button>
      )}

      {attempt && (
        <p
          className={`hv-this-hallvi-phase hv-update-${attempt.phase}`}
          role="status"
          aria-live="polite"
        >
          {SAYS[attempt.phase]}
          {attempt.to ? ` · ${attempt.to.version}` : ""}
          {attempt.phase === "downloading" && attempt.progress
            ? ` · ${attempt.progress}%`
            : ""}
        </p>
      )}

      {open && (
        <div
          className="hv-this-hallvi-panel"
          role="region"
          aria-label="Hallvi updates"
        >
          {installed.kind === "installed" ? (
            <p>
              {installed.version} ({installed.revision.slice(0, 7)}) on{" "}
              {state.machine}
            </p>
          ) : (
            <p>{installed.reason} Use git; a release does not replace it.</p>
          )}

          {installed.kind === "installed" && (
            <>
              <p className="hv-this-hallvi-quiet">
                {state.channel} channel ·{" "}
                {state.checkedAt ? (
                  <>
                    looked{" "}
                    <LocalTime value={state.checkedAt} variant="compact" />
                  </>
                ) : (
                  "not looked yet"
                )}
                {!state.ownKey && " · trusting a key from this installation"}
              </p>

              {busy === "check" ? (
                <p className="hv-this-hallvi-quiet" role="status">
                  Checking for new releases…
                </p>
              ) : available ? (
                <div className="hv-this-hallvi-offer">
                  <p>
                    <strong>{available.version}</strong> is available
                    {megabytes(available.size)
                      ? ` (${megabytes(available.size)})`
                      : ""}
                    {" · "}
                    <ExternalLink href={available.notes}>notes</ExternalLink>
                  </p>
                  <p className="hv-this-hallvi-quiet">
                    {available.blocked ??
                      "Hallvi checks it against the signed release, then stops and starts itself. Applications, conversations, credentials and ports stay as they are, and this page comes back on the same address."}
                  </p>
                </div>
              ) : state.checkError ? (
                <p className="hv-this-hallvi-quiet">
                  {state.checkError} Hallvi cannot say whether a newer release
                  exists.
                </p>
              ) : (
                state.checkedAt && (
                  <p className="hv-this-hallvi-quiet">
                    This is the newest {state.channel} release.
                  </p>
                )
              )}

              {attempt && !RUNNING.includes(attempt.phase) && (
                <p className="hv-this-hallvi-quiet">
                  {attempt.message}
                  {attempt.phase === "failed" && attempt.from
                    ? ` Hallvi ${attempt.from.version} is still installed.`
                    : ""}
                </p>
              )}

              {error && (
                <p className="hv-this-hallvi-quiet" role="alert">
                  {error}
                </p>
              )}

              <div className="hv-this-hallvi-actions">
                {offering && (
                  <button
                    type="button"
                    className="hv-this-hallvi-go"
                    disabled={busy !== null}
                    onClick={() => act("install")}
                  >
                    {busy === "install" ? "Starting…" : "Update"}
                  </button>
                )}
                {attempt && !RUNNING.includes(attempt.phase) && (
                  <button type="button" onClick={() => act("dismiss")}>
                    Dismiss
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
