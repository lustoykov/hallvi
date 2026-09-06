"use client";

import { Check } from "@phosphor-icons/react";

import { PHASES } from "@/server/phase-one-spec";
import type { GateCheck, PhaseWorkspaceView } from "@/server/types";

const GROUPS = [
  { key: "plan", label: "Plan" },
  { key: "setup", label: "Setup · not live yet" },
  { key: "live", label: "Live" },
] as const;

/**
 * The nine launch phases in one strip under the top bar. Phases with a
 * workspace can be viewed: the current phase carries its check progress, a
 * completed phase is marked done and stays inspectable, and the viewed phase
 * is highlighted. Later phases are only named, with their deliverable on
 * hover; no future workspace exists yet.
 */
export function PhaseRail({
  checks,
  workspaces,
  viewedPhaseKey,
  busy,
  onSelectPhase,
}: {
  checks: GateCheck[];
  workspaces: PhaseWorkspaceView[];
  viewedPhaseKey: string | null;
  busy: boolean;
  onSelectPhase: (phaseKey: PhaseWorkspaceView["phaseKey"]) => void;
}) {
  const passed = checks.filter((check) => check.status === "passed").length;

  return (
    <section className="sg-phase-rail" aria-label="Application launch progress">
      {GROUPS.map((group) => (
        <div className="sg-phase-group" key={group.key}>
          <div className="sg-phase-group-label">{group.label}</div>
          <ol className="sg-phase-track">
            {PHASES.filter((phase) => phase.group === group.key).map(
              (phase) => {
                const workspace = workspaces.find(
                  (item) => item.phaseKey === phase.key,
                );
                if (!workspace)
                  return (
                    <li
                      className="sg-phase"
                      key={phase.number}
                      title={`Deliverable: ${phase.deliverable}`}
                    >
                      <span className="sg-phase-number">{phase.number}</span>
                      <span className="sg-phase-name">{phase.name}</span>
                    </li>
                  );
                const viewed = workspace.phaseKey === viewedPhaseKey;
                const completed = workspace.status === "completed";
                return (
                  <li
                    className={`sg-phase${workspace.current ? " active" : ""}${completed ? " completed" : ""}${viewed ? " viewed" : ""}`}
                    aria-current={workspace.current ? "step" : undefined}
                    key={phase.number}
                  >
                    <button
                      type="button"
                      className="sg-phase-button"
                      disabled={busy}
                      aria-pressed={viewed}
                      aria-label={`${completed ? "View completed" : "View"} phase ${phase.number}, ${phase.name}`}
                      onClick={() => onSelectPhase(workspace.phaseKey)}
                    >
                      <span className="sg-phase-number">
                        {completed ? (
                          <Check aria-hidden="true" weight="bold" />
                        ) : (
                          phase.number
                        )}
                      </span>
                      <span className="sg-phase-name">{phase.name}</span>
                      {workspace.current && (
                        <span className="sg-phase-meta">
                          <span
                            className="sg-phase-dots"
                            role="img"
                            aria-label={`${passed} of ${checks.length} checks complete`}
                          >
                            {checks.map((check) => (
                              <i className={check.status} key={check.key} />
                            ))}
                          </span>
                          <span className="sg-phase-deliverable">
                            {phase.deliverable}
                          </span>
                        </span>
                      )}
                      {completed && (
                        <span className="sg-phase-meta">
                          <span className="sg-phase-deliverable">
                            Completed
                          </span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              },
            )}
          </ol>
        </div>
      ))}
    </section>
  );
}
