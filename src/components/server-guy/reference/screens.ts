// Fixtures for the reference screens outside the workspace: the application
// list and the connections. Invented, like everything in the prototype.
import type { ApplicationListItem } from "../applications-screen";
import type { ConnectionItem } from "../connections-screen";
import { listItem } from "./list-item";

import { stateAt } from "./engine";
import { richScenario } from "./scenario-rich";
import { simpleScenario } from "./scenario-simple";

export function referenceApplicationItems(): ApplicationListItem[] {
  const status = stateAt(simpleScenario, 4);
  const archive = stateAt(richScenario, 13);
  const archiveAtCrash = stateAt(richScenario, 11);
  return [
    {
      ...listItem(
        archive.application,
        archive.deployment,
        Date.parse(archive.clock),
      ),
      condition: { tone: "live", text: "Running · all checks passing" },
      attention: 0,
      protection: "Nightly to R2 · restore tested",
      address: "archive.example.test",
    },
    {
      ...listItem(
        status.application,
        status.deployment,
        Date.parse(status.clock),
      ),
      condition: { tone: "live", text: "Running · all checks passing" },
      protection: "Not backed up",
      address: "status.example.test",
    },
    {
      ...listItem(
        {
          ...archiveAtCrash.application,
          id: "ref-archive-staging",
          name: "Document archive · Staging",
        },
        archiveAtCrash.deployment,
        Date.parse(archiveAtCrash.clock),
      ),
      condition: { tone: "bad", text: "Worker stopped · 1 open issue" },
      attention: 1,
      protection: "Nightly to R2 · behind policy",
    },
  ];
}

export function referenceConnections(state: string): ConnectionItem[] {
  const expired = state === "expired";
  const fresh = state === "fresh";
  return [
    {
      id: "chatgpt",
      name: "ChatGPT",
      purpose:
        "The model Server Guy thinks with. Uses your ChatGPT subscription; no separate API billing.",
      state: fresh ? "not-connected" : "connected",
      detail: fresh
        ? "Not connected yet. Nothing can be planned or explained without it."
        : "Signed in · GPT-5.6 · high reasoning",
      credential: fresh ? null : "Login saved on this controller · 8 Sep",
      usedBy: fresh ? [] : ["every conversation"],
      href: "/setup/pi",
      action: fresh ? "Connect ChatGPT" : "Change",
    },
    {
      id: "github",
      name: "GitHub",
      purpose:
        "Reads repositories at exact revisions and, when you allow it, opens pull requests for small operability changes.",
      state: fresh ? "not-connected" : expired ? "expired" : "connected",
      detail: fresh
        ? "Not connected. Add an application to connect it."
        : expired
          ? "The installation token expired on 9 Sep and could not be renewed. Repository checks pause until you sign in again."
          : "Connected as example · GitHub App · renews automatically",
      credential: fresh
        ? null
        : "Installation token · read access to 2 repositories",
      usedBy: fresh ? [] : ["Document archive", "Status page"],
      href: "/setup/github",
      action: fresh ? "Connect GitHub" : expired ? "Sign in again" : "Change",
    },
    {
      id: "hetzner",
      name: "Hetzner Cloud",
      purpose:
        "Creates and reconciles the instances you approve. Connecting never buys anything; each server is approved with its price.",
      state: fresh ? "not-connected" : "connected",
      detail: fresh
        ? "Not connected. Server Guy asks for it the first time you deploy to Hetzner."
        : "Project archive-prod · 2 instances managed",
      credential: fresh ? null : "API token with read and write · added 8 Sep",
      usedBy: fresh ? [] : ["Document archive · CX23", "Status page · CX22"],
      href: "/prototype/settings/connections",
      action: fresh ? "Connect Hetzner" : "Change",
    },
    {
      id: "r2",
      name: "Cloudflare R2",
      purpose:
        "Holds off-host backups and diagnostic archives. One bucket per application, scoped tokens.",
      state: fresh ? "not-connected" : expired ? "failed" : "connected",
      detail: fresh
        ? "Not connected. Server Guy asks for it when you set up backups."
        : expired
          ? "Uploads to archive-backups-7f2e are rejected (403). Last good backup 9 Sep 09:41."
          : "2 buckets · last upload 3 min ago",
      credential: fresh ? null : "Per-bucket tokens · object read and write",
      usedBy: fresh ? [] : ["Document archive backups", "Status page backups"],
      href: "/prototype/settings/connections",
      action: fresh ? "Connect R2" : expired ? "Provide a new token" : "Change",
    },
    {
      id: "s3",
      name: "AWS S3",
      purpose:
        "An alternative backup destination when you already have an AWS account.",
      state: "not-connected",
      detail:
        "Not connected. R2 is in use; connect S3 only if you want backups there instead.",
      href: "/prototype/settings/connections",
      action: "Connect S3",
    },
    {
      id: "cloudflare-dns",
      name: "Cloudflare DNS",
      purpose:
        "Lets Server Guy add DNS records and configure caching for domains at Cloudflare, so you do not have to.",
      state: "not-connected",
      detail:
        "Not connected. Your domains are at another provider; Server Guy tells you the one record to add instead.",
      href: "/prototype/settings/connections",
      action: "Connect Cloudflare",
    },
  ];
}
