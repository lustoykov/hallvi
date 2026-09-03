"use client";

import { PHASES } from "@/server/phase-one-spec";
import type { GateCheck } from "@/server/types";

export function PhaseRail({ checks }: { checks: GateCheck[] }) {
  const passed = checks.filter((check) => check.status === "passed").length;

  return (
    <section className="sg-phase-rail" aria-label="Application launch progress">
      <div className="sg-phase-list">
        {PHASES.map((phase) => (
          <div className={`sg-phase ${phase.number === 1 ? "active" : "future"}`} key={phase.number}>
            <span className="sg-phase-number">{phase.number}</span>
            <span className="sg-phase-copy">
              <strong>{phase.name}</strong>
              {phase.number === 1 && <small>{phase.deliverable}</small>}
            </span>
            {phase.number === 1 && (
              <span className="sg-phase-dots" aria-label={`${passed} of ${checks.length} checks complete`}>
                {checks.map((check) => (
                  <i className={check.status} key={check.key} />
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="sg-phase-groups" aria-hidden="true">
        <span>Plan</span>
        <span>Setup · not live yet</span>
        <span>Live</span>
      </div>
    </section>
  );
}
