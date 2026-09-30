"use client";

// PROTOTYPE — GitHub in direction A's language: the account in the raised
// header (sign in with a code, or who is signed in), then each application's
// repository as a row with what Hallvi can do with it, then what the App may
// do, in three short lines instead of a paragraph.

import {
  ArrowSquareOut,
  Check,
  GitBranch,
  GitPullRequest,
  Lock,
  ProhibitInset,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useState } from "react";

import type { ProtoApplication } from ".";
import { Toast } from "./shared";

export function GithubPage({
  state,
  applications,
}: {
  state: string;
  applications: ProtoApplication[];
}) {
  const [signedIn, setSignedIn] = useState(state === "some");
  const [waiting, setWaiting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const note = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2400);
  };
  // Invented access so every row state shows up.
  const access = (index: number) =>
    !signedIn
      ? index === 0
        ? "public"
        : "unknown"
      : ["readable", "public", "missing"][index % 3]!;

  return (
    <div className="msp-a msp-page">
      <section className="msp-hero">
        {waiting ? (
          <div>
            <span className="msp-eyebrow">Signing in</span>
            <h2 className="msp-code">HVL-4M9P</h2>
            <p>
              Enter this code on GitHub, then choose the repositories Hallvi may
              read.
            </p>
            <div className="msp-hero-actions">
              <a
                className="msp-btn msp-btn-primary"
                href="#"
                onClick={(event) => event.preventDefault()}
              >
                Open GitHub <ArrowSquareOut />
              </a>
              <span className="msp-muted">
                <SpinnerGap className="spin" /> Waiting for you…
              </span>
              <button
                type="button"
                className="msp-link msp-muted"
                onClick={() => setWaiting(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : signedIn ? (
          <div className="msp-hero-account">
            <span className="msp-avatar">L</span>
            <div>
              <span className="msp-eyebrow">Signed in</span>
              <h2>lyubomir</h2>
              <p>
                Hallvi reads the repositories you picked on GitHub. It renews by
                itself.
              </p>
            </div>
            <div className="msp-hero-side">
              <a
                className="msp-btn"
                href="#"
                onClick={(event) => event.preventDefault()}
              >
                Choose repositories <ArrowSquareOut />
              </a>
              <button
                type="button"
                className="msp-link msp-muted"
                onClick={() => {
                  setSignedIn(false);
                  note("Signed out of GitHub");
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="msp-hero-row">
            <div>
              <span className="msp-eyebrow">Not signed in</span>
              <h2>Public repositories just work</h2>
              <p>Sign in only when an application’s code is private.</p>
            </div>
            <button
              type="button"
              className="msp-btn"
              onClick={() => {
                setWaiting(true);
                window.setTimeout(() => {
                  setWaiting(false);
                  setSignedIn(true);
                  note("Signed in as lyubomir");
                }, 2600);
              }}
            >
              Sign in with GitHub
            </button>
          </div>
        )}
      </section>

      <h3 className="msp-group-title">Your applications’ code</h3>
      <ul className="msp-rows">
        {applications.slice(0, 6).map((application, index) => {
          const state = access(index);
          return (
            <li key={application.id}>
              <div className="msp-row">
                <span className="msp-row-icon">
                  {state === "missing" || state === "unknown" ? (
                    <Lock />
                  ) : (
                    <GitBranch />
                  )}
                </span>
                <span className="msp-row-text">
                  <strong>{application.repository}</strong>
                  <small>{application.name}</small>
                </span>
                {state === "readable" ? (
                  <span className="msp-ok">
                    <Check weight="bold" /> Readable
                  </span>
                ) : state === "public" ? (
                  <span className="msp-muted">Public</span>
                ) : state === "missing" ? (
                  <a
                    className="msp-btn"
                    href="#"
                    onClick={(event) => event.preventDefault()}
                  >
                    Give access <ArrowSquareOut />
                  </a>
                ) : (
                  <span className="msp-muted">Sign in to check</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="msp-group-title">What the Hallvi App may do</h3>
      <ul className="msp-rows msp-rows-plain">
        <li>
          <div className="msp-row">
            <span className="msp-row-icon">
              <GitBranch />
            </span>
            <span className="msp-row-text">
              <strong>Read code</strong>
              <small>Only in repositories you pick.</small>
            </span>
          </div>
        </li>
        <li>
          <div className="msp-row">
            <span className="msp-row-icon">
              <GitPullRequest />
            </span>
            <span className="msp-row-text">
              <strong>Propose changes</strong>
              <small>
                On a branch of its own, as a pull request you review.
              </small>
            </span>
          </div>
        </li>
        <li>
          <div className="msp-row">
            <span className="msp-row-icon">
              <ProhibitInset />
            </span>
            <span className="msp-row-text">
              <strong>Never merges</strong>
              <small>And never writes to the branch you deploy from.</small>
            </span>
          </div>
        </li>
      </ul>
      <p className="msp-fine">
        The login stays on this computer. <a href="#">Storage &amp; privacy</a>
      </p>
      <Toast text={toast} />
    </div>
  );
}
