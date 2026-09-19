"use client";

import { ArrowLeft, Check, SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import type {
  WorkspaceIsolation,
  WorkspaceSettingStatus,
} from "@/server/workspace-isolation";
import type { SetupReturn } from "@/server/setup-return";
import { HallviMark } from "./hallvi-mark";
import { SettingsNav } from "./settings-nav";
import s from "./pi-setup-screen.module.css";

const choices: Array<{
  value: WorkspaceIsolation;
  title: string;
  body: string;
}> = [
  {
    value: "direct",
    title: "On this computer",
    body: "A scratch folder holding the repository copy. Pi’s commands run as your user account. Hallvi keeps its own credentials out of their environment, and Pi’s file tools stay inside the folder. These are precautions, not a sandbox.",
  },
  {
    value: "docker",
    title: "In Docker",
    body: "An isolated container with no network and none of your files. Needs Docker running on this computer. Choose it for software you don’t trust.",
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
  const [selected, setSelected] = useState<WorkspaceIsolation>(
    initialStatus.isolation ?? "direct",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = selected !== status.isolation;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/setup/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isolation: selected }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data)
        throw new Error(data?.error ?? "Could not reach Hallvi. Try again.");
      setStatus(data);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={`hv-setup-shell ${s.root}`}>
      <header className="hv-setup-topbar">
        <Link className="hv-setup-brand" href="/applications">
          <HallviMark size={28} onDark />
          <span>Hallvi</span>
        </Link>
        <Link
          className="hv-setup-back"
          href={returnTo?.href ?? "/applications"}
        >
          <ArrowLeft /> {returnTo?.label ?? "All applications"}
        </Link>
      </header>
      <div className={s.page}>
        <SettingsNav current="workspace" returnTo={returnTo} />
        <div className={s.heading}>
          <h1>Workspace</h1>
          <p>Where Pi works on its copy of your repository.</p>
        </div>
        <section className={s.card}>
          <fieldset className={`${s.section} ${s.choices}`}>
            <legend className={s.visuallyHidden}>Where Pi works</legend>
            {choices.map((choice) => (
              <label key={choice.value} className={s.choice}>
                <input
                  type="radio"
                  name="isolation"
                  value={choice.value}
                  checked={selected === choice.value}
                  disabled={saving}
                  onChange={() => setSelected(choice.value)}
                />
                <span>
                  <strong>
                    {choice.title}
                    {choice.value === "direct" && <em> Default</em>}
                  </strong>
                  <span className={s.hint}>{choice.body}</span>
                  {choice.value === "docker" &&
                    (status.dockerProblem ? (
                      <span className={s.hint}>
                        Docker isn’t available now. {status.dockerProblem}
                      </span>
                    ) : (
                      <span className={s.success}>
                        <Check /> Docker is running
                      </span>
                    ))}
                </span>
              </label>
            ))}
            {status.problem && !changed && (
              <p className={s.error} role="alert">
                {status.isolation === "docker"
                  ? "Pi can’t use its workspace until Docker is running. It won’t switch to this computer by itself."
                  : status.problem}
              </p>
            )}
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
          </fieldset>
          <footer className={s.footer}>
            <span className={s.hint}>
              Applies from the next message. Application servers still run
              Docker Compose.
            </span>
            <button
              className={s.primary}
              type="button"
              disabled={!changed || saving}
              onClick={() => void save()}
            >
              {saving ? <SpinnerGap className="spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
