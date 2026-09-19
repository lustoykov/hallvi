import {
  BACKGROUND_CONTEXT,
  JsonlSessionRepo,
  type JsonlSessionMetadata,
  type Session,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import Database from "better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
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

/**
 * A history written before Pi's session repository: `<chat>.jsonl` beside the
 * chat's directory. Checked once, before it is copied in, so a damaged file is
 * reported rather than half-read.
 */
function inspectEarlierHistory(path: string, expectedId: string | null) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o400))
    throw unavailable();
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const header = entries[0];
  if (!header) return false;
  if (
    header.type !== "session" ||
    typeof header.id !== "string" ||
    (expectedId !== null && header.id !== expectedId) ||
    entries.slice(1).some((entry) => typeof entry.id !== "string")
  )
    throw unavailable();
  return true;
}

export type NativeSession = Session<JsonlSessionMetadata>;

/**
 * One repository per conversation, in `<application>/<chat>/`. Pi owns the
 * files in it and their format. A history from before that layout is copied
 * in, never moved: the original stays where the earlier version reads it.
 */
async function openLockedSession(applicationId: string, chatId: string) {
  const chat = ownedChat(applicationId, chatId);
  const root = privateDirectory(
    join(applicationDirectory(applicationId), validatedId(chatId)),
  );
  const repo = new JsonlSessionRepo({
    fileSystem: new NodeExecutionEnv({ cwd: root }),
    sessionsRoot: root,
  });
  try {
    let found = await repo.list(undefined, BACKGROUND_CONTEXT);
    const earlier = sessionPath(applicationId, chatId);
    if (
      !found.length &&
      existsSync(earlier) &&
      inspectEarlierHistory(earlier, chat.nativeSessionId)
    ) {
      const imported = join(
        privateDirectory(join(root, "imported")),
        "0.jsonl",
      );
      copyFileSync(earlier, imported, constants.COPYFILE_EXCL);
      chmodSync(imported, 0o600);
      found = await repo.list(undefined, BACKGROUND_CONTEXT);
    }
    if (found.length > 1 || (!found.length && chat.nativeSessionId))
      throw unavailable();
    const session = found.length
      ? await repo.open(found[0], BACKGROUND_CONTEXT)
      : await repo.create({ cwd: root }, BACKGROUND_CONTEXT);
    if (chat.nativeSessionId && session.metadata.id !== chat.nativeSessionId)
      throw unavailable();
    if (!chat.nativeSessionId) {
      const changed = db()
        .update(chats)
        .set({ nativeSessionId: session.metadata.id })
        .where(and(eq(chats.id, chatId), isNull(chats.nativeSessionId)))
        .run();
      if (changed.changes !== 1) throw unavailable();
    }
    // Pi writes its files readable by everyone. The directory is private; the
    // file is made so too, again after Pi has rewritten it.
    const keepPrivate = () => chmodSync(session.metadata.path, 0o600);
    keepPrivate();
    return {
      session,
      async close() {
        await repo.close(BACKGROUND_CONTEXT);
        keepPrivate();
      },
    };
  } catch (error) {
    await repo.close(BACKGROUND_CONTEXT).catch(() => undefined);
    throw error;
  }
}

/**
 * Open this conversation's history as its one writer. Pi's repository does not
 * stop a second process from opening the same file, so the application lock
 * is what makes that true; `release` closes the history before letting go.
 */
export async function openNativeChatSession(
  applicationId: string,
  chatId: string,
) {
  ownedChat(applicationId, chatId);
  let unlock: (() => void) | undefined;
  try {
    unlock = acquireApplicationLock(applicationId);
    const release = unlock;
    const { session, close } = await openLockedSession(applicationId, chatId);
    return {
      session,
      async release() {
        try {
          await close();
        } finally {
          release();
        }
      },
    };
  } catch (cause) {
    unlock?.();
    if (cause instanceof NativeSessionError) throw cause;
    throw unavailable(cause);
  }
}

// The caller stops and settles active conversations first. Keep record
// removal and session cleanup inside the same lock so a worker cannot reopen
// between them.
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
