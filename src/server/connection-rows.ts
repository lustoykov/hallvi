import type {
  ConnectionAction,
  ConnectionItem,
} from "@/components/hallvi/connections-screen";
import type { CloudflareConnection } from "./cloudflare";

/** Just enough of an application for a link to name the one it opens. */
export interface ConnectionApplication {
  id: string;
  name: string;
}

/** What Hallvi itself is signed in to, as its own settings report it. */
export interface OwnAccounts {
  /** A ChatGPT login is saved. It has not necessarily been used. */
  model: { saved: boolean; issue: string | null };
  github: {
    account: string | null;
    issue: string | null;
    /** This release carries the GitHub App it would sign in through. */
    signIn: boolean;
  };
  /** Where Pi's workspace runs, and whether that choice can be met. */
  workspace: { isolation: "direct" | "docker" | null; problem: string | null };
}

export interface ConnectionFacts {
  own: OwnAccounts;
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
      note: "There are no applications yet, and Hallvi will not choose one for you. Add one and this becomes part of its conversation.",
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
 * The Connections inventory: one row per account Hallvi acts through,
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
    // Hallvi's own two accounts come first: nothing else can happen without a
    // model, and the rest of this page is about the owner's providers.
    {
      id: "chatgpt",
      name: "ChatGPT",
      purpose: "The model Hallvi thinks and replies with.",
      state: facts.own.model.issue
        ? "failed"
        : facts.own.model.saved
          ? "connected"
          : "not-connected",
      // Saved is not proven: nothing is asked of ChatGPT until a message is
      // sent, so this never claims the login works.
      detail: facts.own.model.issue
        ? facts.own.model.issue
        : facts.own.model.saved
          ? "Login saved. ChatGPT checks it when you send a message."
          : "Not connected. Hallvi cannot read, plan or reply without it.",
      credential: facts.own.model.saved
        ? "Login held by this controller"
        : null,
      // Signing in belongs here, beside the row that asked for it. Changing
      // an account that is already saved does not: that page holds the model
      // preferences and the way to sign out, and a card cannot.
      action: facts.own.model.saved
        ? { kind: "link", href: "/setup/pi", label: "Change" }
        : { kind: "form", form: "chatgpt", label: "Connect ChatGPT" },
    },
    {
      id: "github",
      name: "GitHub",
      purpose: "Reading the code of private repositories you choose.",
      state: facts.own.github.issue
        ? "failed"
        : facts.own.github.account
          ? "connected"
          : "not-connected",
      detail: facts.own.github.issue
        ? facts.own.github.issue
        : facts.own.github.account
          ? `Login saved for ${facts.own.github.account}, for the repositories you picked on GitHub.`
          : facts.own.github.signIn
            ? "Not connected. Public repositories are read without an account."
            : "This release can’t sign in to GitHub. Public repositories still work.",
      credential: facts.own.github.account
        ? "Login held by this controller · renews by itself"
        : null,
      // The grants are the App's, not this release's use of them, and the
      // owner agreed to them on GitHub: saying so here is the only place the
      // two can be compared.
      note: facts.own.github.account
        ? "The published Hallvi App holds read and write access to code and pull requests. Hallvi reads a repository, and writes only by opening a branch of its own and a pull request you review; it never writes to the branch you deploy from and never merges. Whether one application’s repository can be read is checked in its own conversation."
        : undefined,
      action: facts.own.github.account
        ? { kind: "link", href: "/setup/github", label: "Manage" }
        : {
            kind: "form",
            form: "github",
            label: facts.own.github.signIn ? "Connect GitHub" : "Why",
          },
    },
    {
      id: "workspace",
      name: "Hallvi’s workspace",
      purpose: "Where Hallvi runs the commands it composes about your code.",
      state: facts.own.workspace.problem
        ? "failed"
        : facts.own.workspace.isolation
          ? "connected"
          : "not-connected",
      detail: facts.own.workspace.problem
        ? facts.own.workspace.problem
        : facts.own.workspace.isolation === "docker"
          ? "In Docker, away from the rest of this machine."
          : facts.own.workspace.isolation === "direct"
            ? "On this computer, with the same reach as the user running Hallvi."
            : "Not chosen yet.",
      action: { kind: "link", href: "/setup/workspace", label: "Change" },
    },
    {
      id: "hetzner",
      name: "Hetzner Cloud",
      purpose: "Buying and inspecting the servers your applications run on.",
      state: facts.hetznerConnected ? "connected" : "not-connected",
      detail: facts.hetznerConnected
        ? "A controller-held API token. Hallvi chooses sizes and regions and shows the cost before buying."
        : "Not connected. Hallvi cannot prepare a server without it.",
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
        "Writing backup copies into a bucket: your application's data, and Hallvi's own records and keys.",
      state: storage.connected ? "connected" : "not-connected",
      detail: storage.connected
        ? `${storage.provider === "r2" ? "Cloudflare R2" : "Amazon S3"} at ${storage.host}. Hallvi copies its own records here automatically; application backups are arranged in the conversation.`
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
