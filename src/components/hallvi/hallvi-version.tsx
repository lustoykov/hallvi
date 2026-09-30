"use client";

// Hallvi itself, at the foot of the column.
//
// The top of the column is the application; the foot is Hallvi: its face, its
// name and its version on one row that opens a small menu upward, as Claude's
// account menu does. Settings, What's new and the update check live in that
// menu. Hallvi's own version is not an account it acts through, so it stays
// out of the list of those in Settings.
//
// The worker already looks for a release every hour, so checking is only for
// the impatient and stays inside the menu. A waiting release is news: a mark
// on the row, "Update ready" beneath the name, and the first thing in the
// menu. Installing stays a separate press.
//
// An update is the rare thing here that takes Hallvi away and brings it back,
// so its phase stays visible whether the menu is open or not, in a notice
// that also survives the narrow screens where this column is hidden.
// Completion means the new server answers with the revision that was
// installed. The browser still needs a full page reload to replace its loaded
// interface.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowClockwise,
  CaretUpDown,
  Check,
  GearSix,
  Sparkle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { createPortal } from "react-dom";

import { ExternalLink } from "./external-link";
import { HallviMark } from "./hallvi-mark";
import { ago } from "./register";

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

const RUNNING: Phase[] = [
  "checking",
  "downloading",
  "verifying",
  "installing",
  "reconnecting",
];

const UPDATE_STEPS = [
  { phase: "checking", label: "Prepare" },
  { phase: "downloading", label: "Download" },
  { phase: "verifying", label: "Verify" },
  { phase: "installing", label: "Install" },
  { phase: "reconnecting", label: "Reconnect" },
] as const;

const UPDATE_HEADINGS: Record<Phase, string> = {
  checking: "Preparing Hallvi update",
  downloading: "Downloading Hallvi",
  verifying: "Verifying download",
  installing: "Installing Hallvi",
  reconnecting: "Reconnecting to Hallvi",
  completed: "Hallvi updated",
  failed: "Hallvi update failed",
  blocked: "Hallvi update not started",
};

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

export function ThisHallvi({
  settingsHref,
  whatsNewHref = "/whats-new",
}: {
  /** Settings, carrying the way back to where the reader was. */
  settingsHref: string;
  /** What's new, carrying the way back to where the reader was. */
  whatsNewHref?: string;
}) {
  const [state, setState] = useState<HallviVersionState | null>(null);
  const [open, setOpen] = useState(false);
  // Whether the reader pressed the check since opening the menu, so the item
  // can answer "Up to date" where they pressed it.
  const [looked, setLooked] = useState(false);
  // "looked 20 min ago" is measured from when the menu opened.
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [error, setError] = useState("");
  const [disconnected, setDisconnected] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const here = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setLooked(false);
  }, []);

  /** A layer over the page closes the way one is expected to. */
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!here.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      row.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);

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
        if (!response.ok) {
          if (alive) setDisconnected(true);
          return;
        }
        const value = (await response.json()) as HallviVersionState;
        asked = Promise.resolve(value);
        if (alive) {
          setDisconnected(false);
          setState(value);
          if (value.attempt?.phase === "completed") setNeedsReload(true);
        }
      } catch {
        if (alive) setDisconnected(true);
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
      if (action === "install") setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Hallvi could not do that.",
      );
    } finally {
      setBusy(null);
    }
  }, []);

  function reloadInterface() {
    // Drafts and pending text request keys already have browser recovery, but
    // attachments and settings edits can exist only in this page. Never reload
    // automatically or claim all unsent work is saved.
    if (
      window.confirm(
        "Reload Hallvi to use the updated interface? Copy any unsent work, keep your attached images and save any settings edits first.",
      )
    )
      window.location.reload();
  }

  const installed = state?.installed ?? null;
  const available = state?.available ?? null;
  const release = installed?.kind === "installed" ? installed : null;
  const preparing = busy === "install";
  const offering = Boolean(available && !available.blocked && !running);
  const settled = attempt && !running ? attempt.phase : null;
  const noticePhase = preparing ? "checking" : (attempt?.phase ?? "checking");
  const currentStep = UPDATE_STEPS.findIndex(
    (step) => step.phase === noticePhase,
  );
  const showNotice = preparing || Boolean(attempt);

  /** The row's second line and mark: the version, or the news. */
  const news: {
    words: string;
    tone: "ready" | "working" | "failed" | "blocked" | "done";
  } | null = !release
    ? null
    : running || preparing
      ? {
          words:
            attempt?.phase === "downloading" &&
            typeof attempt.progress === "number"
              ? `Updating · ${attempt.progress}%`
              : "Updating",
          tone: "working",
        }
      : settled === "failed"
        ? { words: "Update failed", tone: "failed" }
        : settled === "blocked"
          ? { words: "Update not started", tone: "blocked" }
          : settled === "completed"
            ? { words: "Updated", tone: "done" }
            : offering
              ? { words: "Update ready", tone: "ready" }
              : null;
  const subline = installed
    ? installed.kind === "installed"
      ? (news?.words ?? installed.version)
      : "Development checkout"
    : "";
  const label = release
    ? `Hallvi ${release.version}${news ? `, ${news.words.toLowerCase()}` : ""}`
    : installed
      ? "Hallvi, development checkout"
      : "Hallvi";

  /**
   * The one piece of news the menu leads with, most urgent first: an update
   * running, how the last one ended, then a release waiting.
   */
  const latest =
    running && attempt ? (
      <div className="hv-this-hallvi-news">
        <strong className="hv-sheen">
          {disconnected
            ? "Reconnecting to Hallvi"
            : UPDATE_HEADINGS[attempt.phase]}
        </strong>
        <small>
          {attempt.to?.version ?? available?.version} · Hallvi comes back on its
          own
        </small>
      </div>
    ) : attempt && settled === "completed" ? (
      <div className="hv-this-hallvi-news hv-this-hallvi-news-done">
        <strong>Updated to {attempt.to?.version}</strong>
        {needsReload && (
          <small>Reload the page to use the new interface.</small>
        )}
        <span className="hv-this-hallvi-news-actions">
          {needsReload && (
            <button
              type="button"
              className="hv-this-hallvi-go"
              onClick={reloadInterface}
            >
              Reload page
            </button>
          )}
          <button
            type="button"
            className="hv-this-hallvi-quiet-button"
            onClick={() => act("dismiss")}
          >
            Dismiss
          </button>
        </span>
      </div>
    ) : attempt && settled ? (
      <div className="hv-this-hallvi-news hv-this-hallvi-news-failed">
        <strong>
          {settled === "blocked"
            ? "The update did not start"
            : "The update failed"}
        </strong>
        <small>
          {attempt.message}
          {attempt.from
            ? ` Hallvi ${attempt.from.version} is still installed.`
            : ""}
        </small>
        <span className="hv-this-hallvi-news-actions">
          {offering && (
            <button
              type="button"
              className="hv-this-hallvi-go"
              disabled={busy !== null}
              onClick={() => act("install")}
            >
              {preparing ? "Starting…" : "Try again"}
            </button>
          )}
          <button
            type="button"
            className="hv-this-hallvi-quiet-button"
            onClick={() => act("dismiss")}
          >
            Dismiss
          </button>
        </span>
      </div>
    ) : offering && available ? (
      <div className="hv-this-hallvi-news hv-this-hallvi-news-ready">
        <strong>{available.version} is ready</strong>
        <small>
          {megabytes(available.size) && `${megabytes(available.size)} · `}
          <ExternalLink href={available.notes}>Notes</ExternalLink>
        </small>
        <button
          type="button"
          className="hv-this-hallvi-go"
          disabled={busy !== null}
          title="Hallvi checks it against the signed release, then stops and starts itself. Applications, conversations, credentials and ports stay as they are, and this page comes back on the same address."
          onClick={() => act("install")}
        >
          {preparing ? "Starting…" : "Update and restart"}
        </button>
      </div>
    ) : available?.blocked ? (
      <div className="hv-this-hallvi-news">
        <strong>{available.version} is out</strong>
        <small>{available.blocked}</small>
      </div>
    ) : null;

  return (
    <div className="hv-this-hallvi" ref={here}>
      <button
        type="button"
        ref={row}
        className={`hv-this-hallvi-row${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={
          release
            ? `Hallvi ${release.version} (${release.revision.slice(0, 7)}) on ${state?.machine}`
            : installed?.kind === "development"
              ? installed.reason
              : undefined
        }
        onClick={() => {
          if (open) return close();
          setNow(Date.now());
          setOpen(true);
        }}
      >
        <HallviMark size={24} />
        <span className="hv-this-hallvi-name">
          <strong>Hallvi</strong>
          <span
            className={`hv-this-hallvi-sub${news ? ` hv-this-hallvi-tone-${news.tone}` : ""}${news?.tone === "working" ? " hv-sheen" : ""}`}
          >
            {subline}
          </span>
        </span>
        {news && (
          <i
            className={`hv-this-hallvi-mark hv-this-hallvi-mark-${news.tone}`}
            aria-hidden="true"
          />
        )}
        <CaretUpDown className="hv-this-hallvi-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="hv-this-hallvi-menu" id={menuId}>
          {release && latest}

          <Link className="hv-this-hallvi-item" href={settingsHref}>
            <GearSix aria-hidden="true" />
            <span>Settings</span>
          </Link>
          <Link className="hv-this-hallvi-item" href={whatsNewHref}>
            <Sparkle aria-hidden="true" />
            <span>What&apos;s new</span>
          </Link>
          {release && (
            <button
              type="button"
              className="hv-this-hallvi-item"
              disabled={busy !== null || running}
              onClick={() => {
                setLooked(true);
                void act("check");
              }}
            >
              {busy === "check" ? (
                <>
                  <ArrowClockwise aria-hidden="true" />
                  <span className="hv-sheen">Checking for updates</span>
                </>
              ) : looked && state?.checkError ? (
                <>
                  <ArrowClockwise aria-hidden="true" />
                  <span title={state.checkError}>Could not look · retry</span>
                </>
              ) : looked && !offering ? (
                <>
                  <Check className="hv-this-hallvi-ok" aria-hidden="true" />
                  <span>Up to date</span>
                  <em>{ago(state?.checkedAt, now)}</em>
                </>
              ) : (
                <>
                  <ArrowClockwise aria-hidden="true" />
                  <span>Check for updates</span>
                </>
              )}
            </button>
          )}

          {error && (
            <p className="hv-this-hallvi-error" role="alert">
              {error}
            </p>
          )}

          {installed && (
            <p className="hv-this-hallvi-meta">
              {release ? (
                <>
                  <span>
                    {release.version} · {release.revision.slice(0, 7)}
                  </span>
                  <span>
                    {state?.machine} ·{" "}
                    {state?.checkedAt
                      ? `looked ${ago(state.checkedAt, now)}`
                      : "not looked yet"}
                  </span>
                  {state?.checkError && !looked && (
                    <span>Last look failed: {state.checkError}</span>
                  )}
                  {!state?.ownKey && (
                    <span>Trusting a release key from this installation</span>
                  )}
                </>
              ) : (
                <span>
                  {installed.kind === "development" && installed.reason} Use
                  git; a release does not replace it.
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {showNotice &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`hv-update-notice hv-update-notice-${noticePhase}`}
            role={noticePhase === "failed" ? "alert" : "status"}
            aria-live={noticePhase === "failed" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            <div className="hv-update-notice-heading">
              <strong>
                {disconnected && running
                  ? "Reconnecting to Hallvi"
                  : UPDATE_HEADINGS[noticePhase]}
              </strong>
              {(preparing ? available?.version : attempt?.to?.version) ? (
                <span>
                  {preparing ? available?.version : attempt?.to?.version}
                </span>
              ) : null}
            </div>
            <p>
              {preparing
                ? "Checking the release before installation begins."
                : disconnected && running
                  ? "The connection to Hallvi was interrupted. Waiting for its next update; the steps show the last reported progress."
                  : attempt?.message}
              {noticePhase === "completed" && (
                <>
                  {" "}
                  <Link href={whatsNewHref}>What&apos;s new</Link>
                </>
              )}
            </p>
            {noticePhase === "completed" && needsReload && (
              <>
                <p>
                  Reload this page to use the updated interface. Keep a copy of
                  unsent work, attached images and unsaved settings first.
                </p>
                <button type="button" onClick={reloadInterface}>
                  Reload page
                </button>
              </>
            )}
            {noticePhase === "downloading" &&
              typeof attempt?.progress === "number" && (
                <progress
                  aria-label="Hallvi download progress"
                  value={attempt.progress}
                  max="100"
                />
              )}
            {(running || preparing) && (
              <ol className="hv-update-notice-steps" aria-label="Update steps">
                {UPDATE_STEPS.map((step, index) => (
                  <li
                    key={step.phase}
                    role="listitem"
                    className={
                      index < currentStep
                        ? "complete"
                        : index === currentStep
                          ? "current"
                          : ""
                    }
                    aria-current={index === currentStep ? "step" : undefined}
                  >
                    {step.label}
                  </li>
                ))}
              </ol>
            )}
            {attempt && !running && !preparing && (
              <button type="button" onClick={() => act("dismiss")}>
                Dismiss
              </button>
            )}
            {error && <p role="alert">{error}</p>}
          </div>,
          document.body,
        )}
    </div>
  );
}
