"use client";

import { PHASES } from "@/server/phase-one-spec";
import type { GateCheck } from "@/server/types";

const GROUPS = [
  { key: "plan", label: "Plan" },
  { key: "setup", label: "Setup · not live yet" },
  { key: "live", label: "Live" },
] as const;

/**
 * The nine launch phases in one strip under the top bar. The current phase
 * carries its check progress and deliverable; later phases are only named,
 * with their deliverable available on hover.
 */
export function PhaseRail({ checks }: { checks: GateCheck[] }) {
  const passed = checks.filter((check) => check.status === "passed").length;

  return (
    <section className="sg-phase-rail" aria-label="Application launch progress">
      {GROUPS.map((group) => (
        <div className="sg-phase-group" key={group.key}>
          <div className="sg-phase-group-label">{group.label}</div>
          <ol>
            {PHASES.filter((phase) => phase.group === group.key).map((phase) =>
              phase.number === 1 ? (
                <li
                  className="sg-phase active"
                  aria-current="step"
                  key={phase.number}
                >
                  <span className="sg-phase-number">{phase.number}</span>
                  <span className="sg-phase-name">{phase.name}</span>
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
                </li>
              ) : (
                <li
                  className="sg-phase"
                  key={phase.number}
                  title={`Deliverable: ${phase.deliverable}`}
                >
                  <span className="sg-phase-number">{phase.number}</span>
                  <span className="sg-phase-name">{phase.name}</span>
                </li>
              ),
            )}
          </ol>
        </div>
      ))}
    </section>
  );
}
