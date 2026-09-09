"use client";

import {
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  Play,
  Pause,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";

import type { Scenario } from "./scenario";

/**
 * The prototype's own controls, in a bar under the shell so they never sit
 * on product surfaces: which scenario, which step, replay, and the other
 * screens. Everything above the bar is the product's components with
 * invented data.
 */
export function ScenarioBar({
  scenarios,
  scenario,
  step,
  playing,
  onScenario,
  onStep,
  onPlaying,
  onReplay,
}: {
  scenarios: Scenario[];
  scenario: Scenario;
  step: number;
  playing: boolean;
  onScenario: (id: Scenario["id"]) => void;
  onStep: (step: number) => void;
  onPlaying: (playing: boolean) => void;
  onReplay: () => void;
}) {
  const current = scenario.steps[step];
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (event.key === "]" && step < scenario.steps.length - 1)
        onStep(step + 1);
      if (event.key === "[" && step > 0) onStep(step - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, scenario, onStep]);
  return (
    <div className="sg-reference-bar" role="region" aria-label="Prototype">
      <span className="sg-reference-tag">Prototype · invented data</span>
      <label className="sg-reference-scenario">
        <span className="sg-visually-hidden">Scenario</span>
        <select
          value={scenario.id}
          onChange={(event) => onScenario(event.target.value as Scenario["id"])}
        >
          {scenarios.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="sg-reference-stepper">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => onStep(step - 1)}
          aria-label="Previous step"
        >
          <CaretLeft aria-hidden="true" />
        </button>
        <label>
          <span className="sg-visually-hidden">Step</span>
          <select
            value={step}
            onChange={(event) => onStep(Number(event.target.value))}
          >
            {scenario.steps.map((item, index) => (
              <option key={item.id} value={index}>
                {index + 1}. {item.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={step >= scenario.steps.length - 1}
          onClick={() => onStep(step + 1)}
          aria-label="Next step"
        >
          <CaretRight aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPlaying(!playing)}
          aria-pressed={playing}
          aria-label={playing ? "Pause auto-play" : "Play steps"}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button type="button" onClick={onReplay} aria-label="Replay this step">
          <ArrowCounterClockwise aria-hidden="true" />
        </button>
      </div>
      <p className="sg-reference-note">
        <b>{current.title}.</b> {current.note}
      </p>
      <span className="sg-reference-clock">
        {new Date(current.clock).toUTCString().slice(5, 22)} UTC
      </span>
      <Link className="sg-reference-link" href="/prototype">
        All screens
      </Link>
    </div>
  );
}
