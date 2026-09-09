import { SessionManager } from "@earendil-works/pi-coding-agent";
import Database from "better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { databasePath, db } from "./db";
import { applications, chats } from "./db-schema";

// Keep native handles reachable until explicit settlement/release, including
// when a poisoned worker abandons its pending SDK promise before process exit.
const activeApplicationLocks = new Set<() => void>();
const RECOVERY_MESSAGE =
  "Conversation history unavailable. Start a new chat to continue.";

export class NativeSessionError extends Error {
  constructor(
    public readonly code: "history-unavailable" | "busy" | "not-found",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "NativeSessionError";
  }
}

function unavailable(cause?: unknown): NativeSessionError {
  return new NativeSessionError("history-unavailable", RECOVERY_MESSAGE, {
    cause,
  });
}

function validatedId(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    throw new NativeSessionError("not-found", "Conversation not found.");
  return id;
}

function ownedChat(applicationId: string, chatId: string) {
  validatedId(applicationId);
  validatedId(chatId);
  const row = db()
    .select({ chat: chats })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.applicationId, applicationId)))
    .get();
  if (!row)
    throw new NativeSessionError("not-found", "Conversation not found.");
  return row.chat;
}

function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
  chmodSync(path, 0o700);
  return path;
}

function storageRoot() {
  // Canonicalize the configured database's parent so aliases use the same lock.
  return privateDirectory(
    join(realpathSync(dirname(databasePath())), "pi-sessions"),
  );
}

function applicationDirectory(applicationId: string) {
  return privateDirectory(join(storageRoot(), validatedId(applicationId)));
}

function sessionPath(applicationId: string, chatId: string) {
  return join(
    applicationDirectory(applicationId),
    `${validatedId(chatId)}.jsonl`,
  );
}

// A separate SQLite file supplies an OS-released lock without holding an app
// database transaction over model execution. Keep its inode when removing data.
function acquireApplicationLock(applicationId: string) {
  const lockPath = join(
    privateDirectory(join(storageRoot(), ".locks")),
    `${validatedId(applicationId)}.sqlite`,
  );
  if (existsSync(lockPath) && !lstatSync(lockPath).isFile())
    throw unavailable();
  const lock = new Database(lockPath, { timeout: 0 });
  try {
    chmodSync(lockPath, 0o600);
    lock.exec("BEGIN EXCLUSIVE");
  } catch (cause) {
    lock.close();
    throw new NativeSessionError(
      "busy",
      "This application's conversation is still running. Cancel it and wait for it to stop before removing its history.",
      { cause },
    );
  }
  let released = false;
  const release = () => {
    if (!released) {
      lock.close();
      released = true;
      activeApplicationLocks.delete(release);
    }
  };
  activeApplicationLocks.add(release);
  return release;
}

function inspectSessionFile(path: string, expectedId: string | null) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o400))
    throw unavailable();
  const contents = readFileSync(path, "utf8");
  if (!contents) {
    if (expectedId) throw unavailable();
    return;
  }
  // The SDK skips malformed lines. Fail visibly before it can repair or discard
  // any damaged attempted history, including an interrupted trailing write.
  const entries = contents
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const header = entries[0];
  if (
    !header ||
    header.type !== "session" ||
    typeof header.id !== "string" ||
    !header.id ||
    !Number.isInteger(header.version) ||
    typeof header.timestamp !== "string" ||
    !Number.isFinite(Date.parse(header.timestamp)) ||
    typeof header.cwd !== "string" ||
    (expectedId !== null && header.id !== expectedId) ||
    // Only an interrupted initial header may be adopted without association.
    (expectedId === null && entries.length !== 1)
  )
    throw unavailable();
  for (const entry of entries.slice(1)) {
    if (
      typeof entry.type !== "string" ||
      typeof entry.id !== "string" ||
      entry.type === "session"
    )
      throw unavailable();
  }
}

function openLockedSession(applicationId: string, chatId: string) {
  const chat = ownedChat(applicationId, chatId);
  const path = sessionPath(applicationId, chatId);
  if (!existsSync(path)) {
    if (chat.nativeSessionId) throw unavailable();
    closeSync(openSync(path, "wx", 0o600));
  }
  inspectSessionFile(path, chat.nativeSessionId);
  chmodSync(path, 0o600);
  // Public open initializes an exclusively created empty file immediately;
  // create() alone defers persistence until the first assistant message.
  const manager = SessionManager.open(path, dirname(path), process.cwd());
  if (chat.nativeSessionId && manager.getSessionId() !== chat.nativeSessionId)
    throw unavailable();
  if (!chat.nativeSessionId) {
    const changed = db()
      .update(chats)
      .set({ nativeSessionId: manager.getSessionId() })
      .where(and(eq(chats.id, chatId), isNull(chats.nativeSessionId)))
      .run();
    if (changed.changes !== 1) throw unavailable();
  }
  return manager;
}

export async function openNativeChatSession(
  applicationId: string,
  chatId: string,
) {
  ownedChat(applicationId, chatId);
  let release: (() => void) | undefined;
  try {
    release = acquireApplicationLock(applicationId);
    return {
      sessionManager: openLockedSession(applicationId, chatId),
      release,
    };
  } catch (cause) {
    release?.();
    if (cause instanceof NativeSessionError) throw cause;
    throw unavailable(cause);
  }
}

// The caller cancels and settles active Runs first. Keep record removal and
// session cleanup inside the same lock so a worker cannot reopen between them.
export function removeNativeApplicationSessions(
  applicationId: string,
  removeApplicationRecords: () => void,
) {
  validatedId(applicationId);
  if (
    !db()
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .get()
  )
    throw new NativeSessionError("not-found", "Application not found.");
  const release = acquireApplicationLock(applicationId);
  try {
    const path = applicationDirectory(applicationId);
    removeApplicationRecords();
    rmSync(path, {
      recursive: true,
      force: true,
    });
  } finally {
    release();
  }
}
