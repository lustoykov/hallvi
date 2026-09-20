// Deciding whether to update, and handing the work over.
//
// `hallvi update` and the version line in the sidebar are the same thing said
// twice, so the deciding happens once, here: which release is available,
// whether it can be installed on this machine at all, and what the owner is
// agreeing to. Both callers then start the same helper, which runs the same
// installer. A command that took a different path would be a second update
// mechanism with its own bugs, and only one of the two would be tested.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

import {
  compareVersions,
  DEFAULT_CHANNEL,
  discover,
  UNCHANGED,
  installation,
  migrates,
  packageFor,
  programSchemaVersion,
} from "./release-source.mjs";
import {
  attemptStatus,
  claimAttempt,
  clearAttempt,
  recordPhase,
} from "./update-attempt.mjs";
import { helperAlive, helperTarget, startHelper } from "./update-service.mjs";

/** How long a check is believed before Hallvi looks again. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const checkFile = (data) => join(data, "update-check.json");

function readCheck(data) {
  try {
    const value = JSON.parse(readFileSync(checkFile(data), "utf8"));
    return typeof value?.checkedAt === "string" ? value : null;
  } catch {
    return null;
  }
}

function writeCheck(data, value) {
  const file = checkFile(data);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.writing`, `${JSON.stringify(value)}\n`, {
    mode: 0o600,
  });
  renameSync(`${file}.writing`, file);
  return value;
}

/**
 * Looks for a newer release, or hands back what the last look found.
 *
 * Rarely, and never while Hallvi is starting: the answer is kept for an hour,
 * and a source that cannot be reached leaves the previous answer in place
 * with the reason beside it rather than replacing it with nothing. `force` is
 * somebody asking, which is always worth a look.
 */
export async function checkForRelease(
  data,
  { force = false, env = process.env } = {},
) {
  const cached = readCheck(data);
  // One rule about how often to look, here and in checkForReleaseIfDue: a look
  // that failed is still a look, and an unreachable source must not turn into a
  // request per attempt. `force` is somebody pressing the button.
  if (
    !force &&
    cached &&
    Date.now() - Date.parse(cached.checkedAt) < CHECK_INTERVAL_MS
  )
    return cached;
  try {
    const candidate = await discover({
      channel: DEFAULT_CHANNEL,
      env,
      known: cached?.error ? null : (cached?.candidate?.tag ?? null),
    });
    return writeCheck(data, {
      checkedAt: new Date().toISOString(),
      candidate: candidate === UNCHANGED ? cached.candidate : candidate,
      error: null,
    });
  } catch (error) {
    return writeCheck(data, {
      checkedAt: new Date().toISOString(),
      candidate: cached?.candidate ?? null,
      error:
        error instanceof Error
          ? error.message
          : "The release source could not be reached.",
    });
  }
}

/**
 * The hourly look, for the worker to call on a deadline.
 *
 * It answers three questions before it does anything: is this an
 * installation at all — a checkout has nothing to update and should not be
 * polling GitHub; is a look actually due; and did it fail, in which case it
 * says so where the interface reads it and nowhere else. It never installs.
 * Pressing the button remains the only way anything is replaced.
 */
export async function checkForReleaseIfDue({
  program = process.cwd(),
  data,
  home,
  env = process.env,
} = {}) {
  const here = home ? installation(program, home) : installation(program);
  if (here.kind !== "installed") return null;
  const cached = readCheck(data);
  // A look that failed is still a look. Leaving errors out of this gate meant an
  // unreachable source was retried every time the worker came round — once a
  // minute — for as long as the outage lasted. Somebody pressing the button goes
  // to checkForRelease with force and is unaffected.
  if (cached && Date.now() - Date.parse(cached.checkedAt) < CHECK_INTERVAL_MS)
    return cached;
  return await checkForRelease(data, { env });
}

/** Why this candidate cannot be installed here, in one sentence, or nothing. */
export function blockedReason(program, candidate) {
  const schema = programSchemaVersion(program);
  const wanted = candidate.manifest.schemaVersion;
  // Whether the two can be joined is the *release's* answer, carried in its
  // signed manifest. It cannot be this program's: the migration belongs to
  // the version being installed, and an installation old enough to need one
  // is by definition too old to know it exists.
  if (
    schema !== null &&
    wanted !== schema &&
    !migrates(candidate.manifest, schema)
  )
    return `Hallvi ${candidate.manifest.version} keeps its records in schema ${wanted} and this one uses schema ${schema}, and does not say it can migrate them. This release cannot be installed over your records.`;
  try {
    packageFor(candidate.manifest);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "This release has no package for this machine.";
  }
}

function sizeOf(candidate) {
  try {
    return packageFor(candidate.manifest).size;
  } catch {
    return null;
  }
}

/** Everything the version line and `hallvi update` both read. */
export async function releaseView({
  program,
  data,
  check = false,
  env = process.env,
} = {}) {
  const here = installation(program);
  const attempt = attemptStatus(data, helperAlive);
  const machine = hostname().replace(/\.(local|lan)$/i, "") || "this computer";
  const base = { machine, channel: DEFAULT_CHANNEL, attempt };
  if (here.kind === "development")
    return {
      ...base,
      ownKey: true,
      installed: {
        kind: "development",
        version: here.release?.version ?? null,
        revision: here.release?.revision ?? null,
        reason: here.reason,
      },
      available: null,
      checkedAt: null,
      checkError: null,
    };

  const looked = check
    ? await checkForRelease(data, { force: true, env })
    : readCheck(data);
  const candidate = looked?.candidate ?? null;
  const newer =
    candidate &&
    compareVersions(candidate.manifest.version, here.release.version) > 0
      ? candidate
      : null;
  return {
    ...base,
    ownKey: candidate?.ownKey ?? true,
    installed: {
      kind: "installed",
      version: here.release.version,
      revision: here.release.revision,
      platform: here.release.platform,
    },
    available: newer
      ? {
          version: newer.manifest.version,
          revision: newer.manifest.revision,
          notes: newer.manifest.notes,
          releasedAt: newer.manifest.releasedAt,
          size: sizeOf(newer),
          blocked: blockedReason(program, newer),
        }
      : null,
    checkedAt: looked?.checkedAt ?? null,
    checkError: looked?.error ?? null,
  };
}

/**
 * Hands the update to a program outside this one and returns at once. After
 * this the attempt file is the only thing that knows what is happening,
 * because the two processes that would otherwise report it are the two being
 * replaced.
 */
export async function startUpdate({ program, data, env = process.env }) {
  const here = installation(program);
  if (here.kind !== "installed")
    throw new Error(`${here.reason} Install a release to update from Hallvi.`);
  const looked = await checkForRelease(data, { force: true, env });
  const candidate = looked.candidate;
  if (!candidate)
    throw new Error(
      looked.error ??
        `No ${DEFAULT_CHANNEL} release is published for this Hallvi to install.`,
    );
  if (compareVersions(candidate.manifest.version, here.release.version) <= 0)
    throw new Error(
      `Hallvi ${here.release.version} is already the newest ${DEFAULT_CHANNEL} release.`,
    );
  const blocked = blockedReason(program, candidate);
  if (blocked) throw new Error(blocked);

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // The helper's service is named in the attempt before it is started, so a
  // reader in between sees an attempt whose helper has not started yet rather
  // than one whose helper has died.
  const attempt = claimAttempt(data, helperAlive, {
    id,
    from: { version: here.release.version, revision: here.release.revision },
    to: {
      version: candidate.manifest.version,
      revision: candidate.manifest.revision,
      notes: candidate.manifest.notes,
    },
    candidate: {
      document: candidate.document,
      signature: candidate.signature,
      channel: candidate.manifest.channel,
    },
    helper: helperTarget({ data, attempt: id }),
  });
  try {
    startHelper({ data, program, attempt: id });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The update helper could not be started.";
    recordPhase(data, "failed", message);
    throw new Error(message);
  }
  return attempt;
}

/** The owner has read the outcome and does not want to see it again. */
export function dismissUpdate(data) {
  if (attemptStatus(data, helperAlive)?.running)
    throw new Error("This update is still running.");
  clearAttempt(data);
}

/** The attempt as it stands; a dead helper reads as the failure it is. */
export function currentAttempt(data) {
  return attemptStatus(data, helperAlive);
}
