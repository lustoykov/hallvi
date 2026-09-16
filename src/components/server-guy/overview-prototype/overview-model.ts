// PROTOTYPE · claude/architecture-directions · throwaway.
// What Overview says, derived from the Architecture model and the live
// record. What needs you is only what is real: a failure, an approval, a
// failed copy. Ideas that would make it sturdier are optional and phrased as
// what you would gain. Vital signs are the few things people check.

import type {
  ApplicationOperation,
  OperationState,
} from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import { attentionItems, labelOf, recentOperations } from "../operation-model";
import {
  ago,
  type ArchitectureModel,
  type Certainty,
  type Fact,
} from "../architecture-prototype/model";

const DAY = 86_400_000;

export interface NeedItem {
  id: string;
  /** The part it is about, to show where it is. */
  partId?: string;
  tone: "failed" | "waiting";
  title: string;
  detail: string;
  invented?: boolean;
  primary: { label: string; draft?: string; open?: () => void };
  secondary?: { label: string; destination: ApplicationSection };
}

export interface Idea {
  id: string;
  /** What you would gain, not what is wrong. */
  title: string;
  detail: string;
  draft: string;
  destination: ApplicationSection;
}

export interface Vital {
  id: "checks" | "backups" | "server" | "access";
  label: string;
  value: string;
  status: { certainty: Certainty; text: string };
  lines: string[];
  /** The next scheduled copy, for a live countdown. */
  countdownTo?: string | null;
  plain: string;
  facts: Fact[];
  destination: ApplicationSection;
  ask: string;
}

export interface RecentItem {
  id: string;
  title: string;
  state: OperationState;
  when: string;
  from: string | null;
  open: (() => void) | null;
}

export interface Overview {
  headline: string;
  needs: NeedItem[];
  ideas: Idea[];
  vitals: Vital[];
  recent: RecentItem[];
}

const word: Record<Certainty, string> = {
  verified: "Verified",
  stale: "Out of date",
  failed: "Failed",
  warning: "Limited",
  planned: "Planned",
  unknown: "Not observed",
  absent: "Not set up",
};

export function buildOverview({
  model,
  operations,
  chats,
  onOpenConversation,
}: {
  model: ArchitectureModel;
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  onOpenConversation: (chatId: string, messageId: string | null) => void;
}): Overview {
  const now = model.now;
  const planned = model.status !== "live";
  const conversation = (chatId: string) =>
    chats.find((chat) => chat.id === chatId)?.title ?? "its conversation";
  const openOrigin = (operation: ApplicationOperation) =>
    operation.origin
      ? () =>
          onOpenConversation(
            operation.origin!.chatId,
            operation.origin!.messageId,
          )
      : null;

  // ---- What needs you: only what is real.
  const needs: NeedItem[] = [];
  for (const part of model.parts) {
    if (part.evidence.certainty !== "failed") continue;
    needs.push({
      id: `part:${part.id}`,
      partId: part.id,
      tone: "failed",
      title: `${part.name} isn't answering`,
      detail: part.evidence.detail,
      invented: part.evidence.invented,
      primary: {
        label: "Ask Server Guy to look into it",
        draft: `Investigate why ${part.name} isn't answering.`,
      },
      secondary: part.destination
        ? {
            label: `Open ${labelOf(part.destination)}`,
            destination: part.destination,
          }
        : undefined,
    });
  }
  if (!planned) {
    for (const operation of attentionItems(operations)) {
      const waiting = operation.state === "proposed";
      const open = openOrigin(operation);
      needs.push({
        id: `operation:${operation.id}`,
        tone: waiting ? "waiting" : "failed",
        title: waiting
          ? `${operation.title} is waiting for your approval`
          : `${operation.title} stopped`,
        detail: waiting
          ? (operation.approval?.note ?? operation.summary)
          : (operation.next ?? operation.summary),
        primary: open
          ? { label: `Open ${conversation(operation.origin!.chatId)}`, open }
          : {
              label: "Ask Server Guy",
              draft: `What happened with “${operation.title}”, and what should I do?`,
            },
      });
    }
  }

  // ---- Ideas: optional, phrased as what you would gain.
  const ideas: Idea[] = [];
  if (!planned) {
    if (model.byId.offsite?.evidence.certainty === "absent")
      ideas.push({
        id: "backups",
        title: "Keep a copy off the server",
        detail:
          "Nothing copies your data off the server yet. A nightly copy means losing the server doesn't mean losing the data.",
        draft: `Set up nightly backups for ${model.headline}.`,
        destination: "backups",
      });
    for (const gap of model.gaps)
      ideas.push(
        gap.id === "tls"
          ? {
              id: "tls",
              title: `Open ${model.headline} from anywhere`,
              detail:
                "A domain with HTTPS would let you reach it without being on your network, and keep what you type private on the way.",
              draft: `Set up a domain with HTTPS for ${model.headline}.`,
              destination: "domains",
            }
          : {
              id: "monitoring",
              title: "Hear about problems as they happen",
              detail: `A watcher outside the server would check ${model.headline} every minute and tell you when it stops answering.`,
              draft: `Watch ${model.headline} continuously and tell me when something fails.`,
              destination: "monitoring",
            },
      );
    if (model.restoreAt && now - Date.parse(model.restoreAt) > 30 * DAY)
      ideas.push({
        id: "restore",
        title: "Prove the backups still restore",
        detail: `The last restore test was ${ago(model.restoreAt, now)}. A fresh one shows the copies still work.`,
        draft: "Run a restore test of the latest backup.",
        destination: "backups",
      });
  }

  const counts = [
    "",
    "One thing needs",
    "Two things need",
    "Three things need",
  ];
  const headline = planned
    ? model.status === "none"
      ? "Nothing is deployed yet."
      : "Waiting for your approval."
    : needs.length
      ? `${counts[needs.length] ?? `${needs.length} things need`} you.`
      : model.condition.certainty === "stale"
        ? "Nothing needed you when Server Guy last looked."
        : "Nothing needs you.";

  // ---- Vital signs.
  const app = model.byId.app;
  const service = model.parts.find((part) => part.kind === "private");
  const host = model.byId.host;
  const offsite = model.byId.offsite;
  const gate = model.byId["gate:http"];
  const checked = [app, service].filter(
    (part): part is NonNullable<typeof part> => Boolean(part),
  );
  const failing = checked.find((part) => part.evidence.certainty === "failed");
  const names = checked.map((part) => part.name).join(" and ");

  const vitals: Vital[] = [
    {
      id: "checks",
      label: "Checks",
      value: planned ? "After deployment" : ago(app?.evidence.at ?? null, now),
      status: {
        certainty: failing ? "failed" : (app?.evidence.certainty ?? "unknown"),
        text: app?.checking
          ? "Checking…"
          : word[failing ? "failed" : (app?.evidence.certainty ?? "unknown")],
      },
      lines: planned
        ? ["Server Guy checks once it deploys"]
        : failing
          ? [`${failing.name} isn't answering`]
          : app?.evidence.certainty === "stale"
            ? [`${names} answered, nothing since`]
            : [`${names} answered`],
      plain: `Server Guy checks ${app?.name ?? "the application"}'s health page${service ? ` and ${service.name}'s readiness` : ""} when it deploys and whenever you ask. Nothing checks in between.`,
      facts: [host, app, service]
        .filter((part): part is NonNullable<typeof part> => Boolean(part))
        .map((part) => ({
          label: part.name,
          value: part.checking ? "Checking…" : part.evidence.short,
        })),
      destination: "processes",
      ask: `Re-check ${model.headline} and tell me what you find.`,
    },
    {
      id: "backups",
      label: "Backups",
      value: planned
        ? "After deployment"
        : word[offsite?.evidence.certainty ?? "absent"],
      status: {
        certainty: offsite?.evidence.certainty ?? "absent",
        text:
          offsite?.evidence.certainty === "verified"
            ? "Copy verified"
            : word[offsite?.evidence.certainty ?? "absent"],
      },
      lines: planned
        ? ["Nightly copies start after deployment"]
        : [
            model.restoreAt
              ? `Restore tested ${ago(model.restoreAt, now)}`
              : "Restore never tested",
          ],
      plain:
        "Every night Server Guy copies the data off the server and checks the copy by size and checksum. A restore test proves a copy comes back.",
      facts: [],
      destination: "backups",
      ask: "Tell me how the backups are doing.",
    },
    {
      id: "server",
      label: "Server",
      value: host?.name ?? "Not chosen",
      status: {
        certainty: host?.evidence.certainty ?? "planned",
        text: host?.checking
          ? "Checking…"
          : (host?.evidence.short ?? "Planned"),
      },
      lines: [model.region ?? ""].filter(Boolean),
      plain: host?.plain ?? "",
      facts: host?.facts.slice(0, 4) ?? [],
      destination: host?.destination ?? "deployment",
      ask: `Tell me about the server ${model.headline} runs on.`,
    },
    {
      id: "access",
      label: "Access",
      value: planned
        ? "After deployment"
        : model.restricted
          ? "Your network only"
          : "Anyone",
      status: {
        certainty: gate?.evidence.certainty ?? "unknown",
        text: gate?.checking
          ? "Checking…"
          : (gate?.evidence.short ?? "Not observed"),
      },
      lines: [
        model.byId.tls?.evidence.certainty === "absent"
          ? "HTTP · no HTTPS yet"
          : "HTTPS",
      ].filter(Boolean),
      plain: gate?.plain ?? "",
      facts: gate?.facts.slice(0, 4) ?? [],
      destination: "security",
      ask: `Who can reach ${model.headline}, and how?`,
    },
  ];

  const recent: RecentItem[] = planned
    ? []
    : recentOperations(operations)
        .slice(0, 4)
        .map((operation) => ({
          id: operation.id,
          title: operation.title,
          state: operation.state,
          when: ago(operation.updatedAt, now),
          from: operation.origin ? conversation(operation.origin.chatId) : null,
          open: openOrigin(operation),
        }));

  return { headline, needs, ideas, vitals, recent };
}
