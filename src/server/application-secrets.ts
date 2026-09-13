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
//   The controller keeps it here, encrypted, and resolves handles at the
//   moment a command is spawned. What is recorded, displayed and logged is
//   the handle.
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
export const HANDLE = /\{\{secret:([A-Z][A-Z0-9_]{0,63})\}\}/g;

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

function path(applicationId: string) {
  return join(directory(), `${applicationId}.json`);
}

function read(applicationId: string): Stored[] {
  try {
    return JSON.parse(readFileSync(path(applicationId), "utf8"));
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
 * Replaces handles with values, at the moment a command is spawned. What is
 * recorded and shown keeps the handle, because the substitution happens after
 * the record is written and to a different string.
 *
 * An unresolved handle is an error rather than an empty string: a deployment
 * that quietly ran with a blank password is worse than one that stopped.
 */
export function resolveSecretHandles(applicationId: string, text: string) {
  const held = new Map(
    values(applicationId).map((item) => [item.name, item.value]),
  );
  const missing = new Set<string>();
  const resolved = text.replace(HANDLE, (whole, name: string) => {
    const value = held.get(name);
    if (value === undefined) {
      missing.add(name);
      return whole;
    }
    return value;
  });
  if (missing.size)
    throw new Error(
      `No value has been supplied for ${[...missing].join(", ")}. Ask for it ` +
        `with request_secret and wait for the owner to fill it in; do not ` +
        `substitute a value of your own.`,
    );
  return resolved;
}

/** Whether any handle appears, so callers can skip the work when none do. */
export function hasSecretHandle(text: string) {
  HANDLE.lastIndex = 0;
  return HANDLE.test(text);
}

/**
 * Removes this application's held values from anything about to be stored or
 * shown. Belt and braces: a command should print its own secret to nothing,
 * but "should" is not a property a log can rely on.
 */
export function redactHeldSecrets(applicationId: string, text: string) {
  let result = text;
  for (const { name, value } of values(applicationId))
    if (value.length >= 4 && result.includes(value))
      result = result.split(value).join(`{{secret:${name}}}`);
  return result;
}

/** Constant-time comparison, for tests that check a value round-trips. */
export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
