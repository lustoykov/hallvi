// PROTOTYPE — the current-step description now lives in production
// (`../current-step`); this file keeps the prototype-only helpers: the demo
// signal keyed on the fixture's `qa` owner and a version history derived
// from the phase's Activity until the history read route replaces it.
import type {
  ActivityEvent,
  ApplicationRecord,
  OperatorView,
} from "@/server/types";

import {
  describeCurrentStep as describe,
  PHASE_PURPOSE,
  type CurrentStep,
  type Stage,
  type StepAction,
} from "../current-step";

export { PHASE_PURPOSE };
export type { CurrentStep, Stage, StepAction };

export function isDemoRepository(application: ApplicationRecord | null) {
  // The QA fixture's repositories live under a synthetic `qa` owner. The
  // production shell receives an explicit signal from the server page.
  return application?.repositoryOwner === "qa";
}

export function describeCurrentStep(view: OperatorView): CurrentStep {
  return describe(view, { demo: isDemoRepository(view.application) });
}

export interface ContractVersion {
  version: number;
  commitSha: string | null;
  when: string;
  why: string;
  current: boolean;
}

/**
 * Saved contract versions as far as the viewed phase's Activity records them.
 * Production reads `/api/applications/:id/contracts` instead; this derivation
 * only proves the presentation.
 */
export function contractVersions(view: OperatorView): ContractVersion[] {
  const current = view.contract;
  if (!current) return [];
  const versions = new Map<number, ContractVersion>();
  const events = [...view.activity].reverse();
  const shaOf = (event: ActivityEvent) =>
    /\b([0-9a-f]{8})\b/.exec(event.detail)?.[1] ?? null;
  for (const event of events) {
    if (event.kind === "contract-established") {
      const version = Number(/v(\d+)/.exec(event.detail)?.[1] ?? 1);
      versions.set(version, {
        version,
        commitSha: shaOf(event),
        when: event.createdAt,
        why: "Proposed from the inspected repository.",
        current: false,
      });
    } else if (event.kind === "contract-revised") {
      const match = /v(\d+) → v(\d+)/.exec(event.detail);
      const version = Number(match?.[2] ?? 0);
      const why = event.detail.replace(/^v\d+ → v\d+ at [0-9a-f]+ · /, "");
      versions.set(version, {
        version,
        commitSha: shaOf(event),
        when: event.createdAt,
        why,
        current: false,
      });
    }
  }
  versions.set(current.version, {
    version: current.version,
    commitSha: current.commitSha,
    when: current.createdAt,
    why:
      versions.get(current.version)?.why ??
      "Proposed from the inspected repository.",
    current: true,
  });
  return [...versions.values()].sort((a, b) => b.version - a.version);
}
