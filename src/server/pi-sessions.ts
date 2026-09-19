import {
  BACKGROUND_CONTEXT,
  JsonlSessionRepo,
  laneState,
  operationMeta,
  operationResult,
  pendingEntry,
  type Entry,
  type JsonlSessionMetadata,
  type LaneQueuedItem,
  type Session,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
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
import { chats } from "./db-schema";

// Only the worker calls into this file. It is the one owner of session
// storage: the app asks it over the worker link and never opens a history.
const RECOVERY_MESSAGE =
  "Conversation history unavailable. Start a new chat to continue.";

export class NativeSessionError extends Error {
  constructor(
    public readonly code: "history-unavailable" | "not-found",
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

/** Where a history from before Pi's session repository would be. */
export function earlierHistoryPath(scope: {
  applicationId: string;
  chatId: string;
}) {
  return join(
    applicationDirectory(scope.applicationId),
    `${validatedId(scope.chatId)}.jsonl`,
  );
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

/** The lane every Hallvi conversation runs in; Pi keeps its state under it. */
const LANE = "main";

export type NativeSession = Session<JsonlSessionMetadata>;

/**
 * One repository per conversation, in `<application>/<chat>/`. Pi owns the
 * files in it and their format. A history from before that layout is copied
 * in, never moved: the original stays where the earlier version reads it.
 */
export async function openNativeChatSession(
  applicationId: string,
  chatId: string,
) {
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
    const earlier = earlierHistoryPath({ applicationId, chatId });
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
      async release() {
        await repo.close(BACKGROUND_CONTEXT);
        keepPrivate();
      },
    };
  } catch (cause) {
    await repo.close(BACKGROUND_CONTEXT).catch(() => undefined);
    throw cause instanceof NativeSessionError ? cause : unavailable(cause);
  }
}

/** Remove every history an application has. */
export function removeNativeSessions(applicationId: string) {
  rmSync(applicationDirectory(applicationId), { recursive: true, force: true });
}

/**
 * A conversation nobody is running, read from Pi's stored session alone.
 *
 * Opening a conversation to answer it needs Pi's model runtime: credentials,
 * a workspace, the tool list. Reading one needs none of that, and asking for
 * it meant an expired ChatGPT login hid the history it had nothing to do with.
 * This reads what Pi durably wrote — the branch, the lane's own state, and how
 * its operations ended — through Pi's own API and no runtime at all. It starts
 * nothing, changes no setting, and writes nothing except the session id the
 * first open records.
 */
export async function readNativeConversation(
  applicationId: string,
  chatId: string,
): Promise<{
  entries: Entry[];
  abortedAt: Set<string>;
  lane: {
    operation: { id: string; startedAt: number } | null;
    queues: LaneQueuedItem[];
  };
}> {
  const native = await openNativeChatSession(applicationId, chatId);
  const ctx = BACKGROUND_CONTEXT;
  try {
    const { session } = native;
    const branch = await session.branch(LANE, ctx);
    const entries = branch
      ? await branch.findEntries({ order: "oldestFirst" }, ctx)
      : [];
    const state = (await session.getValue(laneState(LANE), ctx))?.value;
    // What Pi is holding for this conversation, in the order it will read it.
    const queues: LaneQueuedItem[] = [];
    for (const item of state?.inbox ?? []) {
      const held = (await session.getValue(pendingEntry(item.entryId), ctx))
        ?.value;
      if (held?.type === "message")
        queues.push({
          entryId: item.entryId,
          kind: item.kind,
          type: "message",
          message: held.payload,
        });
    }
    // An operation still open when the worker went away: Pi's record of it is
    // what says the conversation was interrupted rather than finished.
    const open = state?.currentOperationId ?? null;
    const meta = open
      ? (await session.getValue(operationMeta(open), ctx))?.value
      : undefined;
    const abortedAt = new Set<string>();
    for (const id of [state?.currentOperationId, state?.lastOperationId]) {
      const result = id
        ? (await session.getValue(operationResult(id), ctx))?.value
        : undefined;
      if (result?.status === "aborted" && result.tipId)
        abortedAt.add(result.tipId);
    }
    return {
      entries,
      abortedAt,
      lane: {
        operation: open
          ? { id: open, startedAt: meta?.startedAt ?? Date.now() }
          : null,
        queues,
      },
    };
  } finally {
    await native.release();
  }
}
