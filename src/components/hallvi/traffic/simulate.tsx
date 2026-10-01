"use client";

// Development only: start the fixture generator's live traffic from the
// Traffic page, to watch the live parts move without a terminal. The
// requests are real and count in the application's totals; see
// src/server/traffic/simulate.ts. Absent in production.

import { useEffect, useState } from "react";

import type { Simulation, SimulatedShape } from "@/server/traffic/simulate";

const SHAPES: { id: SimulatedShape; label: string }[] = [
  { id: "busy", label: "Busy site" },
  { id: "spa", label: "Single-page app" },
  { id: "tiny", label: "Tiny site" },
  { id: "api", label: "API" },
];
const RATES = [3, 10, 30];
const MINUTES = [5, 10, 30];

const minutesLeft = (endsAt: string) =>
  Math.max(0, Math.ceil((Date.parse(endsAt) - Date.now()) / 60_000));

/** The run, `null` when none has started, `undefined` without the route. */
async function ask(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return undefined;
    return ((await response.json()) as { simulation: Simulation | null })
      .simulation;
  } catch {
    return undefined;
  }
}

export function SimulateTraffic({ applicationId }: { applicationId: string }) {
  const url = `/api/applications/${applicationId}/traffic/simulate`;
  // Undefined until asked; a prototype page with invented numbers has no
  // route behind it, and then the control stays away.
  const [run, setRun] = useState<Simulation | null | undefined>(undefined);
  const [shape, setShape] = useState<SimulatedShape>("busy");
  const [rate, setRate] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void ask(url).then(setRun);
  }, [url]);
  const running = Boolean(run?.running);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void ask(url).then(setRun), 3_000);
    return () => clearInterval(timer);
  }, [running, url]);

  if (process.env.NODE_ENV === "production" || run === undefined) return null;

  const send = async (body: object) => {
    setAsking(true);
    setProblem(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json()) as {
        simulation?: Simulation | null;
        error?: string;
      };
      if (!response.ok) throw new Error(answer.error ?? "It did not start.");
      setRun(answer.simulation ?? null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="tf-simulate" aria-label="Simulated traffic">
      <span>Simulated traffic</span>
      {running && run ? (
        <p>
          <i className="tf-simulate-dot" aria-hidden="true" />
          {run.requests} requests to {new URL(run.origin).host}
          {run.open ? `, ${run.open} visits open` : ""} ·{" "}
          {minutesLeft(run.endsAt)} min left
          <button
            type="button"
            disabled={asking}
            onClick={() => send({ action: "stop" })}
          >
            Stop
          </button>
        </p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Kind of site">
            {SHAPES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === shape}
                onClick={() => setShape(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p>
            <select
              aria-label="Visits a minute"
              value={rate}
              onChange={(event) => setRate(Number(event.target.value))}
            >
              {RATES.map((value) => (
                <option key={value} value={value}>
                  {value} visits a minute
                </option>
              ))}
            </select>
            <select
              aria-label="How long"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            >
              {MINUTES.map((value) => (
                <option key={value} value={value}>
                  for {value} min
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tf-simulate-start"
              disabled={asking}
              onClick={() => send({ action: "start", shape, rate, minutes })}
            >
              Start
            </button>
          </p>
        </>
      )}
      {problem || run?.error ? (
        <small className="tf-simulate-error">{problem ?? run?.error}</small>
      ) : (
        <small>
          {run && !running ? `Last run sent ${run.requests} requests. ` : ""}
          Real requests from this computer, so they count in this app&apos;s
          totals and come from one country.
        </small>
      )}
    </div>
  );
}
