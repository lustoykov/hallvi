"use client";

import {
  Check,
  Cube,
  Desktop,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";

import type {
  WorkspaceIsolation,
  WorkspaceSettingStatus,
} from "@/server/workspace-isolation";
import type { SetupReturn } from "@/server/setup-return";
import { SettingsShell, useToast } from "./settings-shell";
import s from "./settings.module.css";

const choices: Array<{
  value: WorkspaceIsolation;
  title: string;
  line: string;
  icon: React.ReactNode;
}> = [
  {
    value: "direct",
    title: "On this computer",
    line: "A scratch folder with the repository copy. Commands run as your user.",
    icon: <Desktop aria-hidden="true" />,
  },
  {
    value: "docker",
    title: "In Docker",
    line: "An isolated container: no network, none of your files.",
    icon: <Cube aria-hidden="true" />,
  },
];

/** One choice: where Pi works on its copy of the repository. */
export function WorkspaceSetupScreen({
  initialStatus,
  returnTo,
}: {
  initialStatus: WorkspaceSettingStatus;
  returnTo?: SetupReturn;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState<WorkspaceIsolation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const { show, toast } = useToast();
  const current = status.isolation ?? "direct";

  // A choice applies when it is made, like the model: there is nothing else on
  // this page to save it with.
  async function choose(isolation: WorkspaceIsolation) {
    if (saving || isolation === status.isolation) return;
    setSaving(isolation);
    setError(null);
    try {
      const response = await fetch("/api/setup/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isolation }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data)
        throw new Error(data?.error ?? "Could not reach Hallvi. Try again.");
      setStatus(data);
      show("Saved · applies from the next message");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <SettingsShell
      current="workspace"
      title="Workspace"
      lead="Where Pi works on its copy of your code."
      returnTo={returnTo}
    >
      <section className={s.hero} aria-label="Where Pi works now">
        <div>
          <span className={s.eyebrow}>Pi works</span>
          <h3>{current === "docker" ? "In Docker" : "On this computer"}</h3>
          <p>
            {current === "docker"
              ? "Isolated. For code you don’t trust."
              : "Fast and simple. Precautions, not a sandbox."}
          </p>
          {status.problem && (
            <p className={s.problem} role="alert">
              <Warning aria-hidden="true" />
              {status.isolation === "docker"
                ? "Pi can’t use its workspace until Docker is running. It won’t switch to this computer by itself."
                : status.problem}
            </p>
          )}
        </div>
      </section>

      <ul className={s.rows} role="radiogroup" aria-label="Where Pi works">
        {choices.map((choice) => {
          const unavailable =
            choice.value === "docker" &&
            Boolean(status.dockerProblem) &&
            current !== "docker";
          return (
            <li key={choice.value}>
              <button
                type="button"
                role="radio"
                className={`${s.row} ${s.pick}`}
                aria-checked={current === choice.value}
                aria-disabled={unavailable || Boolean(saving)}
                onClick={() => !unavailable && void choose(choice.value)}
              >
                <span className={s.check}>
                  {saving === choice.value ? (
                    <SpinnerGap className="spin" aria-hidden="true" />
                  ) : (
                    current === choice.value && <Check weight="bold" />
                  )}
                </span>
                <span className={s.rowIcon}>{choice.icon}</span>
                <span className={s.rowText}>
                  <strong>{choice.title}</strong>
                  <small>{choice.line}</small>
                </span>
                {choice.value === "direct" ? (
                  <span className={s.muted}>Default</span>
                ) : status.dockerProblem ? (
                  <span className={s.warn}>
                    <Warning weight="bold" aria-hidden="true" /> Docker isn’t
                    running
                  </span>
                ) : (
                  <span className={s.ok}>
                    <Check weight="bold" aria-hidden="true" /> Docker is running
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {status.dockerProblem && (
        <p className={s.fine}>
          Docker isn’t available now. {status.dockerProblem}
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`${s.link} ${s.more}`}
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        {more ? "Less" : "What each one protects"}
      </button>
      {more && (
        <div className={s.explain}>
          <p>
            <b>On this computer.</b> Pi’s commands run as your user account.
            Hallvi keeps its own credentials out of their environment, and Pi’s
            file tools stay inside the folder. A command can still reach what
            your account can.
          </p>
          <p>
            <b>In Docker.</b> The container has no network and sees only the
            repository copy. Choose it for software you don’t trust. Application
            servers still run with Docker Compose either way.
          </p>
        </div>
      )}
      {toast}
    </SettingsShell>
  );
}
