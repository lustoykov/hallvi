"use client";

// PROTOTYPE — Workspace in direction A's language: the two places as a
// selectable list, like the model rows, applied on click with a toast instead
// of a Save button. What each protects is one line; the rest folds away.

import { Check, Cube, Desktop, Warning } from "@phosphor-icons/react";
import { useState } from "react";

import { Toast } from "./shared";

export function WorkspacePage({ state }: { state: string }) {
  const docker = state !== "some";
  const [where, setWhere] = useState<"direct" | "docker">("direct");
  const [toast, setToast] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const pick = (next: "direct" | "docker") => {
    if (next === "docker" && !docker) return;
    setWhere(next);
    setToast(`Saved · applies from the next message`);
    window.setTimeout(() => setToast(null), 2400);
  };
  const options = [
    {
      key: "direct" as const,
      icon: <Desktop />,
      name: "On this computer",
      line: "A scratch folder with the repository copy. Commands run as your user.",
      side: "Default",
    },
    {
      key: "docker" as const,
      icon: <Cube />,
      name: "In Docker",
      line: "An isolated container: no network, none of your files.",
      side: docker ? "Docker is running" : "Docker isn’t running",
    },
  ];

  return (
    <div className="msp-a msp-page">
      <section className="msp-hero">
        <div>
          <span className="msp-eyebrow">Pi works</span>
          <h2>{where === "direct" ? "On this computer" : "In Docker"}</h2>
          <p>
            {where === "direct"
              ? "Fast and simple. Precautions, not a sandbox."
              : "Isolated. Choose it for code you don’t trust."}
          </p>
        </div>
      </section>

      <ul
        className="msp-rows msp-choice"
        role="radiogroup"
        aria-label="Where Pi works"
      >
        {options.map((option) => {
          const unavailable = option.key === "docker" && !docker;
          return (
            <li key={option.key}>
              <button
                type="button"
                role="radio"
                aria-checked={where === option.key}
                aria-disabled={unavailable}
                onClick={() => pick(option.key)}
              >
                <span className="msp-a-check">
                  {where === option.key && <Check weight="bold" />}
                </span>
                <span className="msp-row-icon">{option.icon}</span>
                <span className="msp-row-text">
                  <strong>{option.name}</strong>
                  <small>{option.line}</small>
                </span>
                <span
                  className={
                    unavailable
                      ? "msp-warn"
                      : option.key === "docker"
                        ? "msp-ok"
                        : "msp-muted"
                  }
                >
                  {unavailable ? (
                    <Warning weight="bold" />
                  ) : option.key === "docker" ? (
                    <Check weight="bold" />
                  ) : null}
                  {option.side}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!docker && (
        <p className="msp-fine">
          Start Docker Desktop and this refreshes by itself.
        </p>
      )}
      <button
        type="button"
        className="msp-a-more"
        onClick={() => setMore(!more)}
      >
        {more ? "Less" : "What each one protects"}
      </button>
      {more && (
        <div className="msp-explain">
          <p>
            <b>On this computer.</b> Hallvi keeps its own credentials out of
            Pi’s environment, and Pi’s file tools stay inside the folder. A
            command can still reach what your user account can.
          </p>
          <p>
            <b>In Docker.</b> The container has no network and sees only the
            repository copy. Application servers still run with Docker Compose
            either way.
          </p>
        </div>
      )}
      <Toast text={toast} />
    </div>
  );
}
