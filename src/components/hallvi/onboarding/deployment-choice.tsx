"use client";

// "How should this application deploy?" — asked during the first deployment,
// once there is a repository and a place to run it.
//
// Two answers and a branch. Choosing automatic is a standing authorization,
// so the card says what it authorizes before the owner gives it, and says how
// Hallvi notices a push: by looking, about every minute, from a computer
// GitHub cannot call. The choice is saved only after GitHub has answered for
// that branch, and the receipt reports that answer, not the preference.

import { useState } from "react";

import { GitBranch, Hand } from "@phosphor-icons/react";

import type { DeploymentStatus } from "@/server/deployment-automation";

import { lookEvery } from "../deployment-source";
import { Problem, Receipt, RequestCard } from "./pieces";
import type { PermissionMode } from "./types";

export type DeploymentChoiceMode = "automatic" | "manual";

export function DeploymentChoice({
  application,
  deployment,
  permission,
  onChoose,
}: {
  application: string;
  deployment: DeploymentStatus;
  permission: PermissionMode;
  /** Saves the choice on the controller; rejects with why it could not. */
  onChoose: (choice: {
    mode: DeploymentChoiceMode;
    branch: string;
  }) => Promise<void>;
}) {
  const [mode, setMode] = useState<DeploymentChoiceMode>("automatic");
  const [branch, setBranch] = useState(deployment.branch ?? "main");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const every = lookEvery(deployment.lookIntervalSeconds);
  const name = branch.trim() || "main";

  if (deployment.mode)
    return (
      <RequestCard
        asks="knows how to deploy it"
        state="done"
        label="How it deploys"
      >
        <Receipt
          title={
            deployment.mode === "automatic"
              ? `Deploys automatically when ${deployment.branch} changes`
              : `Deploys ${deployment.branch} only when you ask`
          }
        >
          <p className="hv-ob-fine">
            {deployment.mode === "automatic"
              ? deployment.watching
                ? `GitHub answered for ${deployment.branch}, and Hallvi looks again ${every}. Automatic deployments begin once the first release is verified.`
                : (deployment.checkError ??
                  `Hallvi has not heard from GitHub about ${deployment.branch} yet.`)
              : "Ask in this conversation, or press Deploy on the Deployment page."}{" "}
            Change it any time under Deployment.
          </p>
        </Receipt>
      </RequestCard>
    );

  return (
    <RequestCard
      asks="needs to know how to deploy it"
      state={busy ? "working" : "waiting"}
      label="How should this application deploy?"
    >
      <p className="hv-ob-said">How should {application} deploy?</p>
      <fieldset className="hv-ob-choices">
        <legend className="hv-ob-hidden">How it deploys</legend>
        <label>
          <input
            type="radio"
            name="hv-ob-deploys"
            checked={mode === "automatic"}
            onChange={() => setMode("automatic")}
          />
          <GitBranch aria-hidden="true" />
          <strong>Automatically when {name} changes</strong>
          <span>
            Push or merge to {name} and Hallvi deploys that commit, checks the
            application, and tells you here if it fails. Nothing to set up on
            GitHub.
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="hv-ob-deploys"
            checked={mode === "manual"}
            onChange={() => setMode("manual")}
          />
          <Hand aria-hidden="true" />
          <strong>Only when I ask</strong>
          <span>
            Nothing deploys until you ask Hallvi here or press Deploy on the
            Deployment page.
          </span>
        </label>
      </fieldset>

      {editing ? (
        <label className="hv-ob-field">
          Branch
          <input
            type="text"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoFocus
          />
        </label>
      ) : (
        <button
          type="button"
          className="hv-ob-quiet"
          onClick={() => setEditing(true)}
        >
          Use another branch
        </button>
      )}

      {mode === "automatic" && (
        <p className="hv-ob-fine">
          This authorizes Hallvi to deploy every future commit on {name} without
          asking you each time
          {permission === "always-ask"
            ? "; in Always ask it still asks before each command"
            : ""}
          . It notices a push by looking at GitHub {every} from this computer,
          so expect about a minute, not an instant. It deploys one commit at a
          time, keeps the application&apos;s data, and does not retry a commit
          that failed. Pause or change it any time under Deployment.
        </p>
      )}

      {error && (
        <Problem title="That was not saved">
          <p>{error}</p>
        </Problem>
      )}
      <button
        type="button"
        className="hv-ob-primary"
        disabled={busy || !branch.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onChoose({ mode, branch: name });
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Hallvi could not save that.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? `Checking ${name} on GitHub…`
          : mode === "automatic"
            ? `Deploy automatically from ${name}`
            : `Deploy ${name} when I ask`}
      </button>
    </RequestCard>
  );
}
