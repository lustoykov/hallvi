"use client";

import { Check, Minus, SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";

import type { CurrentStep, StepAction } from "./current-step";
import { ExternalLink } from "./external-link";

const WAITING_LABELS: Record<CurrentStep["waitingOn"], string> = {
  you: "Waiting for you",
  "server-guy": "Server Guy is working",
  github: "Waiting for GitHub",
  none: "Nothing waiting",
};

/** The operation an action key maps to; matched against the shell's busy
 * label so the pressed button shows its spinner. */
function operationOf(action: StepAction) {
  const kind = action.key.split(":")[0];
  return kind === "continue-with-server-guy" ? "continue" : kind;
}

/**
 * The current step, above the transcript in every chat of the phase: what the
 * phase is for, what is happening now, whose move it is, the distinct next
 * actions (one solid primary at a time) and, in Phase 3, the stages. Every
 * action is an existing operation; the Record shows the same state.
 */
export function CurrentStepBar({
  step,
  busy,
  demo,
  repository,
  onAction,
}: {
  step: CurrentStep;
  busy: string | null;
  demo: boolean;
  repository: string | null;
  onAction: (action: StepAction) => void;
}) {
  const tone =
    step.waitingOn === "none"
      ? "done"
      : step.waitingOn === "server-guy"
        ? "idle"
        : "";
  return (
    <section className="sg-step" aria-label="Current step">
      <div className="sg-step-head">
        <h2>
          Phase {step.phaseNumber} · {step.phaseName}
          <small>{step.deliverable}</small>
        </h2>
        <span className={`sg-waiting ${step.waitingOn}`}>
          {WAITING_LABELS[step.waitingOn]}
        </span>
      </div>
      <p className="sg-step-purpose">{step.purpose}</p>
      <div className={`sg-step-now ${tone}`}>
        <p>
          <b>Now</b>
          <span>{step.now}</span>
        </p>
        {step.actions.length > 0 && (
          <div className="sg-step-actions">
            {step.actions.map((action) => {
              if (action.kind === "link" && action.href)
                return action.href.startsWith("/") ? (
                  <Link
                    className="sg-text-button"
                    href={action.href}
                    key={action.key}
                    title={action.explanation}
                  >
                    {action.label}
                  </Link>
                ) : (
                  <ExternalLink
                    className="sg-text-button"
                    href={action.href}
                    key={action.key}
                    title={action.explanation}
                  >
                    {action.label}
                  </ExternalLink>
                );
              const operation = operationOf(action);
              const pressed = busy === operation;
              return (
                <button
                  className={
                    action.kind === "primary"
                      ? "sg-primary-button"
                      : action.kind === "secondary"
                        ? "sg-secondary-button"
                        : "sg-text-button"
                  }
                  data-action={action.key}
                  disabled={busy !== null}
                  key={action.key}
                  onClick={() => onAction(action)}
                  title={action.explanation}
                  type="button"
                >
                  {pressed && (
                    <SpinnerGap className="spin" aria-hidden="true" />
                  )}
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {step.stages.length > 0 && (
        <details className="sg-stage-disclosure">
          <summary>
            Work details ·{" "}
            {
              step.stages.filter(
                (stage) => stage.state === "done" || stage.state === "skipped",
              ).length
            }{" "}
            of {step.stages.length} steps complete
          </summary>
          <ol className="sg-stages" aria-label="Preparation work">
            {step.stages.map((stage, index) => (
              <li className={stage.state} key={stage.key}>
                <span className="sg-stage-mark" aria-hidden="true">
                  {stage.state === "done" ? (
                    <Check weight="bold" />
                  ) : stage.state === "skipped" ? (
                    <Minus weight="bold" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="sg-stage-copy">
                  <strong>{stage.label}</strong>
                  {stage.note && <small>{stage.note}</small>}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {demo && (
        <p className="sg-demo-banner">
          Demo repository{repository ? ` ${repository}` : ""}: Pi replies,
          GitHub and the runner are synthetic. Evidence links open local
          records; GitHub links are shown but not followed.
        </p>
      )}
    </section>
  );
}
