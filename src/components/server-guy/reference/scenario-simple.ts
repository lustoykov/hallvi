// Simple scenario: an uptime monitor from its upstream image, embedded
// SQLite, one volume, one small instance. It shows the first deployment
// from request to verification, then protection, a domain, a night-time
// blip, a release and an unreachable host. Everything is invented.
import type { DeploymentRecord } from "@/server/deployment-types";

import {
  at,
  chat,
  liveDeployment,
  message,
  operation,
  steps,
  update,
  type ReferenceState,
} from "./data";
import type { Scenario } from "./scenario";

const APP = "ref-status";
const DEPLOY = "dep-status";
const REVISION = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4";
const NEXT_REVISION = "7d1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c";

function initial(): ReferenceState {
  const state: ReferenceState = {
    application: {
      id: APP,
      name: "Status page",
      repositoryUrl: "https://github.com/louislam/uptime-kuma",
      repositoryOwner: "louislam",
      repositoryName: "uptime-kuma",
      environment: "production",
      approvalMode: "pi-decides",
      approvalScope: "Deployment surroundings on the application host",
      createdAt: "2026-09-09T08:00:00.000Z",
      updatedAt: "2026-09-09T08:00:00.000Z",
    },
    deployment: null,
    facts: {},
    operations: [],
    chats: [],
    messages: [],
    clock: "2026-09-09T08:00:00.000Z",
  };
  chat(state, "chat-deploy", "Deploy application", { primary: true });
  message(
    state,
    "chat-deploy",
    "assistant",
    "I created Status page from louislam/uptime-kuma. It ships as an upstream image with embedded SQLite, so there is nothing to build. Tell me where you want it and I’ll recommend a server.",
    { source: "server-guy" },
  );
  return state;
}

function planned(state: ReferenceState): DeploymentRecord {
  return liveDeployment({
    id: DEPLOY,
    applicationId: APP,
    chatId: "chat-deploy",
    repository: "louislam/uptime-kuma",
    revision: REVISION,
    port: 3001,
    command: null,
    postgres: null,
    environment: [{ name: "UPTIME_KUMA_PORT", value: "3001" }],
    missingInputs: [],
    healthPath: "/api/status-page/heartbeat/default",
    checks: [{ name: "Status page", path: "/", contains: "Uptime Kuma" }],
    offer: { serverType: "cx22", monthly: 4.29, cores: 2, memory: 4 },
    address: "203.0.113.41",
    serverId: 71311,
    createdAt: "2026-09-09T08:03:00.000Z",
    verifiedAt: "2026-09-09T08:27:00.000Z",
    originMessageId: state.messages[1]?.id ?? "",
    summary:
      "Run the upstream uptime-kuma image on one small instance with its data in a persistent volume. No database service is needed: the application keeps a SQLite file.",
    events: [
      "Inspecting the repository at an exact revision",
      "Reading docker-compose.yml",
      "Deployment configuration prepared; checking current Hetzner prices",
      "Recommendation ready. No server has been purchased.",
      "Creating the accepted Hetzner instance",
      "Waiting for SSH on 203.0.113.41",
      "Preparing Docker and Compose",
      "Pulling louislam/uptime-kuma:1.23.16",
      "Starting app",
      "Passed: Status page",
      "Deployment verified",
    ],
    stack: {
      databases: [
        { kind: "sqlite", name: "kuma.db", path: "/app/data/kuma.db" },
      ],
      volumes: [
        { name: "data", usedBy: "app", mount: "/app/data", kind: "files" },
      ],
    },
  });
}

export const simpleScenario: Scenario = {
  id: "simple",
  name: "Status page",
  summary:
    "Uptime Kuma from its upstream image with embedded SQLite and one volume on a CX22. The first deployment from request to verification, then backups, a domain, a night-time blip, a release and an unreachable host.",
  initial,
  steps: [
    {
      id: "added",
      title: "Application added",
      note: "Nothing recorded yet; the stack appears as it is recorded.",
      clock: "2026-09-09T08:00:00.000Z",
      apply: () => {},
    },
    {
      id: "deploy-requested",
      title: "Deploy requested",
      note: "Read-only inspection first; nothing is bought or changed.",
      clock: "2026-09-09T08:03:00.000Z",
      apply: (state) => {
        message(
          state,
          "chat-deploy",
          "user",
          "Deploy it on the smallest server that works.",
        );
        const origin = message(
          state,
          "chat-deploy",
          "assistant",
          "I’ll inspect the exact repository revision and prepare its deployment configuration. I’ll show the server cost and any missing inputs before creating anything.",
          { source: "server-guy" },
        );
        const record = planned(state);
        record.status = "planning";
        record.originMessageId = origin.id;
        record.offer = null;
        record.authority = null;
        record.serverId = null;
        record.serverCreateAttempted = false;
        record.address = null;
        record.imageId = null;
        record.url = null;
        record.verifiedAt = null;
        record.stack = undefined;
        record.events = record.events.slice(0, 2);
        record.updatedAt = state.clock;
        state.deployment = record;
      },
    },
    {
      id: "recommendation",
      title: "Recommendation",
      note: "A priced recommendation waits in the receipt; the Deployment view points to it.",
      clock: "2026-09-09T08:06:00.000Z",
      apply: (state) => {
        const record = state.deployment!;
        record.status = "awaiting-approval";
        record.offer = {
          serverType: "cx22",
          location: "fsn1",
          cores: 2,
          memory: 4,
          monthly: 4.29,
          hourly: 0.0059,
          currency: "EUR",
        };
        record.events = planned(state).events.slice(0, 4);
        record.updatedAt = state.clock;
        message(
          state,
          "chat-deploy",
          "assistant",
          "Uptime Kuma runs from its upstream image with a SQLite file in one volume; no database service is needed. I recommend CX22 in fsn1: 2 CPUs, 4 GB RAM, approximately EUR 4.29/month including IPv4. Confirm the recommendation to prepare the host and deploy this revision.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "deploying",
      title: "Approved · deploying",
      note: "The receipt turns to steps; Deployment shows work in progress.",
      clock: "2026-09-09T08:15:00.000Z",
      apply: (state) => {
        const record = state.deployment!;
        record.status = "deploying";
        record.authority = {
          acceptedAt: state.clock,
          connectionId: "hetzner-reference",
          maxMonthly: 4.29,
        };
        record.serverId = 71311;
        record.serverCreateAttempted = true;
        record.events = planned(state).events.slice(0, 8);
        record.updatedAt = state.clock;
        message(
          state,
          "chat-deploy",
          "assistant",
          "The deployment recommendation is accepted. I’m preparing the host and deploying this exact revision; you can follow the work here.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "verified",
      title: "Deployment verified",
      note: "Facts appear: the process, the SQLite file, the volume, monitoring.",
      clock: "2026-09-09T08:27:00.000Z",
      apply: (state) => {
        const record = planned(state);
        record.originMessageId = state.deployment!.originMessageId;
        record.updatedAt = state.clock;
        state.deployment = record;
        state.facts = {
          releases: {
            serving: {
              revision: REVISION,
              message: "uptime-kuma 1.23.16 · upstream image",
              image: "louislam/uptime-kuma:1.23.16",
              deployedAt: at(state.clock, -3),
              verifiedAt: state.clock,
            },
            candidate: null,
            history: [
              {
                id: "rel-1",
                revision: REVISION,
                at: state.clock,
                outcome: "verified",
                note: "First deployment · status page check passed",
                operationId: `deployment:${DEPLOY}`,
              },
            ],
            preparation: {
              dockerfile: "reused",
              compose: "reused",
              checks: 1,
              revision: REVISION,
              detail: "Upstream image pinned by tag and digest",
            },
          },
          monitoring: {
            collector: {
              state: "running",
              lastObservationAt: state.clock,
              hostReachable: true,
              detail: "Host collector running",
            },
            checks: [
              {
                id: "http",
                name: "Status page responds",
                kind: "http",
                target: "GET /",
                state: "passing",
                lastAt: state.clock,
                detail: "200 in 38 ms",
              },
              {
                id: "app",
                name: "Web process",
                kind: "process",
                target: "app",
                state: "passing",
                lastAt: state.clock,
                detail: "Running 1 min · 0 restarts",
              },
              {
                id: "disk",
                name: "Instance disk",
                kind: "disk",
                target: "/",
                state: "passing",
                lastAt: state.clock,
                detail: "4 of 38 GB used",
              },
            ],
            resources: {
              cpuPercent: 3,
              memoryUsedMb: 410,
              memoryTotalMb: 4096,
              diskUsedGb: 4,
              diskTotalGb: 38,
              measuredAt: state.clock,
            },
            issues: [],
            providers: [],
          },
          logs: {
            streams: [{ service: "app", lines: 64, lastAt: state.clock }],
            retention: "7 days · 200 MB per service",
            snapshot: {
              at: state.clock,
              service: "all",
              lines: [
                "app | 2026-09-09T08:24:52Z [SERVER] INFO: Welcome to Uptime Kuma",
                "app | 2026-09-09T08:24:52Z [DB] INFO: SQLite Version: 3.45.1",
                "app | 2026-09-09T08:24:53Z [SERVER] INFO: Listening on 3001",
                "app | 2026-09-09T08:26:40Z [AUTH] INFO: Successfully setup the first user",
              ],
            },
          },
          database: {
            measuredAt: state.clock,
            sizeGb: 0.045,
            connections: 1,
            growthMbPerWeek: null,
            scratch: null,
          },
          storage: {
            volumes: [{ name: "data", sizeGb: 0.05, measuredAt: state.clock }],
            hostDisk: { usedGb: 4, totalGb: 38, measuredAt: state.clock },
          },
          variables: {
            variables: [
              {
                name: "UPTIME_KUMA_PORT",
                scope: "runtime",
                source: "plan",
                secret: false,
              },
            ],
            pending: [],
          },
          domains: {
            address: "http://203.0.113.41",
            domain: null,
            tls: { state: "not-configured" },
            cdn: { state: "not-configured", detail: "Not configured" },
            routes: [
              {
                host: "203.0.113.41",
                service: "app",
                port: 3001,
                protocol: "HTTP",
              },
            ],
          },
        };
        message(
          state,
          "chat-deploy",
          "assistant",
          "Your application is running at http://203.0.113.41. I verified the status page. Its data lives in a SQLite file inside a persistent volume, which survives container replacement but not losing the host; backups are not configured yet. This first deployment uses HTTP; a domain and HTTPS have not been configured.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "protect-proposed",
      title: "Backup proposal",
      note: "SQLite needs a consistent copy, not a live file copy.",
      clock: "2026-09-09T08:40:00.000Z",
      apply: (state) => {
        message(
          state,
          "chat-deploy",
          "user",
          "Back it up somewhere off the server.",
        );
        const reply = message(
          state,
          "chat-deploy",
          "assistant",
          "The only state is the SQLite file and the data volume around it, 50 MB today. I propose a nightly consistent copy of the database (through SQLite’s backup API, not a raw file copy) plus an archive of the volume, to a private bucket in your Cloudflare R2 account, kept 14 days. I need one R2 API token scoped to that bucket.",
        );
        operation(state, {
          id: "backups",
          source: "backup",
          kind: "change",
          title: "Configure nightly backups to Cloudflare R2",
          state: "proposed",
          destinations: ["backups", "database", "storage"],
          origin: { chatId: "chat-deploy", messageId: reply.id },
          summary:
            "Nightly consistent SQLite copy and volume archive to R2, kept 14 days. Nothing is applied until you approve.",
          approval: {
            note: "Creates one bucket and a nightly schedule on the host.",
            action: "Approve and set up backups",
          },
          decision: {
            kind: "approval",
            note: "Creates one private bucket, installs the nightly schedule on the host, runs the first backup now and verifies it by opening the copied database.",
            cost: "Under EUR 0.05 per month at 50 MB · one bucket in your Cloudflare account · no new servers",
            inputs: [
              {
                name: "R2 API token",
                hint: "Scoped to one bucket, object read and write only",
                secret: true,
              },
            ],
            action: "Approve and set up backups",
          },
        });
      },
    },
    {
      id: "protected",
      title: "Backups verified",
      note: "Coverage: the SQLite copy and the volume, both protected.",
      clock: "2026-09-09T08:52:00.000Z",
      apply: (state) => {
        update(state, "backups", {
          state: "verified",
          decision: null,
          summary: "Nightly at 03:00 UTC to Cloudflare R2, kept 14 days.",
          evidence:
            "46 MB consistent SQLite copy and 4 MB volume archive in R2 · the copied database opened and listed 12 monitors.",
        });
        state.facts.protection = {
          destination: {
            provider: "r2",
            bucket: "status-backups-2c1a",
            region: "EU (auto)",
            connectedAt: state.clock,
            access: "Token scoped to this bucket, object read and write",
          },
          policy: {
            schedule: "Daily at 03:00",
            timezone: "UTC",
            retention: "14 days",
            operationId: "backups",
          },
          coverage: [
            {
              key: "database:kuma.db",
              label: "SQLite · kuma.db",
              method: "consistent copy through the SQLite backup API",
              state: "protected",
              lastSuccessfulAt: state.clock,
              size: "46 MB",
            },
            {
              key: "volume:data",
              label: "Files · data",
              method: "file archive",
              state: "protected",
              lastSuccessfulAt: state.clock,
              size: "4 MB",
            },
          ],
          lastAttempt: { at: state.clock, outcome: "succeeded", size: "50 MB" },
          restoreTest: {
            at: state.clock,
            recoveryPointAt: at(state.clock, -6),
            verified: "The copied database opened and listed 12 monitors",
            operationId: "backups",
          },
          history: [
            {
              id: "h-1",
              at: state.clock,
              kind: "restore-test",
              outcome: "succeeded",
              detail: "Copied database opened · 12 monitors",
              operationId: "backups",
            },
            {
              id: "h-2",
              at: at(state.clock, -6),
              kind: "backup",
              outcome: "succeeded",
              detail: "First backup · 46 MB copy · 4 MB archive",
              operationId: "backups",
            },
            {
              id: "h-3",
              at: at(state.clock, -11),
              kind: "policy",
              outcome: "succeeded",
              detail: "Nightly at 03:00 UTC · 14 days · Cloudflare R2",
              operationId: "backups",
            },
          ],
        };
        state.facts.monitoring!.checks.push({
          id: "backup",
          name: "Nightly backup",
          kind: "backup",
          target: "R2 · status-backups-2c1a",
          state: "passing",
          lastAt: state.clock,
          detail: "First backup verified",
        });
        message(
          state,
          "chat-deploy",
          "assistant",
          "Done. The first backup is in R2 and I opened the copied database to check it: 12 monitors. The nightly schedule runs on the host at 03:00 UTC.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "domain-requested",
      title: "Domain requested",
      note: "One DNS step for you; Server Guy does the rest.",
      clock: "2026-09-09T09:05:00.000Z",
      apply: (state) => {
        chat(state, "chat-domain", "Domain and HTTPS");
        message(
          state,
          "chat-domain",
          "user",
          "I want it at status.example.dev with HTTPS.",
        );
        const reply = message(
          state,
          "chat-domain",
          "assistant",
          "I’ve prepared the route and the certificate request; they complete as soon as status.example.dev resolves here. Add an A record for status.example.dev to 203.0.113.41 at your DNS provider and I’ll take it from there.",
        );
        operation(state, {
          id: "domain",
          source: "domain",
          kind: "change",
          title: "Serve status.example.dev with HTTPS",
          state: "working",
          destinations: ["domains"],
          origin: { chatId: "chat-domain", messageId: reply.id },
          summary:
            "Route prepared and certificate requested; waiting for the DNS record you add.",
          steps: steps(
            [
              "Prepare the route on the host",
              "Wait for status.example.dev to resolve here",
              "Issue the certificate",
              "Verify HTTPS",
            ],
            1,
          ),
        });
        state.facts.domains = {
          address: "http://203.0.113.41",
          domain: {
            name: "status.example.dev",
            provider: "external",
            state: "pending-dns",
            detail: "Server Guy checks every minute.",
            userStep:
              "Add an A record at your DNS provider: status.example.dev → 203.0.113.41.",
          },
          tls: {
            state: "pending",
            detail:
              "Requested from Let’s Encrypt; issues once the name resolves",
          },
          cdn: {
            state: "not-useful",
            detail: "Not useful here: a small dynamic page",
          },
          routes: [
            {
              host: "203.0.113.41",
              service: "app",
              port: 3001,
              protocol: "HTTP",
            },
          ],
        };
      },
    },
    {
      id: "https",
      title: "HTTPS live",
      note: "Certificate, renewal and redirect recorded as facts.",
      clock: "2026-09-09T09:30:00.000Z",
      apply: (state) => {
        update(state, "domain", {
          state: "verified",
          steps: undefined,
          summary: "https://status.example.dev serves the application.",
          evidence:
            "Certificate from Let’s Encrypt valid until 8 December · renewal automatic · HTTP redirects to HTTPS.",
        });
        state.facts.domains = {
          address: "https://status.example.dev",
          domain: {
            name: "status.example.dev",
            provider: "external",
            state: "resolving",
            detail: "Resolves to 203.0.113.41 · HTTP redirects to HTTPS",
          },
          tls: {
            state: "valid",
            issuer: "Let’s Encrypt",
            expiresAt: "2026-12-08T09:29:00.000Z",
            renewal: "Renews automatically 30 days before expiry",
            detail: null,
          },
          cdn: {
            state: "not-useful",
            detail: "Not useful here: a small dynamic page",
          },
          routes: [
            {
              host: "status.example.dev",
              service: "app",
              port: 3001,
              protocol: "HTTPS",
            },
            {
              host: "203.0.113.41",
              service: "app",
              port: 3001,
              protocol: "HTTP → HTTPS redirect",
            },
          ],
        };
        state.facts.monitoring!.checks[0] = {
          id: "http",
          name: "Status page responds",
          kind: "http",
          target: "GET https://status.example.dev/",
          state: "passing",
          lastAt: state.clock,
          detail: "200 in 44 ms over TLS",
        };
        state.facts.monitoring!.checks.push({
          id: "cert",
          name: "Certificate valid",
          kind: "certificate",
          target: "status.example.dev",
          state: "passing",
          lastAt: state.clock,
          detail: "89 days left",
        });
        state.facts.monitoring!.collector.lastObservationAt = state.clock;
        message(
          state,
          "chat-domain",
          "assistant",
          "https://status.example.dev is live with a Let’s Encrypt certificate that renews itself. HTTP redirects to HTTPS.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "blip",
      title: "Down at night",
      note: "A check fails while nobody is watching; an issue is recorded.",
      clock: "2026-09-10T02:14:00.000Z",
      apply: (state) => {
        operation(state, {
          id: "down",
          source: "check",
          kind: "inspection",
          title: "Status page not responding",
          state: "failed",
          destinations: ["monitoring", "processes"],
          origin: null,
          summary:
            "The HTTPS check failed twice in a row; the web process was not running.",
          next: "Investigate to see why the process stopped.",
        });
        const monitoring = state.facts.monitoring!;
        monitoring.collector.lastObservationAt = state.clock;
        monitoring.checks[0].state = "failing";
        monitoring.checks[0].detail = "Connection refused · 2 failures";
        monitoring.checks[0].lastAt = state.clock;
        monitoring.checks[1].state = "failing";
        monitoring.checks[1].detail = "Not running since 02:13";
        monitoring.checks[1].lastAt = state.clock;
        monitoring.issues.unshift({
          id: "issue-down",
          title: "Status page not responding",
          impact:
            "The status page is unreachable; monitors it runs are paused while it is down.",
          detectedAt: state.clock,
          state: "open",
          evidence:
            "GET https://status.example.dev/ refused at 02:13:40 and 02:14:10 · the app container is not running · the instance rebooted at 02:12 (kernel update).",
          next: "Docker’s restart policy should bring the process back; if it does not within a minute, investigate.",
          source: { kind: "check", id: "http" },
          operationId: "down",
          unread: true,
        });
      },
    },
    {
      id: "recovered-blip",
      title: "Back on its own",
      note: "Recovered automatically; the issue keeps the gap and stays unread until you look.",
      clock: "2026-09-10T02:16:00.000Z",
      apply: (state) => {
        operation(state, {
          id: "restart",
          source: "check",
          kind: "change",
          title: "Web process restarted",
          state: "verified",
          destinations: ["processes", "monitoring"],
          origin: null,
          summary:
            "Docker’s restart policy started the web process again after the instance rebooted for a kernel update.",
          evidence:
            "Process up since 02:15:12 · status page answered 200 at 02:15:40 · 2 minutes 12 seconds unavailable.",
        });
        update(state, "down", { resolvedById: "restart" });
        const monitoring = state.facts.monitoring!;
        monitoring.collector.lastObservationAt = state.clock;
        monitoring.checks[0].state = "passing";
        monitoring.checks[0].detail = "200 in 41 ms · recovered 02:15";
        monitoring.checks[0].lastAt = state.clock;
        monitoring.checks[1].state = "passing";
        monitoring.checks[1].detail = "Running 1 min · 1 restart";
        monitoring.checks[1].lastAt = state.clock;
        const found = monitoring.issues.find(
          (item) => item.id === "issue-down",
        )!;
        found.state = "recovered";
        found.recoveredAt = state.clock;
        found.evidence =
          "The instance rebooted at 02:12 for a kernel update; Docker restarted the process at 02:15. 2 minutes 12 seconds unavailable.";
        found.operationId = "restart";
      },
    },
    {
      id: "candidate",
      title: "A new revision is available",
      note: "Offered in Deployment; nothing deploys on push.",
      clock: "2026-09-10T09:00:00.000Z",
      apply: (state) => {
        state.facts.releases!.candidate = {
          revision: NEXT_REVISION,
          message: "uptime-kuma 1.23.17 · notification provider fixes",
          author: "louislam",
          pushedAt: at(state.clock, -180),
          ci: {
            state: "passed",
            detail:
              "Upstream release · image louislam/uptime-kuma:1.23.17 published",
          },
          image: "louislam/uptime-kuma:1.23.17",
        };
        operation(state, {
          id: "candidate",
          source: "release",
          kind: "inspection",
          title: "Release candidate 1.23.17 detected",
          state: "inspected",
          destinations: ["deployment"],
          origin: null,
          summary:
            "A newer upstream image is available. Nothing deploys on push; Deployment offers it.",
          evidence:
            "Upstream release 1.23.17 published 3 hours ago · no migration notes.",
        });
        state.facts.monitoring!.collector.lastObservationAt = state.clock;
      },
    },
    {
      id: "release-requested",
      title: "Release requested",
      note: "Approve once; the release is verified before it counts.",
      clock: "2026-09-10T09:12:00.000Z",
      apply: (state) => {
        message(state, "chat-deploy", "user", "Update to 1.23.17.");
        const reply = message(
          state,
          "chat-deploy",
          "assistant",
          "1.23.17 is an upstream release with no migration notes. I’ll pull the image, restart the process and verify the status page; about 20 seconds unavailable. Review the release below.",
        );
        operation(state, {
          id: "release",
          source: "release",
          kind: "change",
          title: "Release 1.23.17",
          state: "proposed",
          destinations: ["deployment", "processes"],
          origin: { chatId: "chat-deploy", messageId: reply.id },
          summary:
            "Pull 1.23.17, restart and verify. Not applied until you approve.",
          approval: {
            note: "About 20 seconds unavailable.",
            action: "Approve the release",
          },
          decision: {
            kind: "approval",
            note: "Pulls louislam/uptime-kuma:1.23.17, restarts the process and verifies the status page. The previous image is kept for rollback.",
            cost: "No new resources · about 20 seconds unavailable",
            inputs: [],
            action: "Approve the release",
          },
        });
      },
    },
    {
      id: "released",
      title: "Release verified",
      note: "Serving changes only after verification.",
      clock: "2026-09-10T09:20:00.000Z",
      apply: (state) => {
        update(state, "release", {
          state: "verified",
          decision: null,
          summary: "1.23.17 is serving.",
          evidence:
            "Status page passed on 1.23.17 · 18 seconds unavailable · 12 monitors resumed.",
        });
        const releases = state.facts.releases!;
        releases.serving = {
          revision: NEXT_REVISION,
          message: "uptime-kuma 1.23.17 · notification provider fixes",
          image: "louislam/uptime-kuma:1.23.17",
          deployedAt: at(state.clock, -1),
          verifiedAt: state.clock,
        };
        releases.candidate = null;
        releases.history.unshift({
          id: "rel-2",
          revision: NEXT_REVISION,
          at: state.clock,
          outcome: "verified",
          note: "Release 1.23.17 · check passed",
          operationId: "release",
        });
        state.deployment!.revision = NEXT_REVISION;
        state.deployment!.imageId = "louislam/uptime-kuma:1.23.17";
        state.deployment!.verifiedAt = state.clock;
        state.deployment!.updatedAt = state.clock;
        state.facts.monitoring!.collector.lastObservationAt = state.clock;
        message(
          state,
          "chat-deploy",
          "assistant",
          "1.23.17 is serving and verified; the status page was unavailable for 18 seconds and its monitors resumed.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "host-unreachable",
      title: "Host unreachable",
      note: "Stale is stale; nothing is inferred from silence.",
      clock: "2026-09-10T14:02:00.000Z",
      apply: (state) => {
        operation(state, {
          id: "host-down",
          source: "check",
          kind: "inspection",
          title: "Instance unreachable",
          state: "failed",
          destinations: ["monitoring"],
          origin: null,
          summary:
            "The controller cannot reach 203.0.113.41. The last observation was at 13:58; whether the page is serving is unknown.",
          next: "Server Guy keeps trying and asks Hetzner for the instance status.",
        });
        const monitoring = state.facts.monitoring!;
        monitoring.collector = {
          state: "stale",
          lastObservationAt: at(state.clock, -4),
          hostReachable: false,
          detail: "Host unreachable from the controller since 14:00",
        };
        monitoring.checks.forEach((check) => {
          if (check.kind !== "backup") {
            check.state = "unknown";
            check.detail = "No observation since 13:58";
          }
        });
        monitoring.issues.unshift({
          id: "issue-host",
          title: "Instance unreachable",
          impact:
            "Unknown whether status.example.dev is serving; the controller cannot observe the host.",
          detectedAt: state.clock,
          state: "open",
          evidence:
            "SSH and HTTPS to 203.0.113.41 time out since 14:00:12 · Hetzner reports the instance as running · last observation 13:58.",
          next: "Wait for the host to answer or investigate the Hetzner status.",
          source: { kind: "host", id: "host" },
          operationId: "host-down",
          unread: true,
        });
      },
    },
    {
      id: "host-back",
      title: "Host back",
      note: "Recovered with the gap recorded.",
      clock: "2026-09-10T14:19:00.000Z",
      apply: (state) => {
        update(state, "host-down", {
          state: "inspected",
          summary:
            "The instance answered again at 14:17 after a 17-minute network interruption on Hetzner’s side.",
          next: undefined,
          evidence:
            "Hetzner status: network maintenance in fsn1 from 13:59 to 14:16 · the collector’s local history has no gap.",
        });
        const monitoring = state.facts.monitoring!;
        monitoring.collector = {
          state: "running",
          lastObservationAt: at(state.clock, -1),
          hostReachable: true,
          detail:
            "Host collector running · 17 minutes without controller observation",
        };
        monitoring.checks.forEach((check) => {
          if (check.state === "unknown") {
            check.state = "passing";
            check.lastAt = at(state.clock, -1);
            check.detail = "Recovered at 14:17";
          }
        });
        const found = monitoring.issues.find(
          (item) => item.id === "issue-host",
        )!;
        found.state = "recovered";
        found.recoveredAt = state.clock;
      },
    },
  ],
};
