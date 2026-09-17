"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  Check,
  Copy,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GithubLoginAttempt,
  GithubSetupStatus,
} from "@/server/github-setup";
import type { GithubRepositoryCheckResult } from "@/server/applications";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { SettingsNav } from "./settings-nav";
import s from "./pi-setup-screen.module.css";

async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error ?? "Could not reach Haldur. Try again.");
  return data;
}
const waiting = (attempt: GithubLoginAttempt | null) =>
  attempt?.status === "waiting" || attempt?.status === "starting";
/**
 * Extend the chosen Pi setup layout: account, repository access, then one
 * Continue action.
 */
export function GithubSetupScreen({
  initialStatus,
  returnToAdd = false,
}: {
  initialStatus: GithubSetupStatus;
  returnToAdd?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [attempt, setAttempt] = useState(initialStatus.attempt);
  const [choosing, setChoosing] = useState(
    !initialStatus.connection || Boolean(initialStatus.issue),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [repositoryCheck, setRepositoryCheck] = useState<{
    connectionId: string;
    checking: boolean;
    results: GithubRepositoryCheckResult[];
    error: string | null;
  } | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const working = waiting(attempt);
  const connected = Boolean(status.connection && !status.issue);
  const visibleCheck =
    repositoryCheck?.connectionId === status.connection?.id
      ? repositoryCheck
      : null;

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const checkRepositories = useCallback(
    async (connectionId: string, expected: number) => {
      setRepositoryCheck({
        connectionId,
        checking: true,
        results: [],
        error: null,
      });
      try {
        // Keep this server request running if the user navigates back to their
        // application.
        const results = await request<GithubRepositoryCheckResult[]>(
          "/api/github/setup/repositories",
          "POST",
          { connectionId },
        );
        if (generation.current !== expected) return;
        setRepositoryCheck({
          connectionId,
          checking: false,
          results,
          error: null,
        });
        // A check can discover a revoked login. Refresh that status without
        // hiding its results.
        const fresh = await request<GithubSetupStatus>(
          "/api/github/setup",
        ).catch(() => null);
        if (generation.current !== expected) return;
        if (fresh) setStatus(fresh);
        router.refresh();
      } catch {
        if (generation.current !== expected) return;
        setRepositoryCheck({
          connectionId,
          checking: false,
          results: [],
          error:
            "Could not finish checking repositories. Open your application and choose Check again.",
        });
      }
    },
    [router],
  );

  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [working]);

  useEffect(() => {
    if (!waiting(attempt)) return;
    const current = attempt!;
    const controller = new AbortController();
    const expected = generation.current;
    const timeout = window.setTimeout(async () => {
      try {
        const next = await request<GithubLoginAttempt>(
          `/api/github/setup/login/${current.id}`,
          "POST",
          {},
          controller.signal,
        );
        const saved =
          next.status === "connected"
            ? await request<GithubSetupStatus>(
                "/api/github/setup",
                "GET",
                undefined,
                controller.signal,
              )
            : null;
        if (controller.signal.aborted || generation.current !== expected)
          return;
        if (saved) {
          setStatus(saved);
          setChoosing(false);
          router.refresh();
          if (saved.connection && !saved.issue)
            void checkRepositories(saved.connection.id, expected);
        }
        setAttempt(next);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted || generation.current !== expected)
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not check sign-in. Try again.",
        );
        setAttempt({ ...current, status: "failed" });
      }
    }, current.intervalSeconds * 1000);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, router, checkRepositories]);

  async function act(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not change GitHub settings.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function refresh() {
    const fresh = await request<GithubSetupStatus>("/api/github/setup");
    setStatus(fresh);
    setAttempt(fresh.attempt);
    return fresh;
  }
  async function disconnect() {
    generation.current++;
    const fresh = await request<GithubSetupStatus>(
      "/api/github/setup",
      "DELETE",
      { confirm: "disconnect" },
    );
    setStatus(fresh);
    setAttempt(null);
    setChoosing(true);
    setConfirmDisconnect(false);
    router.refresh();
  }
  const remaining =
    attempt?.expiresAt && now
      ? Math.max(0, Math.ceil((Date.parse(attempt.expiresAt) - now) / 1000))
      : null;

  return (
    <main className={`sg-setup-shell ${s.root}`}>
      <header className="sg-setup-topbar">
        <Link className="sg-setup-brand" href="/applications">
          <span className="sg-app-mark">H</span>
          <span>Haldur</span>
        </Link>
        <Link className="sg-setup-back" href="/applications">
          <ArrowLeft /> All applications
        </Link>
      </header>
      <div className={s.page}>
        <SettingsNav current="github" />
        <div className={s.heading}>
          <h1>Connect GitHub</h1>
          <p>
            Connect through the Haldur GitHub App and choose which repositories
            it can access.
          </p>
        </div>
        <section className={s.card}>
          <section
            className={s.section}
            aria-labelledby="github-account-heading"
          >
            <h2 id="github-account-heading">GitHub account</h2>
            {working && attempt ? (
              <div className={s.device}>
                {connected && status.connection && (
                  <p className={s.hint}>
                    Using {status.connection.account.login} until the new
                    sign-in succeeds.
                  </p>
                )}
                <p>Enter this code on GitHub:</p>
                <div className={s.codeRow}>
                  <code>{attempt.userCode ?? "Getting code…"}</code>
                  <button
                    className={s.textButton}
                    disabled={!attempt.userCode}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(attempt.userCode!)
                        .then(() => setCopied(true))
                        .catch(() =>
                          setError("Select the code to copy it manually."),
                        );
                    }}
                  >
                    <Copy />
                    {copied ? "Copied" : "Copy code"}
                  </button>
                </div>
                <a
                  className={s.primary}
                  href={attempt.verificationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open GitHub <ArrowSquareOut />
                </a>
                <p role="status">
                  <SpinnerGap className="spin" /> Waiting for sign-in…
                </p>
                {remaining !== null && (
                  <p aria-live="off">
                    Code expires in {Math.floor(remaining / 60)}:
                    {String(remaining % 60).padStart(2, "0")}
                  </p>
                )}
                <button
                  className={s.textButton}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      generation.current++;
                      setAttempt(
                        await request<GithubLoginAttempt>(
                          `/api/github/setup/login/${attempt.id}`,
                          "DELETE",
                          {},
                        ),
                      );
                    })
                  }
                >
                  Cancel sign-in
                </button>
              </div>
            ) : connected && !choosing && status.connection ? (
              <>
                <div className={s.accountRow}>
                  <div>
                    <strong className={s.success} role="status">
                      <Check />
                      Connected as {status.connection.account.login}
                    </strong>
                    <p>Separate login for Haldur</p>
                  </div>
                  <button
                    className={s.textButton}
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await refresh();
                        setChoosing(true);
                      })
                    }
                  >
                    Change
                  </button>
                </div>
                {status.connection.expiresAt && (
                  <p className={s.connectionHelp}>
                    {status.connection.automaticRenewal
                      ? "Access renews automatically."
                      : "Sign in again to enable automatic renewal."}
                  </p>
                )}
              </>
            ) : (
              <div className={s.actions}>
                {status.registration && (
                  <button
                    className={s.primary}
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        generation.current++;
                        setCopied(false);
                        setAttempt(
                          await request<GithubLoginAttempt>(
                            "/api/github/setup/login",
                            "POST",
                            {},
                          ),
                        );
                      })
                    }
                  >
                    Connect GitHub
                  </button>
                )}
                {!status.registration && (
                  <details className={s.connectionHelp} open>
                    <summary>Register the Haldur GitHub App</summary>
                    <p>
                      The owner of this Haldur installation needs to register
                      its GitHub App. Set these values, then restart Haldur:
                    </p>
                    <code>
                      HALDUR_GITHUB_CLIENT_ID
                      <br />
                      HALDUR_GITHUB_APP_SLUG
                    </code>
                    <p>
                      Enable device flow, Contents: read and write, and Pull
                      requests: read and write. Keep user-token expiration
                      enabled.
                    </p>
                    <a
                      href="https://github.com/settings/apps/new"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Register GitHub App
                    </a>
                  </details>
                )}
                {status.detected.issue && (
                  <p className={s.hint}>{status.detected.issue}</p>
                )}
                <button
                  className={s.textButton}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await refresh();
                    })
                  }
                >
                  Check again
                </button>
                {connected && (
                  <button
                    className={s.textButton}
                    disabled={busy}
                    onClick={() => {
                      setChoosing(false);
                      setAttempt(null);
                    }}
                  >
                    Keep current connection
                  </button>
                )}
              </div>
            )}
            {(error ?? status.issue ?? attempt?.message) &&
              !confirmDisconnect && (
                <p role="alert" className={s.error}>
                  {error ?? status.issue ?? attempt?.message}
                </p>
              )}
            <div className={s.privacy}>
              <button className={s.textButton} popoverTarget="github-storage">
                Storage &amp; privacy
              </button>
              {status.connection && (
                <button
                  className={`${s.textButton} ${s.disconnect}`}
                  disabled={busy || working}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect
                </button>
              )}
            </div>
          </section>
          <section className={s.section}>
            <h2>Repository access</h2>
            <p className={s.hint}>
              {status.connection?.mode === "app"
                ? "Choose which repositories Haldur can read on GitHub. Existing applications are checked automatically after reconnecting."
                : connected
                  ? "Existing applications are checked automatically after reconnecting. New applications are checked when you add them."
                  : "Connect an account to check repository access for your applications."}
            </p>
            {visibleCheck && (
              <div
                className={s.repositoryChecks}
                aria-live="polite"
                aria-busy={visibleCheck.checking}
              >
                {visibleCheck.checking ? (
                  <p role="status">
                    <SpinnerGap className="spin" />
                    Checking repository…
                  </p>
                ) : visibleCheck.error ? (
                  <p role="alert" className={s.error}>
                    {visibleCheck.error}
                  </p>
                ) : visibleCheck.results.length === 0 ? (
                  <p className={s.hint}>
                    No applications to check yet. Add an application to verify
                    its repository.
                  </p>
                ) : (
                  <>
                    <p role="status">
                      {visibleCheck.results.every(
                        (check) => check.status === "passed",
                      )
                        ? "Repository checks passed."
                        : "Repository checks finished. Some need attention."}
                    </p>
                    <ul>
                      {visibleCheck.results.map((check) => (
                        <li key={check.applicationId}>
                          <Link
                            className={s.textButton}
                            href={`/applications/${check.applicationId}`}
                          >
                            {check.repository}
                            <ArrowRight />
                          </Link>
                          <p
                            className={
                              check.status === "passed" ? s.success : s.error
                            }
                          >
                            {check.status === "passed"
                              ? "Repository access passed."
                              : check.result}
                          </p>
                          {check.status !== "passed" && (
                            <p className={s.hint}>
                              After fixing access, open this application and
                              choose Check again.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {status.connection?.mode === "app" && (
              <p>
                <a
                  className={s.textButton}
                  href={status.connection.accessUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Choose repositories on GitHub <ArrowSquareOut />
                </a>
              </p>
            )}
          </section>
          <footer className={s.footer}>
            {visibleCheck?.checking ? (
              <button className={s.primary} disabled>
                {returnToAdd ? "Back to add application" : "View applications"}
                <ArrowRight />
              </button>
            ) : (
              <Link
                className={s.primary}
                href={returnToAdd ? "/applications/new" : "/applications"}
              >
                {returnToAdd ? "Back to add application" : "View applications"}
                <ArrowRight />
              </Link>
            )}
          </footer>
        </section>
      </div>
      <aside
        popover="auto"
        id="github-storage"
        className={s.help}
        aria-labelledby="github-storage-title"
      >
        <header>
          <h2 id="github-storage-title">Storage &amp; privacy</h2>
          <button
            className={s.close}
            popoverTarget="github-storage"
            popoverTargetAction="hide"
            aria-label="Close GitHub help"
          >
            <X />
          </button>
        </header>
        <h3>GitHub App login</h3>
        <p>
          GitHub sign-in stores access and refresh tokens in the file below.
          They are not encrypted; the file is readable and writable only by the
          operating-system user running Haldur. Your password never reaches
          Haldur.
        </p>
        <code>{status.storagePath}</code>
        <p>
          Access is renewed automatically when needed for a GitHub request. If
          renewal expires or is rejected, sign in again. Haldur does not ship a
          GitHub App private key or client secret.
        </p>
        <h3>Permissions</h3>
        <p>
          The GitHub App limits access to installed repositories and its granted
          permissions. Repository inspection is read-only. Publishing a
          preparation branch and pull request also requires your permission
          within Haldur.
        </p>
        <h3>Disconnect</h3>
        <p>
          Disconnect removes Haldur’s saved login and both tokens. Application
          history remains, and repository checks require a new connection and
          re-verification. To revoke the authorization on GitHub too, open{" "}
          <a
            href="https://github.com/settings/apps/authorizations"
            target="_blank"
            rel="noreferrer"
          >
            authorized GitHub Apps
          </a>
          .
        </p>
      </aside>
      {confirmDisconnect && (
        <ConfirmActionDialog
          title="Disconnect GitHub?"
          description="Removes Haldur’s saved connection. Application history stays; repository access must be checked again after reconnecting."
          action="Disconnect"
          busy={busy}
          error={error}
          onCancel={() => {
            setConfirmDisconnect(false);
            setError(null);
          }}
          onConfirm={() => void act(disconnect)}
        />
      )}
    </main>
  );
}
