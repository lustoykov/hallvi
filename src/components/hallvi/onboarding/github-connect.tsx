"use client";

// Opening a repository Hallvi could not read, as a turn in the conversation.
//
// An unreadable repository used to be a bare strip above the transcript that
// pointed at Settings, beside a welcome that still offered to read it. This is
// the same kind of moment as renting a server: Hallvi needs something from the
// owner, so it is drawn where they are, and it folds away once it is done.
//
// Three things are kept apart, because they fail apart: whether this release
// can sign in to GitHub at all, whether an account is signed in, and whether
// that account's choice of repositories includes this one. A lookup that
// answers "not found" proves none of them — GitHub says the same for a private
// repository, a typo and a deleted one.
//
// Finishing here never starts a turn. Reading the repository stays the owner's
// own action.

import { ArrowSquareOut, SpinnerGap } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  GithubLoginAttempt,
  GithubSetupStatus,
} from "@/server/github-setup";
import type { OperatorView } from "@/server/types";

import {
  Away,
  CheckList,
  CopyLine,
  Countdown,
  Problem,
  Receipt,
  RequestCard,
} from "./pieces";
import type { Check } from "./types";

export type RepositoryAccess = NonNullable<OperatorView["repository"]>;

async function request<T>(url: string, method = "GET"): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : "{}",
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error ?? "Could not reach Hallvi. Try again.");
  return data;
}

const pending = (attempt: GithubLoginAttempt | null) =>
  attempt?.status === "waiting" || attempt?.status === "starting";

/** What ended a sign-in, in the owner's terms. Nothing was ever saved. */
function ended(attempt: GithubLoginAttempt | null) {
  if (!attempt || pending(attempt) || attempt.status === "connected")
    return null;
  return {
    cancelled: {
      title: "Sign-in cancelled",
      body: "You stopped it. Nothing was saved and nothing changed on GitHub.",
    },
    denied: {
      title: "GitHub says access was declined",
      body: "The request was refused on GitHub’s page. Nothing was saved. If that wasn’t you, start again and choose Authorize.",
    },
    expired: {
      title: "The code ran out",
      body: "Codes last 15 minutes. Nothing was saved. A new code takes one click.",
    },
    failed: {
      title: "The sign-in didn’t finish",
      body: attempt.message ?? "GitHub ended the sign-in. Nothing was saved.",
    },
  }[attempt.status as "cancelled" | "denied" | "expired" | "failed"];
}

export function GithubConnect({
  repository,
  access,
  checking = false,
  onCheck,
  onConnected,
  onClose,
  plain = false,
}: {
  /** Outside a conversation, where nobody asked: no "Hallvi asks" line. */
  plain?: boolean;
  /**
   * The repository this is about, as "owner/name". Settings has none: there
   * the card is about the account alone, and says only what that establishes.
   */
  repository?: string;
  access?: RepositoryAccess;
  checking?: boolean;
  /** Checks this application's repository again with the current login. */
  onCheck?: () => void;
  /** A login was just saved, so whatever drew this card is out of date. */
  onConnected?: () => void;
  /** Present while the card can be put away without finishing. */
  onClose?: () => void;
}) {
  const [status, setStatus] = useState<GithubSetupStatus | null>(null);
  const [attempt, setAttempt] = useState<GithubLoginAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The owner has been to GitHub's repository page from here. */
  const [chose, setChose] = useState(false);
  const alive = useRef(true);
  const check = useRef(onCheck);
  const connected = useRef(onConnected);
  useEffect(() => {
    check.current = onCheck;
    connected.current = onConnected;
  }, [onCheck, onConnected]);

  const load = useCallback(async () => {
    const fresh = await request<GithubSetupStatus>("/api/github/setup");
    if (!alive.current) return null;
    setStatus(fresh);
    return fresh;
  }, []);

  useEffect(() => {
    alive.current = true;
    // A sign-in begun before a reload is still waiting on the controller, so
    // it is picked up. One that already ended was said where it ended.
    void load()
      .then(
        (fresh) =>
          fresh && setAttempt(pending(fresh.attempt) ? fresh.attempt : null),
      )
      .catch((caught: Error) => setError(caught.message));
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!pending(attempt)) return;
    const current = attempt!;
    const timer = window.setTimeout(async () => {
      try {
        const next = await request<GithubLoginAttempt>(
          `/api/github/setup/login/${current.id}`,
          "POST",
        );
        if (!alive.current) return;
        if (next.status === "connected") {
          await load();
          // Signing in is the owner asking whether this now works.
          check.current?.();
          connected.current?.();
        }
        setAttempt(next);
      } catch (caught) {
        if (!alive.current) return;
        setError(caught instanceof Error ? caught.message : "Try again.");
        setAttempt({ ...current, status: "failed" });
      }
    }, current.intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [attempt, load]);

  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const connection =
    status?.connection && !status.issue ? status.connection : null;
  const account = connection?.account.login;

  const close = onClose && !pending(attempt) && (
    <button type="button" className="hv-ob-quiet" onClick={onClose}>
      Not now
    </button>
  );
  const failure = ended(attempt);
  const known = access && (
    <details className="hv-ob-more">
      <summary>What I actually know</summary>
      <p>{access.result}</p>
      {!connection && access.status !== "not-yet" && (
        <p>
          GitHub gives the same answer for a private repository, a mistyped
          address and a deleted repository, so this doesn’t prove it is private.
        </p>
      )}
    </details>
  );
  const again = onCheck && (
    <button
      type="button"
      className="hv-ob-quiet"
      disabled={checking}
      onClick={onCheck}
    >
      {checking ? "Checking…" : "Check again"}
    </button>
  );
  /**
   * The sign-in itself: the same code, the same waiting and the same three
   * ways it can end, whether it was asked for beside a repository or in
   * Settings. Only the sentence above it knows about a repository.
   */
  const signIn = (
    <>
      {pending(attempt) && attempt ? (
        <>
          <p>Enter this code on GitHub, then approve Hallvi:</p>
          {attempt.userCode ? (
            <div className="hv-ob-code">
              <CopyLine value={attempt.userCode} label="Copy code" />
            </div>
          ) : (
            <p>
              <SpinnerGap className="spin" aria-hidden="true" /> Getting a code…
            </p>
          )}
          <Away href={attempt.verificationUrl}>Open GitHub</Away>
          <p className="hv-ob-fine" role="status">
            <SpinnerGap className="spin" aria-hidden="true" /> Waiting for you
            to approve on GitHub. Nothing else is happening.{" "}
            {attempt.expiresAt && <Countdown until={attempt.expiresAt} />}
          </p>
          <div className="hv-ob-row">
            <button
              type="button"
              className="hv-ob-quiet"
              disabled={busy}
              onClick={() =>
                void act(async () =>
                  setAttempt(
                    await request<GithubLoginAttempt>(
                      `/api/github/setup/login/${attempt.id}`,
                      "DELETE",
                    ),
                  ),
                )
              }
            >
              Cancel sign-in
            </button>
          </div>
        </>
      ) : (
        <>
          {failure ? (
            <Problem title={failure.title}>
              <p>{failure.body}</p>
            </Problem>
          ) : (
            <>
              <p>
                {repository
                  ? `If ${repository} is private, signing in lets me read it.`
                  : "A GitHub account lets Hallvi read private repositories."}{" "}
                You approve Hallvi on GitHub’s own page with a short code; your
                password never reaches Hallvi.
              </p>
              <p className="hv-ob-fine">
                Choose which repositories the App can access on GitHub. The
                published Hallvi App requests read and write access to code and
                pull requests. Connecting only reads. Later, with your
                permission, Hallvi can propose a deployment change by putting
                it on a branch of its own and opening a pull request — never a
                write to the branch you deploy from, and never a merge.
                Reading public repositories needs no connection.
              </p>
            </>
          )}
          {repository && known}
          <div className="hv-ob-row">
            <button
              type="button"
              className="hv-ob-primary"
              disabled={busy}
              onClick={() =>
                void act(async () =>
                  setAttempt(
                    await request<GithubLoginAttempt>(
                      "/api/github/setup/login",
                      "POST",
                    ),
                  ),
                )
              }
            >
              {failure ? "Get a new code" : "Connect GitHub"}
            </button>
            {again}
            {close}
          </div>
        </>
      )}
      {error && (
        <Problem title="That didn’t work">
          <p>{error}</p>
        </Problem>
      )}
    </>
  );

  // Settings: the account, and only what the account establishes. Whether a
  // particular repository can be read is that application's own question.
  if (!repository || !access) {
    if (!status)
      return (
        <RequestCard
          plain={plain}
          asks="is reading its GitHub connection"
          state="working"
          label="GitHub account"
        >
          {error ? (
            <Problem title="Hallvi didn’t answer">
              <p>{error}</p>
              <button
                type="button"
                className="hv-ob-quiet"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const fresh = await load();
                    if (fresh)
                      setAttempt(pending(fresh.attempt) ? fresh.attempt : null);
                  })
                }
              >
                Try again
              </button>
            </Problem>
          ) : (
            <p>
              <SpinnerGap className="spin" aria-hidden="true" /> Looking at the
              GitHub connection…
            </p>
          )}
        </RequestCard>
      );
    if (connection)
      return (
        <Receipt plain={plain} title={`GitHub login saved for ${account}`}>
          <p>
            For the repositories you picked on GitHub. The published Hallvi App
            requests read and write access to code and pull requests: Hallvi
            reads them, and writes only by opening a branch of its own and a
            pull request you review. Whether a particular application can be
            read is checked in its own conversation.
          </p>
          <p>
            <a
              className="hv-ob-quiet"
              href={connection.accessUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Choose repositories on GitHub
              <ArrowSquareOut weight="bold" aria-hidden="true" />
            </a>
          </p>
        </Receipt>
      );
    if (!status.registration)
      return (
        <RequestCard
          plain={plain}
          asks="can’t sign in to GitHub in this release"
          state="done"
          label="GitHub account"
        >
          <p>
            Public repositories work without any GitHub account. Private ones
            need a sign-in, and this release was built without it.
          </p>
          <details className="hv-ob-more">
            <summary>How this gets fixed</summary>
            <p>
              Hallvi signs in to GitHub as one published app whose public
              identifier ships inside each release; this build has none. Install
              a release that includes GitHub sign-in over this one. Applications
              and history are kept. You never need to register a GitHub App,
              paste a token or edit environment files.
            </p>
          </details>
        </RequestCard>
      );
    return (
      <RequestCard
        plain={plain}
        asks="can connect a GitHub account"
        state={
          pending(attempt) ? "working" : ended(attempt) ? "failed" : "waiting"
        }
        label="GitHub account"
      >
        {signIn}
      </RequestCard>
    );
  }

  if (access.status === "passed")
    return (
      <Receipt
        title={
          account
            ? `GitHub connected as ${account} · can read ${repository}`
            : `Can read ${repository}`
        }
      >
        <p>
          The access check only read from GitHub. Nothing has started: reading
          the repository is still yours to ask for.
        </p>
      </Receipt>
    );

  if (!status)
    return (
      <RequestCard
        asks={`couldn’t open ${repository}`}
        state="waiting"
        label="Repository access"
      >
        {error ? (
          <Problem title="Hallvi didn’t answer">
            <p>{error}</p>
            <button
              type="button"
              className="hv-ob-quiet"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const fresh = await load();
                  if (fresh)
                    setAttempt(pending(fresh.attempt) ? fresh.attempt : null);
                })
              }
            >
              Try again
            </button>
          </Problem>
        ) : (
          <p>
            <SpinnerGap className="spin" aria-hidden="true" /> Looking at the
            GitHub connection…
          </p>
        )}
      </RequestCard>
    );

  // GitHub did not answer, or nobody has asked yet: that says nothing about
  // the repository, so it is not dressed as an access problem.
  const unchecked = access.status === "not-yet";

  if (!connection && !status.registration)
    return (
      <RequestCard
        asks={`couldn’t open ${repository}`}
        state="done"
        label="Repository access"
      >
        <p>
          <strong>This Hallvi release can’t sign in to GitHub.</strong> That’s a
          gap in the release, not something you missed. Public repositories work
          without any GitHub account.
        </p>
        <details className="hv-ob-more">
          <summary>How this gets fixed</summary>
          <p>
            Hallvi signs in to GitHub as one published app whose public
            identifier ships inside each release; this build has none. Install a
            release that includes GitHub sign-in over this one. Applications and
            history are kept, and Connect GitHub appears here. You never need to
            register a GitHub App, paste a token or edit environment files.
          </p>
        </details>
        {known}
        <div className="hv-ob-row">
          {again}
          {close}
        </div>
      </RequestCard>
    );

  // Nobody has an answer yet, so the one useful thing is to ask. Grey, because
  // nothing is known to be wrong.
  if (unchecked && !pending(attempt) && !ended(attempt))
    return (
      <RequestCard
        asks={`hasn’t been able to check ${repository} yet`}
        state={checking ? "working" : "done"}
        label="Repository access"
      >
        <p>
          That says nothing about the repository or your access. Checking only
          reads from GitHub.
        </p>
        {known}
        <div className="hv-ob-row">
          {/* A text action: nothing is known to be wrong, so this does not
              compete with a request that is actually waiting. */}
          <button
            type="button"
            className="hv-ob-next"
            disabled={checking}
            onClick={onCheck}
          >
            {checking ? "Checking…" : "Check repository"}
          </button>
          {close}
        </div>
      </RequestCard>
    );

  if (!connection)
    return (
      <RequestCard
        asks={`needs GitHub to open ${repository}`}
        state={
          pending(attempt)
            ? "working"
            : // Stopping it yourself is not something that went wrong.
              failure && attempt?.status !== "cancelled"
              ? "failed"
              : "waiting"
        }
        label="Connect GitHub"
      >
        {signIn}
      </RequestCard>
    );

  // A saved account does not prove current access to this repository.
  const checks: Check[] = [
    { id: "account", label: `Login saved for ${account}`, state: "pending" },
    {
      id: "repository",
      label: `${repository} is among the repositories Hallvi may read`,
      state: checking ? "running" : unchecked ? "pending" : "failed",
    },
  ];
  return (
    <RequestCard
      asks={`is signed in, but can’t open ${repository} yet`}
      state={checking ? "working" : "waiting"}
      label="Repository access"
    >
      <CheckList checks={checks} />
      <p>
        {unchecked
          ? "It hasn’t been checked with this sign-in yet."
          : `Hallvi has a saved login, but could not read ${repository}. Check the repository address and the App’s repository access on GitHub.`}
      </p>
      <p className="hv-ob-fine">
        In an organization you don’t own, GitHub sends its owners a request
        instead; access starts when they approve.
      </p>
      {known}
      <div className="hv-ob-row">
        {unchecked || chose ? (
          <button
            type="button"
            className="hv-ob-primary"
            disabled={checking}
            onClick={onCheck}
          >
            {checking ? "Checking…" : "Check access"}
          </button>
        ) : null}
        {/* One blue action at a time: GitHub first, the check after. */}
        <a
          className={unchecked || chose ? "hv-ob-quiet" : "hv-ob-away"}
          href={connection.accessUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={() => setChose(true)}
        >
          Choose repositories on GitHub
          <ArrowSquareOut weight="bold" aria-hidden="true" />
        </a>
        {!unchecked && !chose && again}
        {close}
      </div>
    </RequestCard>
  );
}
