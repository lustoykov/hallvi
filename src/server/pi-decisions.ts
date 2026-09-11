import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { Type } from "typebox";

import { db, getActiveDecision } from "./db";
import { chats, decisions, messages } from "./db-schema";
import type { Decision, PiDecision } from "./types";

export const MAX_PI_DECISION_PROPOSALS = 20;
export const PI_DECISION_PAGE_SIZE = 20;

export const proposeDecisionParameters = Type.Object(
  {
    kind: Type.Literal("launch-priority", {
      description:
        "Existing storage tag for an application-specific requirement; not a request to rank launch priorities.",
    }),
    value: Type.String({
      description:
        "A concise application-specific requirement explicitly stated by the engineer, such as a hosting budget or data-residency constraint. Not a restatement of the default goals of data protection, availability, simplicity and reasonable cost.",
      minLength: 1,
      maxLength: 300,
    }),
    replaces: Type.Optional(
      Type.String({
        description:
          "The exact UUID of an active saved Decision returned by search_decisions that this proposal replaces. Omit for an additional requirement.",
        format: "uuid",
      }),
    ),
  },
  { additionalProperties: false },
);

export const searchDecisionParameters = Type.Object(
  {
    query: Type.Optional(
      Type.String({
        description:
          "Case-insensitive literal substring of a Decision label or value. Omit to list all active saved Decisions; broaden a search if it misses relevant choices.",
      }),
    ),
    offset: Type.Optional(
      Type.Integer({
        minimum: 0,
        description:
          "Start at zero, then use nextOffset with the same query to continue.",
      }),
    ),
  },
  { additionalProperties: false },
);

// Pi validates tool argument shapes through TypeBox. These checks concern
// current application state and this Run's proposals, before staging changes.
export function collectPiDecisionProposal(
  applicationId: string,
  proposals: PiDecision[],
  input: PiDecision,
): PiDecision {
  if (proposals.length >= MAX_PI_DECISION_PROPOSALS) {
    throw new Error("Server Guy proposed more than 20 Decisions in one turn.");
  }
  const value = input.value.trim();
  if (!value) throw new Error("The Decision value is empty.");
  if (input.replaces !== undefined) {
    if (!getActiveDecision(applicationId, input.replaces)) {
      throw new Error(
        "The Decision being corrected is missing, already replaced, or belongs to another application. Use search_decisions to find the current saved Decision.",
      );
    }
    if (proposals.some((proposal) => proposal.replaces === input.replaces)) {
      throw new Error(
        "A pending proposal already replaces this Decision in the current Run; a second replacement cannot be collected.",
      );
    }
  }
  const proposal = { ...input, value };
  proposals.push(proposal);
  return proposal;
}

export interface PiDecisionSearchRecord {
  id: string;
  kind: Decision["kind"];
  label: string;
  value: string;
  createdAt: string;
  sourceMessageId: string | null;
  replaces: { id: string; value: string } | null;
}

export function searchPiDecisions(
  applicationId: string,
  proposals: readonly PiDecision[],
  input: { query?: string; offset?: number } = {},
): {
  records: PiDecisionSearchRecord[];
  nextOffset: number | null;
  activeCount: number;
  pendingCount: number;
} {
  const offset = input.offset ?? 0;
  const active = and(
    eq(decisions.applicationId, applicationId),
    isNull(decisions.supersededById),
  );
  const activeCount = db()
    .select({ count: count() })
    .from(decisions)
    .where(active)
    .get()!.count;
  const page = db()
    .select({
      id: decisions.id,
      kind: decisions.kind,
      label: decisions.label,
      value: decisions.value,
      createdAt: decisions.createdAt,
      // A legacy inconsistent source reference must not expose another app's
      // message ID. Do not return source text or follow unscoped references.
      sourceMessageId: sql<
        string | null
      >`case when ${chats.applicationId} = ${applicationId} then ${messages.id} else null end`,
    })
    .from(decisions)
    .leftJoin(messages, eq(messages.id, decisions.sourceMessageId))
    .leftJoin(chats, eq(chats.id, messages.chatId))
    .where(
      and(
        active,
        input.query === undefined
          ? undefined
          : sql`(instr(unicode_lower(${decisions.label}), unicode_lower(${input.query})) > 0 or instr(unicode_lower(${decisions.value}), unicode_lower(${input.query})) > 0)`,
      ),
    )
    .orderBy(asc(decisions.createdAt), asc(sql`${decisions}.rowid`))
    .limit(PI_DECISION_PAGE_SIZE + 1)
    .offset(offset)
    .all();
  const records = page.slice(0, PI_DECISION_PAGE_SIZE).map((record) => ({
    ...record,
    // Only one predecessor is exposed, and it must belong to this app too.
    replaces:
      db()
        .select({ id: decisions.id, value: decisions.value })
        .from(decisions)
        .where(
          and(
            eq(decisions.applicationId, applicationId),
            eq(decisions.supersededById, record.id),
          ),
        )
        .orderBy(asc(decisions.createdAt), asc(sql`${decisions}.rowid`))
        .get() ?? null,
  }));
  return {
    records,
    nextOffset:
      page.length > PI_DECISION_PAGE_SIZE
        ? offset + PI_DECISION_PAGE_SIZE
        : null,
    activeCount,
    pendingCount: proposals.length,
  };
}
