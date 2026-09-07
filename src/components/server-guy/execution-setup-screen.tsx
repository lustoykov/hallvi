"use client";

import {
  ArrowClockwise,
  ArrowLeft,
  ArrowSquareOut,
  Check,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ExecutionSetupStatus } from "@/server/execution-setup";
import type { ExecutionEnvironmentStatus } from "@/server/types";

import { api } from "./api";
import { LocalTime } from "./local-time";
import { SettingsNav } from "./settings-nav";
import s from "./pi-setup-screen.module.css";

export const ENVIRONMENT_LABELS: Record<
  ExecutionEnvironmentStatus["state"],
  string
> = {
  ready: "Engine reachable",
  "not-found": "No engine found",
  unreachable: "Engine not running",
  "permission-denied": "Permission denied",
  unsupported: "Unsupported engine",
};

/**
 * The prerequisite for built-in repository execution, checked on the machine
 * running Server Guy: what was found, why it matters, one recovery action,
 * Check again, and image preparation with visible progress.
 */
export function ExecutionEnvironmentCard({
  status,
  busy,
  onCheck,
  onPrepare,
  compact = false,
}: {
  status: ExecutionSetupStatus;
  busy: "check" | "prepare" | null;
  onCheck: () => void;
  onPrepare?: () => void;
  compact?: boolean;
}) {
  const environment = status.environment;
  const ready = environment?.ready ?? false;
  const verified = environment?.verified ?? null;
  const preparing = status.preparation.running;
  // Healthy and compact: one line with the last check and an optional
  // refresh. Refreshing re-reads the engine; it is not an application test.
  if (compact && environment && ready)
    return (
      <section
        className="sg-execution ready compact"
        aria-label="Execution environment"
        aria-live="polite"
      >
        <p className="sg-execution-line">
          <span className="sg-execution-state ready">
            <Check weight="bold" aria-hidden="true" />
            {ENVIRONMENT_LABELS[environment.state]}
          </span>
          <small>
            on {environment.host.hostname} · checked{" "}
            <LocalTime value={environment.checkedAt} variant="compact" /> ·{" "}
            {verified
              ? "runner images prepared"
              : "runner images are pulled on the first run"}
          </small>
          <button
            className="sg-text-button"
            disabled={busy !== null || preparing}
            onClick={onCheck}
            type="button"
          >
            {busy === "check" ? (
              <SpinnerGap className="spin" aria-hidden="true" />
            ) : (
              <ArrowClockwise aria-hidden="true" />
            )}
            Refresh
          </button>
          {onPrepare && !verified && (
            <button
              className="sg-text-button"
              disabled={busy !== null || preparing}
              onClick={onPrepare}
              type="button"
            >
              Prepare images now
            </button>
          )}
          <Link className="sg-text-button" href="/setup/execution">
            Execution settings
          </Link>
        </p>
        {preparing && (
          <p className="sg-execution-progress" role="status">
            <SpinnerGap className="spin" aria-hidden="true" />
            {status.preparation.message ?? "Preparing…"}
          </p>
        )}
        {status.preparation.error && !preparing && (
          <p className="sg-error" role="alert">
            {status.preparation.error}
          </p>
        )}
      </section>
    );
  return (
    <section
      className={`sg-execution ${ready ? "ready" : "attention"}`}
      aria-label="Execution environment"
      aria-live="polite"
    >
      <div className="sg-execution-heading">
        <span
          className={`sg-execution-state ${environment?.state ?? "unchecked"}`}
        >
          {ready ? (
            <Check weight="bold" aria-hidden="true" />
          ) : (
            <Warning weight="bold" aria-hidden="true" />
          )}
          {environment ? ENVIRONMENT_LABELS[environment.state] : "Not checked"}
        </span>
        {environment && (
          <small>
            Checked{" "}
            <LocalTime value={environment.checkedAt} variant="compact" /> on{" "}
            {environment.host.hostname} ({environment.host.platform}/
            {environment.host.arch}), the machine running Server Guy
          </small>
        )}
      </div>
      <p className="sg-execution-why">
        Server Guy runs repository code only inside disposable containers, so
        verifying a candidate needs a reachable Docker Engine on this machine;
        Phases 1 and 2 do not.
      </p>
      {environment && (
        <p className="sg-execution-summary">{environment.summary}</p>
      )}
      {environment && !ready && (
        <div className="sg-execution-recovery">
          <strong>{environment.recovery.label}</strong>
          <ol>
            {environment.recovery.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {environment.recovery.href && (
            <a
              href={environment.recovery.href}
              rel="noreferrer"
              target="_blank"
            >
              Official Docker instructions <ArrowSquareOut aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      {ready && (
        <p className="sg-execution-verified">
          {verified ? (
            <>
              Execution environment verified{" "}
              <LocalTime value={verified.at} variant="compact" />: runner image{" "}
              <code>{verified.runnerImage}</code>, database image{" "}
              <code>{verified.databaseImage}</code>.
            </>
          ) : (
            <>
              Engine reachable; the runner images are not prepared yet. They are
              pulled automatically on the first execution, or now:
            </>
          )}
        </p>
      )}
      {preparing && (
        <p className="sg-execution-progress" role="status">
          <SpinnerGap className="spin" aria-hidden="true" />
          {status.preparation.message ?? "Preparing…"}
        </p>
      )}
      {status.preparation.error && !preparing && (
        <p className="sg-error" role="alert">
          {status.preparation.error}
        </p>
      )}
      <div className="sg-execution-actions">
        <button
          className="sg-secondary-button"
          disabled={busy !== null || preparing}
          onClick={onCheck}
          type="button"
        >
          {busy === "check" ? (
            <SpinnerGap className="spin" aria-hidden="true" />
          ) : (
            <ArrowClockwise aria-hidden="true" />
          )}
          Check again
        </button>
        {ready && onPrepare && !verified && (
          <button
            className="sg-primary-button"
            disabled={busy !== null || preparing}
            onClick={onPrepare}
            type="button"
          >
            {busy === "prepare" || preparing ? (
              <SpinnerGap className="spin" aria-hidden="true" />
            ) : null}
            Prepare execution environment
          </button>
        )}
        {compact && (
          <Link className="sg-text-button" href="/setup/execution">
            Execution settings
          </Link>
        )}
      </div>
      {environment && (
        <details className="sg-execution-details">
          <summary>Technical details</summary>
          <dl>
            <dt>Endpoint</dt>
            <dd>
              {environment.endpoint ?? "none"}
              {environment.endpointSource
                ? ` (from ${environment.endpointSource})`
                : ""}
            </dd>
            {environment.engine && (
              <>
                <dt>Engine</dt>
                <dd>
                  {environment.engine.platform} · {environment.engine.version} ·
                  API {environment.engine.apiVersion} · {environment.engine.os}/
                  {environment.engine.arch}
                </dd>
              </>
            )}
            <dt>Detail</dt>
            <dd>{environment.detail ?? "none"}</dd>
            <dt>Images</dt>
            <dd>
              {status.images.runner} · {status.images.database}
            </dd>
          </dl>
        </details>
      )}
    </section>
  );
}

export function ExecutionSetupScreen({
  initialStatus,
}: {
  initialStatus: ExecutionSetupStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<"check" | "prepare" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!status.preparation.running) return;
    const timer = window.setTimeout(async () => {
      try {
        setStatus(await api.executionSetup());
      } catch {
        /* keep the last status */
      }
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function act(action: "check" | "prepare") {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      setStatus(await api.executionSetup(action));
      focus.current?.focus();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not check the execution environment.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={`sg-setup-shell ${s.root}`}>
      <header className="sg-setup-topbar">
        <Link className="sg-setup-brand" href="/applications">
          <span className="sg-app-mark">SG</span>
          <span>Server Guy</span>
        </Link>
        <Link className="sg-setup-back" href="/applications">
          <ArrowLeft aria-hidden="true" /> View applications
        </Link>
      </header>
      <div className={s.page}>
        <SettingsNav current="execution" />
        <header className={s.heading}>
          <h1>Settings</h1>
          <p>
            Execution: the disposable runner that verifies repository code
            before anything is deployed.
          </p>
        </header>
        <section className={s.card} aria-label="Execution environment settings">
          <section className={s.section} ref={focus} tabIndex={-1}>
            <ExecutionEnvironmentCard
              status={status}
              busy={busy}
              onCheck={() => void act("check")}
              onPrepare={() => void act("prepare")}
            />
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
          </section>
          <section className={s.section} aria-labelledby="execution-policy">
            <h2 id="execution-policy">What runs where</h2>
            <p className={s.hint}>
              Every execution copies one exact source tree into a fresh
              workspace volume and runs it as a non-root user with all
              capabilities dropped, no new privileges, a read-only root, and
              bounded memory, CPU, processes, time and output. Your credentials,
              this database, your home directory, the Docker socket and the host
              network are never mounted or reachable. Dependency downloads leave
              only through an allowlisting proxy to the package index, which is
              removed before the application starts; the application and its
              disposable PostgreSQL then share an internal network with no route
              out. Docker Desktop is not required: any engine that exposes the
              standard local socket works. Nothing here is the production host,
              which Phase 5 selects.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
