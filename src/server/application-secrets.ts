// A secret the owner supplies without putting it in Pi's conversation.
//
// Some applications cannot be deployed without one: Grafana wants an admin
// password, a database wants its own. Pi is forbidden from asking for one in
// chat and from saving it, and both of those rules are right — a value in a
// message is a value in the model's context, in the transcript, and in every
// evaluation artifact made from either. So the value has to travel a path
// the model is not on.
//
// The path:
//
//   Pi asks for a **handle**. request_secret records that the application
//   needs GF_SECURITY_ADMIN_PASSWORD and hands back
//   {{secret:GF_SECURITY_ADMIN_PASSWORD}}. There is no tool that returns a
//   value directly.
//
//   The owner types it into a masked field the product renders. It never
//   becomes a message.
//
//   The controller keeps it here, encrypted, and hands it to a command as an
//   **environment variable**, never as text spliced into the command. Pi names
//   the variables it needs; the command refers to "$POSTGRES_PASSWORD" like any
//   other shell variable. What is recorded, displayed and logged is the name.
//
// Why not substitute the value into the command text: a value containing a
// quote, a semicolon or $(...) would stop being data and start being shell
// syntax. Pi does not write the value, so Pi cannot escape it, and neither can
// we without knowing where in the command it landed. Passing it through the
// environment removes the question: the shell never parses it.
//
// What the encryption is for, honestly: it keeps plaintext out of casual file
// inspection, grep output and screenshots. The key is stored beside the
// ciphertext, so a copy or backup of the full configuration contains both and
// is not protected by this encryption. A Pi-authored command also receives the
// value in its environment and can read, transform or transmit it. Exact-value
// redaction prevents accidental plaintext disclosure; it is not a boundary
// against a malicious command or someone with filesystem access.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { piConfigDir } from "./pi-configuration";

export interface SecretRequest {
  /**
   * A replacement is part-way through and not yet proven. A page showing this
   * must not report the credential as settled either way.
   */
  changing?: boolean;
  /**
   * A change was attempted and neither value could be proved against the
   * service. Both are still held. This is not a worse kind of `changing` —
   * it is the state that says nobody is coming back to it on their own.
   */
  unresolved?: { at: string; why: string } | null;
  /** The environment variable name, which is also the handle's name. */
  name: string;
  /** Why the application needs it, in Pi's words, for the owner to judge. */
  why: string;
  /** The process that needs it, when Pi knows. */
  process: string | null;
  requestedAt: string;
  /** When a value was supplied. Null means the request is still open. */
  establishedAt: string | null;
  /**
   * Where the current value came from.
   *
   * `owner` means they typed it and the controller has never seen another;
   * `generated` means the controller made it, which is the only case where
   * revealing it tells the owner something they do not already know. The
   * distinction drives the UI: there is no point offering to reveal a value
   * the owner chose, and every point in offering it for one they did not.
   */
  origin: "owner" | "generated";
  /** How many times this name's value has been replaced. */
  revision: number;
}

interface Stored extends SecretRequest {
  /** iv:tag:ciphertext, base64. Absent until the owner supplies a value. */
  sealed: string | null;
  /**
   * The value being replaced, kept only while a change is in flight.
   *
   * Changing a database password is several steps that can fail between them,
   * and the one unrecoverable outcome is losing the password that still works
   * before the new one does. This holds the outgoing value until the new one
   * is proven, and is cleared the moment it is. It is deliberately not a
   * history: one predecessor, for exactly as long as it can still be needed.
   *
   * It carries the predecessor's own record, not just its bytes. Rolling
   * back used to restore the value and leave the new one's provenance in
   * place, so a generated rotation of a password the owner had typed left the
   * owner's value sealed under `origin: "generated"` — and generated is
   * precisely the origin that may be read back. The record has to travel with
   * the value or the rollback is not a rollback.
   */
  previous?: {
    sealed: string;
    since: string;
    origin: "owner" | "generated";
    establishedAt: string | null;
    revision: number;
  } | null;
  /**
   * Set when a settle attempt could not establish which value the service
   * accepts. Both values stay; nothing is discarded; the page says so.
   */
  unresolved?: { at: string; why: string } | null;
}

const NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
/** Only recognised now to refuse it: see `refuseSecretHandles`. */
export const HANDLE = /\{\{secret:([A-Z][A-Z0-9_]{0,63})\}\}/g;

/**
 * The shortest value the controller will hold.
 *
 * Redaction works by finding the exact value in output, and a value of two or
 * three characters occurs in ordinary text constantly — redacting it would
 * corrupt every log it appears in, and not redacting it would mean claiming a
 * protection that is not there. Refusing it is the only answer that is true.
 */
export const MINIMUM_LENGTH = 8;

function directory() {
  const path = join(piConfigDir(), "secrets");
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

/**
 * The key, made once per controller. Losing it loses every stored value,
 * which is the correct failure: the owner supplies them again, and nothing
 * silently falls back to plaintext.
 */
function key() {
  const path = join(directory(), "key");
  try {
    const held = readFileSync(path);
    if (held.length === 32) return held;
  } catch {
    // Not made yet.
  }
  const made = randomBytes(32);
  writeFileSync(path, made, { mode: 0o600 });
  chmodSync(path, 0o600);
  return made;
}

function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((part) => part.toString("base64"))
    .join(":");
}

function unseal(sealed: string) {
  const [iv, tag, body] = sealed
    .split(":")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * The store for one application. The id is validated exactly as the execution
 * store validates it, so nothing can be talked into reading or writing a path
 * outside this directory.
 */
function path(applicationId: string) {
  return join(directory(), `${z.uuid().parse(applicationId)}.json`);
}

function read(applicationId: string): Stored[] {
  // The id is validated outside the try: a bad one is a caller mistake and
  // must not be swallowed into "this application has no secrets".
  const file = path(applicationId);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function write(applicationId: string, held: Stored[]) {
  writeFileSync(path(applicationId), JSON.stringify(held, null, 2), {
    mode: 0o600,
  });
  chmodSync(path(applicationId), 0o600);
}

/**
 * Pi asks for a secret it will never hold, and gets back the handle to use in
 * its place. Asking twice for the same name is not an error — a second turn
 * that needs the same value should not have to know whether an earlier one
 * already asked.
 */
export function requestSecret(
  applicationId: string,
  request: { name: string; why: string; process?: string | null },
) {
  if (!NAME.test(request.name))
    throw new Error(
      `"${request.name}" is not a usable name. Use the environment variable ` +
        `the application reads, in capitals with underscores, such as ` +
        `GF_SECURITY_ADMIN_PASSWORD.`,
    );
  const held = read(applicationId);
  const existing = held.find((item) => item.name === request.name);
  if (existing) {
    existing.why = request.why;
    existing.process = request.process ?? existing.process;
  } else
    held.push({
      name: request.name,
      why: request.why,
      process: request.process ?? null,
      requestedAt: new Date().toISOString(),
      establishedAt: null,
      origin: "owner",
      revision: 0,
      sealed: null,
    });
  write(applicationId, held);
  return {
    handle: `{{secret:${request.name}}}`,
    established: Boolean(existing?.sealed),
  };
}

/** Withdraw only an unfilled request; never delete a saved credential. */
export function cancelSecretRequest(applicationId: string, name: string) {
  const held = read(applicationId);
  const request = held.find((item) => item.name === name);
  if (request?.sealed || request?.previous)
    throw new Error(
      "This credential already has a value and cannot be withdrawn as an unfilled request.",
    );
  if (request)
    write(
      applicationId,
      held.filter((item) => item.name !== name),
    );
  return { name, cancelled: Boolean(request) };
}

/** What the owner and every page may see: names and states, never values. */
export function listSecrets(applicationId: string): SecretRequest[] {
  return read(applicationId).map(
    ({ sealed, previous, unresolved, ...rest }) => {
      return {
        ...rest,
        // Records written before origin existed were all owner-supplied.
        origin: rest.origin ?? "owner",
        revision: rest.revision ?? (sealed ? 1 : 0),
        establishedAt: sealed ? rest.establishedAt : null,
        changing: Boolean(previous),
        unresolved: previous ? (unresolved ?? null) : null,
      };
    },
  );
}

/** The owner supplies a value. The only way one ever enters the controller. */
export function establishSecret(
  applicationId: string,
  name: string,
  value: string,
) {
  if (!value) throw new Error("A secret cannot be empty.");
  if (value.length < MINIMUM_LENGTH)
    throw new Error(
      `Hallvi holds secrets of at least ${MINIMUM_LENGTH} characters. ` +
        `Shorter values cannot be kept out of command output reliably — they ` +
        `occur in ordinary text — and it would be dishonest to accept one and ` +
        `imply it is hidden.`,
    );
  const held = read(applicationId);
  const found = held.find((item) => item.name === name);
  if (!found)
    throw new Error(
      `Nothing asked for ${name}, so there is nowhere to put it.`,
    );
  found.sealed = seal(value);
  found.establishedAt = new Date().toISOString();
  found.origin = "owner";
  found.revision = (found.revision ?? 0) + 1;
  write(applicationId, held);
}

/**
 * How much randomness a generated credential carries.
 *
 * 24 bytes is 192 bits, encoded base64url into 32 characters. base64url is
 * chosen over a wider alphabet on purpose: every character in it survives a
 * connection string, a shell word, a YAML scalar and a URL without escaping,
 * and a password that has to be escaped somewhere is a password that will one
 * day be escaped wrongly. No character class rules are applied, because
 * complexity rules lower entropy rather than raise it.
 */
const GENERATED_BYTES = 24;

/**
 * The controller makes a credential and tells Pi only its name.
 *
 * Pi must not author passwords: a model's output is in its context, its
 * transcript and every artifact made from either, and "generate something
 * random" is not a thing a language model can do. So the controller generates,
 * seals and keeps it, and hands back a reference — the same reference shape
 * an owner-supplied secret has, so everything downstream is unchanged.
 *
 * **Asking twice does not make a second password.** A retried turn, a
 * restarted worker or a second deployment attempt all call this again, and
 * generating afresh each time would leave the running application
 * authenticating with a value the controller had already replaced. An
 * established value is returned as it stands, and the caller is told it was
 * reused so it does not report a rotation that did not happen.
 */
export function generateSecret(
  applicationId: string,
  request: { name: string; why: string; process?: string | null },
) {
  if (!NAME.test(request.name))
    throw new Error(
      `"${request.name}" is not a usable name. Use the environment variable ` +
        `the application reads, in capitals with underscores, such as ` +
        `POSTGRES_PASSWORD.`,
    );
  const held = read(applicationId);
  const existing = held.find((item) => item.name === request.name);
  if (existing?.sealed) {
    existing.why = request.why;
    existing.process = request.process ?? existing.process;
    write(applicationId, held);
    return {
      handle: `{{secret:${request.name}}}`,
      name: request.name,
      reused: true,
      origin: existing.origin ?? "owner",
      length: 0,
      establishedAt: existing.establishedAt,
    };
  }
  const value = randomBytes(GENERATED_BYTES).toString("base64url");
  const now = new Date().toISOString();
  const record: Stored = {
    name: request.name,
    why: request.why,
    process: request.process ?? null,
    requestedAt: existing?.requestedAt ?? now,
    establishedAt: now,
    origin: "generated",
    revision: (existing?.revision ?? 0) + 1,
    sealed: seal(value),
    previous: null,
  };
  if (existing) Object.assign(existing, record);
  else held.push(record);
  write(applicationId, held);
  // Length, not the value: enough for Pi to say "a 32-character password was
  // generated" without the password being in the sentence.
  return {
    handle: `{{secret:${request.name}}}`,
    name: request.name,
    reused: false,
    origin: "generated" as const,
    length: value.length,
    establishedAt: now,
  };
}

/**
 * The value, for the owner, once, because they asked.
 *
 * This is the only function that returns a stored secret to a caller that can
 * display it, and it exists because a generated password the owner cannot read
 * is a password they do not have: it is in their database and nowhere else
 * they can reach. Withholding it is not security, it is losing their
 * credential on their behalf.
 *
 * Only generated values are revealable. A value the owner typed tells them
 * nothing they do not know, and reading it back would turn the store into an
 * oracle for secrets it was given in confidence.
 */
export function revealSecret(applicationId: string, name: string) {
  const found = read(applicationId).find((item) => item.name === name);
  if (!found?.sealed) throw new Error(`No value is held for ${name}.`);
  if ((found.origin ?? "owner") !== "generated")
    throw new Error(
      `${name} is the value you supplied, so Hallvi will not read it ` +
        `back. Only credentials it generated itself can be revealed.`,
    );
  return {
    name,
    value: unseal(found.sealed),
    origin: "generated" as const,
    establishedAt: found.establishedAt,
  };
}

/**
 * Begin replacing a value, keeping the one that still works.
 *
 * Returns both, because the caller changing a database password needs the old
 * one to authenticate the change and the new one to set. Nothing is marked
 * current here: `settleChange` does that, and only once the new value has been
 * shown to work.
 */
export function beginChange(
  applicationId: string,
  name: string,
  supplied?: string,
) {
  const held = read(applicationId);
  const found = held.find((item) => item.name === name);
  if (!found?.sealed)
    throw new Error(
      `No value is held for ${name}, so there is none to change.`,
    );
  // A second change while one is in flight used to overwrite the predecessor
  // with the first change's unproven value — so rolling back restored a
  // password nothing had ever accepted, and $NAME_PREVIOUS exported one too.
  // A retried turn, or a restart followed by a retry, is the ordinary way to
  // reach this, which is what makes refusing better than guessing which of
  // the two to keep.
  if (found.previous)
    throw new Error(
      `A change to ${name} is already part-way through, and both values are ` +
        `being held for it. Settle that one first with ` +
        `settle_credential_change: outcome "established" once you have proved ` +
        `the new value against the service, "reverted" once you have proved ` +
        `the service still takes the old one, or "unresolved" if you cannot ` +
        `tell yet. Then begin again.`,
    );
  if (supplied !== undefined && supplied.length < MINIMUM_LENGTH)
    throw new Error(
      `Hallvi holds secrets of at least ${MINIMUM_LENGTH} characters.`,
    );
  const next = supplied ?? randomBytes(GENERATED_BYTES).toString("base64url");
  const current = unseal(found.sealed);
  found.previous = {
    sealed: found.sealed,
    since: new Date().toISOString(),
    origin: found.origin ?? "owner",
    establishedAt: found.establishedAt,
    revision: found.revision ?? 1,
  };
  found.sealed = seal(next);
  found.establishedAt = new Date().toISOString();
  found.origin = supplied === undefined ? "generated" : "owner";
  found.revision = (found.revision ?? 0) + 1;
  found.unresolved = null;
  write(applicationId, held);
  return { name, previous: current, next, changing: true };
}

/**
 * How a change ended.
 *
 * Three outcomes rather than two, because there are three and the missing
 * one was the dangerous one. A password change is not a transaction: the
 * service takes the new value in one step and the application's configuration
 * takes it in another, and the step between them can fail. At that moment the
 * truthful answer is not "it worked" and not "it did not" — it is that the
 * service has one of two passwords and nobody has asked it which.
 *
 * `established` and `reverted` each throw a value away, so each is a claim
 * that needs proof. `unresolved` throws nothing away and needs none.
 */
export type ChangeOutcome = "established" | "reverted" | "unresolved";

/**
 * Finish a change, or record that it could not be finished.
 *
 * `established` means the new credential has been proven against the thing it
 * authenticates to — not that a command exited zero. `reverted` means the old
 * one has been proven to still work, which is the only thing that makes
 * discarding the new one safe: if the service already took the new password,
 * "putting the working value back" puts back a value nothing accepts and
 * deletes the one that does. That was the old rollback, and it turned a
 * half-finished change into a locked-out application — exactly the outcome
 * the predecessor is kept to prevent.
 *
 * `unresolved` is for everything else. Both values stay sealed, both stay
 * exported to commands as `$NAME` and `$NAME_PREVIOUS`, the credential keeps
 * saying a change is part-way through, and the page says nobody has
 * established which value the service holds. It is not a failure state; it is
 * an honest one, and it is recoverable because nothing was deleted.
 */
export function settleChange(
  applicationId: string,
  name: string,
  outcome: ChangeOutcome,
  why?: string,
) {
  const held = read(applicationId);
  const found = held.find((item) => item.name === name);
  if (!found) throw new Error(`No value is held for ${name}.`);
  if (!found.previous)
    return {
      name,
      outcome,
      settled: outcome === "established",
      rolledBack: false,
      unresolved: false,
    };
  if (outcome === "unresolved") {
    found.unresolved = {
      at: new Date().toISOString(),
      why: (why ?? "").trim().slice(0, 300) || "No reason was recorded.",
    };
    write(applicationId, held);
    return {
      name,
      outcome,
      settled: false,
      rolledBack: false,
      unresolved: true,
    };
  }
  if (outcome === "established") {
    // Deleted rather than nulled: the predecessor's ciphertext should not be
    // in the file, and neither should a field implying one is kept.
    delete found.previous;
  } else {
    // The record travels with the value. Restoring the bytes alone left an
    // owner-supplied password sealed under `generated`, and generated is the
    // one origin `revealSecret` will read back.
    found.sealed = found.previous.sealed;
    found.origin = found.previous.origin;
    found.establishedAt = found.previous.establishedAt;
    found.revision = found.previous.revision;
    delete found.previous;
  }
  delete found.unresolved;
  write(applicationId, held);
  return {
    name,
    outcome,
    settled: outcome === "established",
    rolledBack: outcome === "reverted",
    unresolved: false,
  };
}

/** Whether a change is in flight, for a page that must not claim success. */
export function changeInFlight(applicationId: string, name: string) {
  return Boolean(
    read(applicationId).find((item) => item.name === name)?.previous,
  );
}

/**
 * The owner takes a value back. It stops resolving immediately, and the
 * request stays open.
 *
 * Removing the request as well was a dead end: the request is Pi's and the
 * value is the owner's, so an owner who withdrew by mistake — or who wanted
 * to supply a different value — could not, because nothing had asked for it
 * any more, and only Pi can ask. Keeping the request open leaves the page
 * saying what is still needed, which is also the truth.
 */
export function withdrawSecret(applicationId: string, name: string) {
  const held = read(applicationId);
  const found = held.find((item) => item.name === name);
  if (!found) return;
  found.sealed = null;
  found.establishedAt = null;
  write(applicationId, held);
}

/**
 * The current value of each name, and the one being replaced where there is
 * one. Separate from `values()` because that one deliberately flattens both
 * for redaction, and an environment must not: a Map built from the flattened
 * list keeps whichever came last, which would silently export the outgoing
 * password as `$NAME` for the duration of every change.
 */
function currentAndPrevious(applicationId: string) {
  const current = new Map<string, string>();
  const previous = new Map<string, string>();
  for (const item of read(applicationId)) {
    if (item.sealed) current.set(item.name, unseal(item.sealed));
    if (item.previous?.sealed)
      previous.set(item.name, unseal(item.previous.sealed));
  }
  return { current, previous };
}

/**
 * Every value this application holds, for scanning output. Never returned to
 * a caller that could show it — the two callers are handle resolution and
 * redaction, both inside the privileged layer.
 */
function values(applicationId: string) {
  const held: { name: string; value: string }[] = [];
  for (const item of read(applicationId)) {
    if (item.sealed) held.push({ name: item.name, value: unseal(item.sealed) });
    // The value being replaced counts too. While a change is in flight both
    // are live — the old one still authenticates and the new one is being
    // installed — so a command's output can contain either, and redaction
    // that only knew the new one would print the old one in the clear.
    if (item.previous?.sealed)
      held.push({ name: item.name, value: unseal(item.previous.sealed) });
  }
  return held;
}

/**
 * A shell prologue that exports the named secrets, to run before a command
 * that refers to them as ordinary variables.
 *
 * The value is single-quoted with POSIX escaping, so it reaches the process as
 * bytes and never as syntax. A value of `a'; rm -rf /; echo '` becomes exactly
 * that string in the variable, and no second command runs — which is the whole
 * reason this is not a text substitution into whatever Pi wrote.
 *
 * Names are already constrained to `[A-Z][A-Z0-9_]*`, so they are safe as
 * identifiers without further quoting.
 *
 * An unresolved name is an error rather than an empty export: a deployment
 * that quietly came up with a blank admin password is worse than one that
 * stopped.
 */
export function secretEnvironment(applicationId: string, names: string[]) {
  if (!names.length) return "";
  const { current, previous } = currentAndPrevious(applicationId);
  const missing = names.filter((name) => !current.has(name));
  if (missing.length)
    throw new Error(
      `No value has been supplied for ${missing.join(", ")}. Ask for it with ` +
        `request_secret, or have the controller make one with ` +
        `generate_secret, and do not substitute a value of your own.`,
    );
  const lines = names.map(
    (name) => `export ${name}=${posixQuote(current.get(name)!)}`,
  );
  // While a change is in flight the outgoing value is still the one the
  // service accepts, and a script that has to authenticate in order to change
  // the password needs it. It is exported under its own name so nothing can
  // confuse the two: $NAME is always what the credential is becoming.
  for (const name of names) {
    const outgoing = previous.get(name);
    if (outgoing) lines.push(`export ${name}_PREVIOUS=${posixQuote(outgoing)}`);
  }
  return lines.join("\n") + "\n";
}

/** `it's` → `'it'\''s'`. The only escaping a single-quoted shell word needs. */
function posixQuote(value: string) {
  return `'${value.split("'").join(`'\\''`)}'`;
}

/**
 * Refuses a command that still writes `{{secret:NAME}}` into its own text.
 *
 * That was the earlier shape and it was wrong: substituting a value into
 * Pi-authored shell makes the value syntax. The message says what to do
 * instead, so a turn that reaches for the old pattern corrects itself.
 */
export function refuseSecretHandles(command: string) {
  HANDLE.lastIndex = 0;
  const found = [...command.matchAll(HANDLE)].map((match) => match[1]);
  if (!found.length) return;
  throw new Error(
    `This command writes ${[...new Set(found)].join(", ")} into its own text ` +
      `as {{secret:NAME}}. A value spliced into a command is shell syntax, ` +
      `not data. Pass the names in the secrets argument instead and refer to ` +
      `them as ordinary variables: secrets: ["${found[0]}"] with the command ` +
      `using "$${found[0]}".`,
  );
}

/**
 * Removes this application's held values from anything about to be stored or
 * shown. Belt and braces: a command should print its own secret to nothing,
 * but "should" is not a property a log can rely on.
 */
export function redactHeldSecrets(applicationId: string, text: string) {
  let result = text;
  for (const { name, value } of values(applicationId))
    if (result.includes(value))
      result = result.split(value).join(`{{secret:${name}}}`);
  return result;
}

/** Constant-time comparison, for tests that check a value round-trips. */
export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
