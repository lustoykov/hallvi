// Hallvi's own version, as the interface reads it.
//
// The deciding lives in `scripts/update-start.mjs`, because the installed
// `hallvi update` command has to do exactly the same things without Next.js.
// This file only says where this installation's program and state are, so both
// callers ask the same questions of the same directories.
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import {
  installation,
  installedRelease,
} from "../../scripts/release-source.mjs";
import type { UpdateAttempt } from "../../scripts/update-attempt.mjs";
import {
  currentAttempt,
  dismissUpdate as dismiss,
  releaseView,
  startUpdate,
} from "../../scripts/update-start.mjs";

import { databasePath } from "./db";

/** The program directory: what `serve.mjs` started the interface in. */
const program = () => process.cwd();
const data = () => dirname(databasePath());

export interface ReleaseState {
  installed:
    | {
        kind: "installed";
        version: string;
        revision: string;
        platform: string | null;
      }
    | {
        kind: "development";
        version: string | null;
        revision: string | null;
        reason: string;
      };
  machine: string;
  channel: string;
  /** False when the trusted key came from this installation's settings. */
  ownKey: boolean;
  available: {
    version: string;
    revision: string;
    notes: string;
    releasedAt: string;
    size: number | null;
    /** Set when this release cannot be installed here, and why. */
    blocked: string | null;
  } | null;
  checkedAt: string | null;
  checkError: string | null;
  attempt: UpdateAttempt | null;
}

/** What this process is, as the package that built it recorded. */
export function runningRelease() {
  return installedRelease(program());
}

/**
 * Which checkout this is, when it is one, and the retained application it is
 * attached to. `retained-application.mjs attach` sets the runtime id and puts
 * the database in that application's own state directory.
 */
export function runningCheckout() {
  if (installation(program()).kind !== "development") return null;
  return {
    checkout: basename(program()),
    application: process.env.HALLVI_RUNTIME_ID ? basename(data()) : null,
  };
}

/** Everything the version line shows. `check` is the owner asking. */
export function releaseState({ check = false } = {}): Promise<ReleaseState> {
  return releaseView({
    program: program(),
    data: data(),
    check,
  }) as Promise<ReleaseState>;
}

/** Hands the update to a program outside this one and returns at once. */
export function beginUpdate() {
  return startUpdate({ program: program(), data: data() });
}

/** The owner has read the outcome and does not want to see it again. */
export function dismissUpdate() {
  dismiss(data());
}

/** The attempt as it stands; a dead helper reads as the failure it is. */
export function updateAttempt() {
  return currentAttempt(data());
}

/** Where the helper's own output went, when there is any. */
export function updateLogPath() {
  const log = join(data(), "logs", "update.log");
  return existsSync(log) ? log : null;
}
