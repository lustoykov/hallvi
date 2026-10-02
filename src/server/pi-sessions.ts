import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  createRegistry,
  Harness,
  InboxDoc,
  LiveDoc,
  ROOT_CONVERSATION_ID,
  type Conversation,
  type EntryRecord,
  type HarnessOptions,
  type InboxState,
  type LiveState,
  type Storage,
  type SubmissionRecord,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { databasePath, getChat } from "./db";

// Only the worker calls into this file. It is the one owner of conversation
// storage: the app asks it over the worker link and never opens a history.
const RECOVERY_MESSAGE =
  "Conversation history unavailable. Start a new chat to continue.";
const ctx = BACKGROUND_CONTEXT;

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

async function ownedChat(applicationId: string, chatId: string) {
  validatedId(applicationId);
  validatedId(chatId);
  const chat = await getChat(chatId);
  if (!chat || chat.applicationId !== applicationId)
    throw new NativeSessionError("not-found", "Conversation not found.");
  return chat;
}

function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
  chmodSync(path, 0o700);
  return path;
}

function storageRoot() {
  return join(realpathSync(dirname(databasePath())), "pi-sessions");
}

/** The file Pi keeps one conversation in: `<application>/<chat>/`. */
const STORE = "conversation.sqlite";
function storePath(scope: ConversationScope) {
  return join(
    storageRoot(),
    validatedId(scope.applicationId),
    validatedId(scope.chatId),
    STORE,
  );
}

export interface ConversationScope {
  applicationId: string;
  chatId: string;
}

/** Whether Pi has ever been handed anything in this conversation. */
export function hasConversation(scope: ConversationScope) {
  return existsSync(storePath(scope));
}

/** Pi's records of one conversation, opened by the worker and nobody else. */
export interface OpenConversation {
  harness: Harness;
  conversation: Conversation;
  /** Read what Pi holds. Starts nothing: a read never resumes work. */
  read(): Promise<StoredConversation>;
  close(): Promise<void>;
}

/** What Pi durably holds of a conversation, as one consistent reading. */
export interface StoredConversation {
  /**
   * The whole history, oldest first: a compaction shortens only what the
   * model is sent.
   */
  entries: EntryRecord[];
  /** Every message Pi was handed, with how its run ended. */
  submissions: SubmissionRecord[];
  live: LiveState;
  inbox: InboxState;
  /** Tasks Pi has not finished, whether or not anything is running them. */
  tasks: number;
}

async function all<T>(
  page: (cursor: Parameters<Storage["scanEntries"]>[2]) => Promise<{
    items: readonly T[];
    next?: Parameters<Storage["scanEntries"]>[2];
  }>,
) {
  const items: T[] = [];
  let cursor: Parameters<Storage["scanEntries"]>[2];
  do {
    const read = await page(cursor);
    items.push(...read.items);
    cursor = read.next;
  } while (cursor);
  return items;
}

/**
 * Open one conversation's store. `runtime` is what Pi works with: left out,
 * the conversation can be read and stopped and nothing else — no model, no
 * credentials, no tools, which is all a reader or a Stop needs.
 *
 * One store holds one conversation on purpose. Pi's scheduler is one switch
 * for a whole store, so a second conversation beside it would be resumed by
 * anything asked of the first.
 */
export async function openConversation(
  scope: ConversationScope,
  runtime?: Omit<HarnessOptions, "env">,
): Promise<OpenConversation> {
  await ownedChat(scope.applicationId, scope.chatId);
  const path = storePath(scope);
  try {
    privateDirectory(storageRoot());
    privateDirectory(dirname(dirname(path)));
    privateDirectory(dirname(path));
    // Looked at before anything is opened: a link is never followed out of
    // the conversation's own directory.
    const found = lstatSync(path, { throwIfNoEntry: false });
    if (found && (!found.isFile() || found.isSymbolicLink()))
      throw unavailable();
    // Created private before SQLite sees it: its journal files take the
    // mode of the file they belong to.
    if (!found) closeSync(openSync(path, "ax", 0o600));
    chmodSync(path, 0o600);
    const storage = await openNodeSqliteStorage(path);
    let harness: Harness;
    try {
      harness = await Harness.open(
        storage,
        runtime ?? { models: createModels(), registry: createRegistry() },
        ctx,
      );
    } catch (cause) {
      await storage.close(ctx).catch(() => undefined);
      throw cause;
    }
    try {
      const conversation = await harness.root(ctx);
      const id = ROOT_CONVERSATION_ID;
      return {
        harness,
        conversation,
        async read() {
          const { tasks } = await harness.inspect(ctx);
          // One reading, on Pi's own line of commits: a reply and the record
          // that says it is finished are never read from either side of the
          // commit that wrote them. The transaction writes nothing.
          return harness.commit(async (tx) => {
            const entries = await all((cursor) =>
              storage.scanEntries({ conversationId: id }, 512, cursor, ctx),
            );
            const submissions = await all((cursor) =>
              storage.scanSubmissions({ conversationId: id }, 512, cursor, ctx),
            );
            // A document read inside a transaction is a live view of it, and
            // is dead once the transaction ends: copied here.
            const copy = <T>(value: T) =>
              JSON.parse(JSON.stringify(value)) as T;
            return {
              // Pi scans newest first.
              entries: entries.reverse(),
              submissions,
              live: copy<LiveState>(await tx.doc(LiveDoc, id)),
              inbox: copy<InboxState>(await tx.doc(InboxDoc, id)),
              tasks: tasks.length,
            };
          }, ctx);
        },
        // Closing aborts nothing durable: Pi keeps unfinished work as it is.
        close: () => harness.close(ctx),
      };
    } catch (cause) {
      await harness.close(ctx).catch(() => undefined);
      throw cause;
    }
  } catch (cause) {
    throw cause instanceof NativeSessionError ? cause : unavailable(cause);
  }
}

/** Remove every history an application has. */
export function removeNativeSessions(applicationId: string) {
  rmSync(join(storageRoot(), validatedId(applicationId)), {
    recursive: true,
    force: true,
  });
}
