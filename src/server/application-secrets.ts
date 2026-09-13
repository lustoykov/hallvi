// A secret the owner supplies, that Pi never sees.
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
//   value, so there is nothing for Pi to leak.
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
// What the encryption is for, honestly: it stops a value leaking the ways
// values actually leak — a copied directory, a grep, a backup, a screen
// share, a support bundle. It is not a claim of protection from someone who
// already has this machine's filesystem, because the key is on it. Saying
// otherwise would be the kind of security theatre that gets people hurt.

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
  /** The environment variable name, which is also the handle's name. */
  name: string;
  /** Why the application needs it, in Pi's words, for the owner to judge. */
  why: string;
  /** The process that needs it, when Pi knows. */
  process: string | null;
  requestedAt: string;
  /** When a value was supplied. Null means the request is still open. */
  establishedAt: string | null;
}

interface Stored extends SecretRequest {
  /** iv:tag:ciphertext, base64. Absent until the owner supplies a value. */
  sealed: string | null;
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
      sealed: null,
    });
  write(applicationId, held);
  return {
    handle: `{{secret:${request.name}}}`,
    established: Boolean(existing?.sealed),
  };
}

/** What the owner and every page may see: names and states, never values. */
export function listSecrets(applicationId: string): SecretRequest[] {
  return read(applicationId).map(({ sealed, ...rest }) => ({
    ...rest,
    establishedAt: sealed ? rest.establishedAt : null,
  }));
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
      `Server Guy holds secrets of at least ${MINIMUM_LENGTH} characters. ` +
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
  write(applicationId, held);
}

/** The owner takes one back. The handle stops resolving immediately. */
export function withdrawSecret(applicationId: string, name: string) {
  const held = read(applicationId).filter((item) => item.name !== name);
  write(applicationId, held);
}

/**
 * Every value this application holds, for scanning output. Never returned to
 * a caller that could show it — the two callers are handle resolution and
 * redaction, both inside the privileged layer.
 */
function values(applicationId: string) {
  return read(applicationId)
    .filter((item): item is Stored & { sealed: string } => Boolean(item.sealed))
    .map((item) => ({ name: item.name, value: unseal(item.sealed) }));
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
  const held = new Map(
    values(applicationId).map((item) => [item.name, item.value]),
  );
  const missing = names.filter((name) => !held.has(name));
  if (missing.length)
    throw new Error(
      `No value has been supplied for ${missing.join(", ")}. Ask for it with ` +
        `request_secret and wait for the owner to fill it in; do not ` +
        `substitute a value of your own.`,
    );
  return (
    names
      .map((name) => `export ${name}=${posixQuote(held.get(name)!)}`)
      .join("\n") + "\n"
  );
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
