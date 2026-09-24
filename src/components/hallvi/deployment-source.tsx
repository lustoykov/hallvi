"use client";

// How this application deploys: the choice, the branch, and what the branch
// watch has seen and done.
//
// The page below states what is running, from release records. This band is
// the other half: where new releases come from. It never says automatic
// deployment is on because the owner chose it — only a recent answer from
// GitHub says the watch is watching, and the band says when that was.
//
// Everything here changes the same record Pi reads and changes through
// deployment_settings, by asking the worker that keeps it.

import { useState } from "react";

import type {
  DeploymentAttempt,
  DeploymentStatus,
} from "@/server/deployment-automation";

import { LocalTime } from "./local-time";
import { Board, Figure, None, Strip, Tag, ago, type Tone } from "./register";

import "./releases-panel.css";
import "./deployment-source.css";

const OUTCOME: Record<
  DeploymentAttempt["outcome"],
  { word: string; tone: Tone }
> = {
  running: { word: "deploying", tone: "working" },
  deployed: { word: "deployed", tone: "good" },
  failed: { word: "failed", tone: "bad" },
  interrupted: { word: "interrupted", tone: "warn" },
};

/** "about every minute": the look is a poll, and the page says so. */
export function lookEvery(seconds: number) {
  return seconds <= 90
    ? "about every minute"
    : `about every ${Math.round(seconds / 60)} minutes`;
}

export function DeploymentSource({
  applicationId,
  repositoryUrl,
  deployment,
  now,
  onChanged,
  onOpenConversation,
}: {
  applicationId: string;
  repositoryUrl: string;
  deployment: DeploymentStatus;
  now: number;
  /** The record changed: read the view again. */
  onChanged?: () => void;
  onOpenConversation?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Automatic unless the owner chose otherwise, as the first-deployment card
  // offers it. Preselected, never saved on the owner's behalf: it is a
  // standing authorization, so it takes their Save.
  const [mode, setMode] = useState(deployment.mode ?? "automatic");
  const [branch, setBranch] = useState(deployment.branch ?? "main");

  async function ask(name: string, body: Record<string, unknown>) {
    setBusy(name);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/deployment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const value = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(value?.error ?? "Hallvi could not do that.");
      onChanged?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Hallvi could not do that.",
      );
    } finally {
      setBusy(null);
    }
  }

  const commitLink = (commit: string) => (
    <a
      className="hv-rg-mono"
      href={`${repositoryUrl}/commit/${commit}`}
      target="_blank"
      rel="noreferrer"
    >
      {commit.slice(0, 7)}
    </a>
  );

  const { latest, attempts } = deployment;
  const last = attempts[0] ?? null;
  const running = last?.outcome === "running";
  const automatic = deployment.mode === "automatic";
  const every = lookEvery(deployment.lookIntervalSeconds);
  const behind = latest !== null && deployment.upToDate === false;
  // A failure that still matters: the commit it was for is still the newest,
  // and it is still not what runs.
  const unresolved =
    last !== null &&
    (last.outcome === "failed" || last.outcome === "interrupted") &&
    latest?.commit === last.commit &&
    behind;

  // A value, not a component: a component made during render would be a new
  // one every time, and the branch field would lose focus at each keystroke.
  const settings = (
    <details className="ds-settings">
      <summary>Deployment settings</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask("save", {
            action: "choose",
            choice: { mode, branch: branch.trim() },
          });
        }}
      >
        <fieldset>
          <legend>When to deploy</legend>
          <label>
            <input
              type="radio"
              name="ds-mode"
              checked={mode === "automatic"}
              onChange={() => setMode("automatic")}
            />
            Automatically when the branch changes
          </label>
          <label>
            <input
              type="radio"
              name="ds-mode"
              checked={mode === "manual"}
              onChange={() => setMode("manual")}
            />
            Only when I ask
          </label>
        </fieldset>
        <label className="ds-branch">
          Branch
          <input
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            placeholder="main"
            spellCheck={false}
            autoCapitalize="off"
          />
        </label>
        <p className="ds-fine">
          Automatic means every commit that reaches this branch is deployed
          without asking you first. Hallvi looks at GitHub {every} from this
          computer, deploys one commit at a time, checks the application
          afterwards and never retries a failed commit by itself.
        </p>
        <button
          type="submit"
          className="rp-open is-ask"
          disabled={busy !== null || !branch.trim()}
        >
          {busy === "save" ? "Checking the branch…" : "Save"}
        </button>
      </form>
    </details>
  );

  if (!deployment.mode)
    return (
      <section className="hv-rg-sheet ds" aria-label="How it deploys">
        <div className="hv-rg-board-head">
          <h2>How it deploys</h2>
        </div>
        <Strip>
          <Figure
            label="Deploys"
            value="Only when you ask"
            note="Hallvi can also deploy by itself whenever a branch changes on GitHub."
          >
            {settings}
          </Figure>
        </Strip>
        {error && <p className="ds-error">{error}</p>}
      </section>
    );

  return (
    <section className="hv-rg-sheet ds" aria-label="How it deploys">
      <div className="hv-rg-board-head">
        <h2>How it deploys</h2>
      </div>
      <Strip>
        <Figure
          label="Deploys"
          value={
            !automatic
              ? "Only when you ask"
              : deployment.paused
                ? "Paused"
                : "Automatically"
          }
          tone={
            automatic && !deployment.paused && deployment.watching
              ? "good"
              : "plain"
          }
          note={
            automatic
              ? deployment.paused
                ? `Pushes to ${deployment.branch} are noticed and wait here.`
                : deployment.deployed
                  ? `When ${deployment.branch} changes on GitHub.`
                  : `Starts once a first release of ${deployment.branch} is verified.`
              : `From ${deployment.branch}, when you ask Hallvi or press Deploy.`
          }
        >
          {automatic && (
            <button
              type="button"
              className="rp-open is-ask"
              disabled={busy !== null}
              onClick={() =>
                void ask("pause", {
                  action: "choose",
                  choice: { paused: !deployment.paused },
                })
              }
            >
              {deployment.paused ? "Resume" : "Pause"}
            </button>
          )}
        </Figure>

        <Figure
          label={`Latest on ${deployment.branch}`}
          value={latest ? commitLink(latest.commit) : "Not read yet"}
          tone={deployment.checkError ? "warn" : "plain"}
          note={
            deployment.checkError ? (
              <>
                {deployment.checkError}
                {deployment.checkedAt && (
                  <> GitHub last answered {ago(deployment.checkedAt, now)}.</>
                )}
              </>
            ) : latest ? (
              <>
                {latest.title || "No commit message"}
                <br />
                {deployment.upToDate
                  ? "This is what is running."
                  : deployment.deployed
                    ? "Not deployed yet."
                    : "Nothing is deployed yet."}{" "}
                Hallvi looks {every}
                {deployment.checkedAt
                  ? `; last look ${ago(deployment.checkedAt, now)}.`
                  : "."}
              </>
            ) : (
              `Hallvi looks at GitHub ${every}.`
            )
          }
        >
          {behind && !running && !unresolved && (
            <button
              type="button"
              className="rp-open"
              disabled={busy !== null}
              onClick={() => void ask("deploy", { action: "deploy" })}
            >
              {busy === "deploy" ? "Starting…" : "Deploy latest"}
            </button>
          )}
        </Figure>

        <Figure
          label="Last deployment started here"
          value={
            last ? (
              <>
                {commitLink(last.commit)}{" "}
                <Tag tone={OUTCOME[last.outcome].tone}>
                  {OUTCOME[last.outcome].word}
                </Tag>
              </>
            ) : (
              "None yet"
            )
          }
          tone={unresolved ? OUTCOME[last!.outcome].tone : "plain"}
          note={
            deployment.blocked ? (
              deployment.blocked
            ) : last ? (
              <>
                {last.trigger === "push"
                  ? "After a push"
                  : "You pressed Deploy"}{" "}
                · {ago(last.finishedAt ?? last.startedAt, now)}
                {last.detail && (
                  <>
                    <br />
                    {last.detail}
                  </>
                )}
              </>
            ) : (
              "Deployments the branch watch or the Deploy button start appear here."
            )
          }
        >
          {running && onOpenConversation ? (
            <button
              type="button"
              className="rp-open is-ask"
              onClick={onOpenConversation}
            >
              Follow in the conversation
            </button>
          ) : unresolved ? (
            <button
              type="button"
              className="rp-open"
              disabled={busy !== null}
              onClick={() => void ask("deploy", { action: "deploy" })}
            >
              {busy === "deploy" ? "Starting…" : "Retry"}
            </button>
          ) : null}
        </Figure>
      </Strip>
      {error && <p className="ds-error">{error}</p>}
      {settings}
      {attempts.length > 0 && (
        <Board
          title="Started by Hallvi"
          note="Each commit is attempted once. A release is only called deployed after its checks passed."
        >
          <ul className="ds-attempts">
            {attempts.slice(0, 8).map((attempt) => (
              <li key={attempt.id}>
                {commitLink(attempt.commit)}
                <span className="ds-title">
                  {attempt.title || <None>no commit message</None>}
                  {attempt.detail && <small>{attempt.detail}</small>}
                </span>
                <span className="ds-when">
                  {attempt.trigger === "push" ? "push" : "button"} ·{" "}
                  <LocalTime value={attempt.startedAt} variant="compact" />
                </span>
                <Tag tone={OUTCOME[attempt.outcome].tone}>
                  {OUTCOME[attempt.outcome].word}
                </Tag>
              </li>
            ))}
          </ul>
        </Board>
      )}
    </section>
  );
}
