import type {
  ConnectionAction,
  ConnectionItem,
} from "@/components/server-guy/connections-screen";
import type { CloudflareConnection } from "./cloudflare";

/** Just enough of an application for a link to name the one it opens. */
export interface ConnectionApplication {
  id: string;
  name: string;
}

export interface ConnectionFacts {
  hetznerConnected: boolean;
  cloudflare: CloudflareConnection;
  /** R2 buckets the management token can see, or null when it could not ask. */
  buckets: number | null;
  storage:
    | { connected: false }
    | { connected: true; provider: "r2" | "s3"; bucket: string; host: string };
  /** What is still missing before an object can be written to a bucket. */
  uploadGaps: string[];
  applications: ConnectionApplication[];
}

/**
 * Where a row sends a reader whose next step happens inside an application.
 *
 * Every one of these rows used to link to the applications list with a label
 * that promised a conversation, which meant the reader arrived somewhere that
 * offered them the same page again. Worse, the honest-looking fix — open the
 * first application — decides for them which of their systems this token is
 * about. So: name the application when there is exactly one, offer the list
 * when there are several, and when there are none say so rather than send
 * them to an empty page.
 */
function inApplication(
  applications: ConnectionApplication[],
  label: string,
  hash = "",
): { action: ConnectionAction; note?: string } {
  if (applications.length === 0)
    return {
      action: {
        kind: "link",
        href: "/applications/new",
        label: "Add application",
      },
      note: "There are no applications yet, and Server Guy will not choose one for you. Add one and this becomes part of its conversation.",
    };
  if (applications.length === 1) {
    const only = applications[0]!;
    return {
      action: {
        kind: "link",
        href: `/applications/${only.id}${hash}`,
        label: `${label} in ${only.name}`,
      },
    };
  }
  return {
    action: {
      kind: "link",
      href: "/applications",
      label: "Choose an application",
    },
    note: `${applications.length} applications use this connection, so the one to work in is yours to pick.`,
  };
}

/**
 * The Connections inventory: one row per account Server Guy acts through,
 * each with the single action that actually moves the reader forward.
 *
 * The two credentials Cloudflare issues stay separate rows on purpose. The
 * management token lists and creates R2 buckets through Cloudflare's own API;
 * writing a backup object into one needs an S3 access key pair, which is a
 * different credential obtained in a different place. A green tick on the
 * first says nothing about the second, and the rows say so.
 */
export function connectionRows(facts: ConnectionFacts): ConnectionItem[] {
  const { cloudflare, storage } = facts;
  const hetznerTarget = inApplication(facts.applications, "Manage servers");
  const cloudflareTarget = inApplication(facts.applications, "Use", "#domains");
  const storageTarget = inApplication(
    facts.applications,
    "Backups",
    "#backups",
  );
  return [
    {
      id: "hetzner",
      name: "Hetzner Cloud",
      purpose: "Buying and inspecting the servers your applications run on.",
      state: facts.hetznerConnected ? "connected" : "not-connected",
      detail: facts.hetznerConnected
        ? "A controller-held API token. Server Guy chooses sizes and regions and shows the cost before buying."
        : "Not connected. Server Guy cannot prepare a server without it.",
      // Presence is useful; characters from the credential are not.
      credential: facts.hetznerConnected ? "Controller token configured" : null,
      ...(facts.hetznerConnected
        ? hetznerTarget
        : {
            action: {
              kind: "form",
              form: "hetzner",
              label: "Connect",
            } as const,
          }),
    },
    {
      id: "cloudflare",
      name: "Cloudflare",
      purpose:
        "Reading the names and DNS records in front of your applications, and the R2 buckets on the account.",
      state: cloudflare.connected
        ? "connected"
        : cloudflare.configured
          ? "failed"
          : "not-connected",
      detail:
        cloudflare.error ??
        `The token is ${cloudflare.status}. Cloudflare was asked, not assumed.`,
      credential: cloudflare.connected
        ? [
            cloudflare.account
              ? `Account ${cloudflare.account.slice(0, 8)}…`
              : "No account id configured",
            facts.buckets === null
              ? null
              : `${facts.buckets} R2 buckets visible`,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
      usedBy: cloudflare.connected ? ["Domains", "CDN"] : undefined,
      ...(cloudflare.connected
        ? cloudflareTarget
        : {
            action: {
              kind: "form",
              form: "cloudflare",
              label: cloudflare.configured ? "Replace the token" : "Connect",
            } as const,
          }),
    },
    // Kept as its own row because the distinction costs an afternoon when
    // it is missed: managing R2 and writing to R2 are different
    // credentials, and Cloudflare issues them separately.
    {
      id: "r2-uploads",
      name: "Backup storage",
      purpose:
        "Writing backup copies into a bucket: your application's data, and Server Guy's own records and keys.",
      state: storage.connected ? "connected" : "not-connected",
      detail: storage.connected
        ? `${storage.provider === "r2" ? "Cloudflare R2" : "Amazon S3"} at ${storage.host}. Server Guy copies its own records here automatically; application backups are arranged in the conversation.`
        : cloudflare.connected
          ? `The Cloudflare token above manages R2 through the management API. It is not an S3 credential, so it cannot put an object in a bucket. That still needs: ${facts.uploadGaps.join(", ").toLowerCase()}.`
          : "Not connected, and it is a separate credential from the Cloudflare API token.",
      credential: storage.connected ? `Key scoped to ${storage.bucket}` : null,
      usedBy: storage.connected ? ["Backups"] : undefined,
      ...(storage.connected
        ? storageTarget
        : {
            action: {
              kind: "form",
              form: "backup-storage",
              label: "Connect",
            } as const,
          }),
    },
  ];
}
