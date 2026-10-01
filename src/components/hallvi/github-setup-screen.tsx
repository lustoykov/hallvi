"use client";

import {
  ArrowSquareOut,
  Check,
  Copy,
  GitBranch,
  GitPullRequest,
  Lock,
  ProhibitInset,
  SpinnerGap,
  Warning,
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
import type { SetupReturn } from "@/server/setup-return";
import { SettingsShell } from "./settings-shell";
import h from "./pi-setup-screen.module.css";
import s from "./settings.module.css";

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
    throw new Error(data?.error ?? "Could not reach Hallvi. Try again.");
  return data;
}
const waiting = (attempt: GithubLoginAttempt | null) =>
  attempt?.status === "waiting" || attempt?.status === "starting";
/**
 * The GitHub account in the summary, then each application's repository
 * access, then what the App may do.
 */
export function GithubSetupScreen({
  initialStatus,
  returnToAdd = false,
  returnTo,
}: {
  returnTo?: SetupReturn;
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
    <SettingsShell
      current="github"
      title="GitHub"
      lead="Reading the private repositories you choose."
      returnTo={returnTo}
      back={
        returnToAdd
          ? { href: "/applications/new", label: "Back to add application" }
          : undefined
      }
    >
      <section className={s.hero} aria-labelledby="github-account-heading">
        {working && attempt ? (
          <div>
            <span className={s.eyebrow} id="github-account-heading">
              Signing in
            </span>
            {connected && status.connection && (
              <p>
                Using {status.connection.account.login} until the new sign-in
                succeeds.
              </p>
            )}
            <p>Enter this code on GitHub:</p>
            <h3 className={s.code}>{attempt.userCode ?? "Getting code…"}</h3>
            <p>Then choose the repositories Hallvi may read.</p>
            <div className={s.heroActions}>
              <a
                className={`${s.btn} ${s.primary}`}
                href={attempt.verificationUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open GitHub <ArrowSquareOut />
              </a>
              <button
                type="button"
                className={s.link}
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
                <Copy /> {copied ? "Copied" : "Copy code"}
              </button>
              <span className={s.muted} role="status">
                <SpinnerGap className="spin" /> Waiting for sign-in…
              </span>
              {remaining !== null && (
                <span className={s.muted} aria-live="off">
                  Code expires in {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, "0")}
                </span>
              )}
              <button
                type="button"
                className={`${s.link} ${s.quiet}`}
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
            <p className={s.muted}>
              On another browser, open {attempt.verificationUrl}.
            </p>
          </div>
        ) : connected && !choosing && status.connection ? (
          <>
            <span className={s.avatar} aria-hidden="true">
              {status.connection.account.login.charAt(0).toUpperCase()}
            </span>
            <div>
              <span className={s.eyebrow} id="github-account-heading">
                Signed in
              </span>
              <h3 role="status">
                Connected as {status.connection.account.login}
              </h3>
              <p>Separate login for Hallvi</p>
              {status.connection.expiresAt && (
                <p>
                  {status.connection.automaticRenewal
                    ? "Access renews automatically."
                    : "Sign in again to enable automatic renewal."}
                </p>
              )}
            </div>
            <div className={s.heroSide}>
              {status.connection.mode === "app" && (
                <a
                  className={s.btn}
                  href={status.connection.accessUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Choose repositories on GitHub <ArrowSquareOut />
                </a>
              )}
              <span className={s.rowSide}>
                <button
                  type="button"
                  className={s.link}
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
                <button
                  type="button"
                  className={`${s.link} ${s.quiet}`}
                  disabled={busy || working}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect
                </button>
              </span>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className={s.eyebrow} id="github-account-heading">
                Not signed in
              </span>
              <h3>Public repositories just work</h3>
              <p>
                Sign in only when an application’s code is private. The Hallvi
                App reads the repositories you select on GitHub; connecting
                changes nothing in them.
              </p>
              {!status.registration && (
                <details className={h.connectionHelp} open>
                  <summary>This Hallvi release can’t sign in to GitHub</summary>
                  <p>
                    That’s a gap in the release, not something you missed.
                    Public repositories work without any GitHub account. Install
                    a release that includes GitHub sign-in over this one and
                    Connect GitHub appears here; applications and history are
                    kept. You never need to register a GitHub App or paste a
                    token.
                  </p>
                </details>
              )}
              {status.detected.issue && <p>{status.detected.issue}</p>}
            </div>
            <div className={s.heroSide}>
              {status.registration && (
                <button
                  type="button"
                  className={s.btn}
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
              <span className={s.rowSide}>
                <button
                  type="button"
                  className={s.link}
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
                    type="button"
                    className={s.link}
                    disabled={busy}
                    onClick={() => {
                      setChoosing(false);
                      setAttempt(null);
                    }}
                  >
                    Keep current connection
                  </button>
                )}
                {status.connection && (
                  <button
                    type="button"
                    className={`${s.link} ${s.quiet}`}
                    disabled={busy || working}
                    onClick={() => setConfirmDisconnect(true)}
                  >
                    Disconnect
                  </button>
                )}
              </span>
            </div>
          </>
        )}
      </section>
      {(error ?? status.issue ?? attempt?.message) && !confirmDisconnect && (
        <p role="alert" className={s.error}>
          {error ?? status.issue ?? attempt?.message}
        </p>
      )}

      <section aria-label="Repository access">
        <h3 className={s.groupTitle} id="github-repositories-heading">
          Repository access
          {connected && status.connection && !visibleCheck?.checking && (
            <button
              type="button"
              className={s.link}
              disabled={busy}
              onClick={() =>
                void checkRepositories(
                  status.connection!.id,
                  generation.current,
                )
              }
            >
              {visibleCheck ? "Check again" : "Check my applications"}
            </button>
          )}
        </h3>
        {!visibleCheck && (
          <p className={s.fine}>
            {status.connection?.mode === "app"
              ? "Choose on GitHub which repositories Hallvi may reach. Existing applications are checked automatically after reconnecting."
              : connected
                ? "Existing applications are checked automatically after reconnecting. New applications are checked when you add them."
                : "Connect an account to check repository access for your applications. Public repositories work without a GitHub connection. For a private repository, sign in and then give the Hallvi App access to that repository on GitHub."}
          </p>
        )}
        {visibleCheck && (
          <div aria-live="polite" aria-busy={visibleCheck.checking}>
            {visibleCheck.checking ? (
              <p className={s.fine} role="status">
                <SpinnerGap className="spin" /> Checking repository…
              </p>
            ) : visibleCheck.error ? (
              <p role="alert" className={s.error}>
                {visibleCheck.error}
              </p>
            ) : visibleCheck.results.length === 0 ? (
              <p className={s.fine}>
                No applications to check yet. Add an application to verify its
                repository.
              </p>
            ) : (
              <>
                <p className={s.fine} role="status">
                  {visibleCheck.results.every(
                    (check) => check.status === "passed",
                  )
                    ? "Repository checks passed."
                    : "Repository checks finished. Some did not pass."}
                </p>
                <ul className={s.rows}>
                  {visibleCheck.results.map((check) => (
                    <li
                      key={check.applicationId}
                      data-state={
                        check.status === "passed" ? "connected" : "failed"
                      }
                    >
                      <div className={s.row}>
                        <span className={s.rowIcon}>
                          {check.status === "passed" ? <GitBranch /> : <Lock />}
                        </span>
                        <span className={s.rowText}>
                          <Link href={`/applications/${check.applicationId}`}>
                            <strong>{check.repository}</strong>
                          </Link>
                          {check.status !== "passed" && (
                            <small>
                              {check.result} After fixing access, open this
                              application and choose Check again.
                            </small>
                          )}
                        </span>
                        {check.status === "passed" ? (
                          <span className={s.ok}>
                            <Check weight="bold" /> Repository access passed.
                          </span>
                        ) : (
                          <span className={s.warn}>
                            <Warning weight="bold" /> Needs access
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <h3 className={s.groupTitle}>What the Hallvi App may do</h3>
      <ul className={s.rows}>
        <li>
          <div className={s.row}>
            <span className={s.rowIcon}>
              <GitBranch aria-hidden="true" />
            </span>
            <span className={s.rowText}>
              <strong>Read code</strong>
              <small>Only in the repositories you pick on GitHub.</small>
            </span>
          </div>
        </li>
        <li>
          <div className={s.row}>
            <span className={s.rowIcon}>
              <GitPullRequest aria-hidden="true" />
            </span>
            <span className={s.rowText}>
              <strong>Propose changes</strong>
              <small>
                On a branch of its own, as a pull request you review.
              </small>
            </span>
          </div>
        </li>
        <li>
          <div className={s.row}>
            <span className={s.rowIcon}>
              <ProhibitInset aria-hidden="true" />
            </span>
            <span className={s.rowText}>
              <strong>Never merges</strong>
              <small>
                And never writes to the branch you deploy from. GitHub grants
                the App write access; Hallvi uses less.
              </small>
            </span>
          </div>
        </li>
      </ul>
      <p className={s.fine}>
        The login stays on this computer.{" "}
        <button className={s.link} type="button" popoverTarget="github-storage">
          Storage &amp; privacy
        </button>
      </p>
      <aside
        popover="auto"
        id="github-storage"
        className={h.help}
        aria-labelledby="github-storage-title"
      >
        <header>
          <h2 id="github-storage-title">Storage &amp; privacy</h2>
          <button
            className={h.close}
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
          operating-system user running Hallvi. Your password never reaches
          Hallvi.
        </p>
        <code>{status.storagePath}</code>
        <p>
          Access is renewed automatically when needed for a GitHub request. If
          renewal expires or is rejected, sign in again. Hallvi does not ship a
          GitHub App private key or client secret.
        </p>
        <h3>Permissions</h3>
        <p>
          You choose on GitHub which repositories this App may reach. In those,
          GitHub grants it read and write access to contents and pull requests —
          a real write credential, not one GitHub restricts to pull requests.
        </p>
        <p>
          What Hallvi does with it is narrower. It reads a repository to work
          out how your application is deployed, and it writes only by putting a
          change on a branch of its own and opening a pull request. It never
          writes to the branch you deploy from and never merges; opening a pull
          request deploys nothing, and connecting on its own changes nothing.
          Each proposal follows the application’s permission mode, like any
          other change.
        </p>
        <h3>Disconnect</h3>
        <p>
          Disconnect removes Hallvi’s saved login and both tokens. Application
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
          description="Removes Hallvi’s saved connection. Application history stays; repository access must be checked again after reconnecting."
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
    </SettingsShell>
  );
}
