// Rich scenario: a document archive with PostgreSQL, a Valkey broker, a
// Celery worker, scheduled commands and persistent document storage on one
// Hetzner instance. Every measurement, message and outcome is invented.
import type { ApplicationFacts, Issue } from "@/server/application-facts";

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

const APP = "ref-archive";
const DEPLOY = "dep-archive";
const DEPLOYED = "2026-09-08T17:50:00.000Z";
const REVISION = "5c2e9b1d7f30a4e8c6b2d1f09a7e3c5b8d4f6a12";
const NEXT_REVISION = "a91f4d2c8e7b6a5f4d3c2b1a0e9d8c7b6a5f4e3d";

const monitoringAt = (
  clock: string,
  minutesAgo = 1,
): ApplicationFacts["monitoring"] => ({
  collector: {
    state: "running",
    lastObservationAt: at(clock, -minutesAgo),
    hostReachable: true,
    detail: "Host collector running",
  },
  checks: [
    {
      id: "http",
      name: "Web responds",
      kind: "http",
      target: "GET /api/ui_settings/",
      state: "passing",
      lastAt: at(clock, -minutesAgo),
      detail: "200 in 84 ms",
    },
    {
      id: "app",
      name: "Web process",
      kind: "process",
      target: "app",
      state: "passing",
      lastAt: at(clock, -minutesAgo),
      detail: "Running 1 day · 0 restarts",
    },
    {
      id: "worker",
      name: "Worker process",
      kind: "process",
      target: "worker",
      state: "passing",
      lastAt: at(clock, -minutesAgo),
      detail: "Running 1 day · consuming",
    },
    {
      id: "disk",
      name: "Instance disk",
      kind: "disk",
      target: "/",
      state: "passing",
      lastAt: at(clock, -minutesAgo),
      detail: "22 of 76 GB used",
    },
    {
      id: "job-sanity",
      name: "Sanity check ran",
      kind: "job",
      target: "Sanity check",
      state: "passing",
      lastAt: "2026-09-09T03:00:41.000Z",
      detail: "Succeeded in 31 s",
    },
  ],
  resources: {
    cpuPercent: 14,
    memoryUsedMb: 2210,
    memoryTotalMb: 4096,
    diskUsedGb: 22,
    diskTotalGb: 76,
    measuredAt: at(clock, -minutesAgo),
  },
  issues: [],
  providers: [],
});

function initial(): ReferenceState {
  const state: ReferenceState = {
    application: {
      id: APP,
      name: "Document archive",
      repositoryUrl: "https://github.com/example/document-archive",
      repositoryOwner: "example",
      repositoryName: "document-archive",
      createdAt: "2026-09-08T17:48:00.000Z",
      updatedAt: "2026-09-08T18:31:00.000Z",
    },
    deployment: null,
    facts: {},
    operations: [],
    chats: [],
    messages: [],
    clock: DEPLOYED,
  };
  chat(state, "chat-deploy", "Deploy application", {
    at: "2026-09-08T17:48:00.000Z",
  });
  message(
    state,
    "chat-deploy",
    "assistant",
    "I created Document archive. I’m checking access to the repository so we can work out what it needs.",
    { source: "server-guy", at: "2026-09-08T17:48:20.000Z" },
  );
  message(
    state,
    "chat-deploy",
    "user",
    "Deploy this on a small server. It needs PostgreSQL, a Redis-compatible broker for its worker and somewhere to keep the documents.",
    { at: "2026-09-08T17:50:00.000Z" },
  );
  const origin = message(
    state,
    "chat-deploy",
    "assistant",
    "I’ll inspect the exact repository revision and prepare its deployment configuration. I’ll show the server cost and any missing inputs before creating anything.",
    { source: "server-guy", at: "2026-09-08T17:50:05.000Z" },
  );
  message(
    state,
    "chat-deploy",
    "assistant",
    "The repository ships a Compose file for the archive with PostgreSQL 16, a Valkey broker and a Celery worker, plus volumes for documents, the consume inbox and exports. I’ll reuse it as is.\n\nI recommend CX23 in fsn1: 2 CPUs, 4 GB RAM, approximately EUR 5.99/month including IPv4. The worker runs OCR, so 4 GB is the sensible minimum. Confirm the recommendation to prepare the host and deploy this revision. I also need two configuration values shown in the deployment card.",
    { source: "server-guy", at: "2026-09-08T17:54:00.000Z" },
  );
  message(
    state,
    "chat-deploy",
    "assistant",
    "The deployment recommendation is accepted. I’m preparing the host and deploying this exact revision; you can follow the work here.",
    { source: "server-guy", at: "2026-09-08T18:02:00.000Z" },
  );
  message(
    state,
    "chat-deploy",
    "assistant",
    "Your application is running at http://203.0.113.24. I verified the serving revision and the application checks: Login page, API health. PostgreSQL and Valkey are private to the Compose network; documents, the consume inbox and exports use persistent volumes. Backups are not configured yet. This first deployment uses HTTP; a domain and HTTPS have not been configured.",
    { source: "server-guy", at: "2026-09-08T18:31:00.000Z" },
  );
  state.deployment = liveDeployment({
    id: DEPLOY,
    applicationId: APP,
    chatId: "chat-deploy",
    repository: "example/document-archive",
    revision: REVISION,
    image: "ghcr.io/paperless-ngx/paperless-ngx:2.14.7",
    port: 8000,
    command: null,
    postgres: "16",
    environment: [
      { name: "PAPERLESS_DBHOST", value: "postgres" },
      { name: "PAPERLESS_URL", value: "http://203.0.113.24" },
      { name: "PAPERLESS_TIME_ZONE", value: "Europe/Berlin" },
      { name: "PAPERLESS_REDIS", value: "redis://broker:6379" },
      { name: "PAPERLESS_OCR_LANGUAGE", value: "deu+eng" },
    ],
    inputs: [
      { name: "PAPERLESS_SECRET_KEY", reason: "Signs sessions at runtime" },
      { name: "PAPERLESS_ADMIN_PASSWORD", reason: "First administrator login" },
    ],
    volumes: [
      { name: "media", target: "/usr/src/paperless/media", kind: "files" },
      { name: "data", target: "/usr/src/paperless/data", kind: "files" },
      { name: "consume", target: "/usr/src/paperless/consume", kind: "files" },
      { name: "export", target: "/usr/src/paperless/export", kind: "files" },
    ],
    services: [
      {
        name: "worker",
        image: "ghcr.io/paperless-ngx/paperless-ngx:2.14.7",
        command: ["celery", "-A", "paperless", "worker", "-l", "INFO"],
      },
      { name: "broker", image: "valkey/valkey:8" },
    ],
    healthPath: "/api/ui_settings/",
    checks: [
      { name: "Login page", path: "/accounts/login/", contains: "Paperless" },
      { name: "API health", path: "/api/ui_settings/", contains: "settings" },
    ],
    offer: { serverType: "cx23", monthly: 5.99, cores: 2, memory: 4 },
    address: "203.0.113.24",
    serverId: 71204,
    createdAt: "2026-09-08T17:50:00.000Z",
    verifiedAt: "2026-09-08T18:31:00.000Z",
    originMessageId: origin.id,
    summary:
      "Deploy the document archive from its upstream image with private PostgreSQL 16 and Valkey, a Celery worker and persistent document volumes on one instance.",
    events: [
      "Inspecting the repository at an exact revision",
      "Reading docker-compose.yml",
      "Deployment configuration prepared; checking current Hetzner prices",
      "Recommendation ready. No server has been purchased.",
      "Creating the accepted Hetzner instance",
      "Waiting for SSH on 203.0.113.24",
      "Preparing Docker and Compose",
      "Pulling ghcr.io/paperless-ngx/paperless-ngx:2.14.7",
      "Starting postgres, broker, app and worker",
      "Passed: Login page",
      "Passed: API health",
      "Deployment verified",
    ],
    stack: {
      queues: [{ library: "Celery", backend: "redis", workers: ["worker"] }],
      jobs: [
        {
          name: "Sanity check",
          command: "document_sanity_checker",
          schedule: "Daily at 03:00",
          timezone: "UTC",
          runsIn: "app",
          nextRunAt: "2026-09-10T03:00:00.000Z",
          lastRun: {
            at: "2026-09-09T03:00:10.000Z",
            outcome: "succeeded",
            durationSeconds: 31,
          },
        },
        {
          name: "Rebuild search index",
          command: "document_index reindex",
          schedule: "Sundays at 04:00",
          timezone: "UTC",
          runsIn: "app",
          nextRunAt: "2026-09-13T04:00:00.000Z",
          lastRun: {
            at: "2026-09-06T04:00:04.000Z",
            outcome: "succeeded",
            durationSeconds: 412,
          },
        },
        {
          name: "Empty trash",
          command: "document_empty_trash",
          schedule: "Daily at 03:30",
          timezone: "UTC",
          runsIn: "app",
          nextRunAt: "2026-09-10T03:30:00.000Z",
          lastRun: {
            at: "2026-09-09T03:30:02.000Z",
            outcome: "succeeded",
            durationSeconds: 2,
          },
        },
      ],
    },
  });
  state.facts = {
    releases: {
      serving: {
        revision: REVISION,
        message: "paperless-ngx 2.14.7 · Compose from the repository",
        image: "ghcr.io/paperless-ngx/paperless-ngx:2.14.7",
        deployedAt: "2026-09-08T18:29:00.000Z",
        verifiedAt: "2026-09-08T18:31:00.000Z",
      },
      candidate: null,
      history: [
        {
          id: "rel-1",
          revision: REVISION,
          at: "2026-09-08T18:31:00.000Z",
          outcome: "verified",
          note: "First deployment · login page and API health checks passed",
          operationId: `deployment:${DEPLOY}`,
        },
      ],
      preparation: {
        dockerfile: "reused",
        compose: "reused",
        checks: 2,
        revision: REVISION,
        detail: "Upstream image pinned by tag and digest",
      },
    },
    monitoring: monitoringAt("2026-09-09T09:00:00.000Z", 1),
    logs: {
      streams: [
        { service: "app", lines: 4210, lastAt: "2026-09-09T08:59:12.000Z" },
        { service: "worker", lines: 1832, lastAt: "2026-09-09T08:58:40.000Z" },
        { service: "postgres", lines: 96, lastAt: "2026-09-09T03:30:02.000Z" },
        { service: "broker", lines: 12, lastAt: "2026-09-08T18:29:00.000Z" },
      ],
      retention: "7 days · 200 MB per service",
      snapshot: {
        at: "2026-09-09T08:59:12.000Z",
        service: "all",
        lines: [
          "app | [2026-09-09 08:59:12] INFO  GET /api/documents/?page=1 200 63ms",
          "app | [2026-09-09 08:58:51] INFO  GET /api/ui_settings/ 200 8ms",
          "worker | [2026-09-09 08:58:40] INFO  Task consume_file[3f1a] succeeded in 21.4s: Success. New document id 1284",
          "worker | [2026-09-09 08:58:18] INFO  Consuming inbox/scan_0912.pdf",
          "postgres | 2026-09-09 03:30:02 UTC LOG:  checkpoint complete: wrote 412 buffers",
          "app | [2026-09-09 03:00:41] INFO  Sanity checker finished: no issues",
        ],
      },
    },
    database: {
      measuredAt: "2026-09-09T08:55:00.000Z",
      sizeGb: 1.9,
      connections: 6,
      growthMbPerWeek: 120,
      scratch: null,
    },
    storage: {
      volumes: [
        {
          name: "database",
          sizeGb: 2.1,
          measuredAt: "2026-09-09T08:55:00.000Z",
        },
        { name: "media", sizeGb: 12.4, measuredAt: "2026-09-09T08:55:00.000Z" },
        { name: "data", sizeGb: 0.6, measuredAt: "2026-09-09T08:55:00.000Z" },
        {
          name: "consume",
          sizeGb: 0.1,
          measuredAt: "2026-09-09T08:55:00.000Z",
        },
        { name: "export", sizeGb: 0, measuredAt: "2026-09-09T08:55:00.000Z" },
      ],
      hostDisk: {
        usedGb: 22,
        totalGb: 76,
        measuredAt: "2026-09-09T08:55:00.000Z",
      },
    },
    jobs: {
      runs: [
        {
          id: "run-3",
          jobName: "Empty trash",
          startedAt: "2026-09-09T03:30:02.000Z",
          finishedAt: "2026-09-09T03:30:04.000Z",
          outcome: "succeeded",
          trigger: "schedule",
          revision: REVISION,
          durationSeconds: 2,
          output: "Deleted 0 documents from the trash.",
        },
        {
          id: "run-2",
          jobName: "Sanity check",
          startedAt: "2026-09-09T03:00:10.000Z",
          finishedAt: "2026-09-09T03:00:41.000Z",
          outcome: "succeeded",
          trigger: "schedule",
          revision: REVISION,
          durationSeconds: 31,
          output: "Checked 1,283 documents. No issues found.",
        },
        {
          id: "run-1",
          jobName: "Rebuild search index",
          startedAt: "2026-09-06T04:00:04.000Z",
          finishedAt: "2026-09-06T04:06:56.000Z",
          outcome: "succeeded",
          trigger: "schedule",
          revision: REVISION,
          durationSeconds: 412,
          output: "Indexed 1,241 documents.",
        },
      ],
      queues: [
        {
          library: "Celery",
          backlog: 0,
          oldestWaitingSeconds: null,
          failedLastHour: 0,
          observedAt: "2026-09-09T08:59:00.000Z",
        },
      ],
    },
    variables: {
      variables: [
        {
          name: "PAPERLESS_URL",
          scope: "runtime",
          source: "plan",
          secret: false,
        },
        {
          name: "PAPERLESS_TIME_ZONE",
          scope: "runtime",
          source: "plan",
          secret: false,
        },
        {
          name: "PAPERLESS_OCR_LANGUAGE",
          scope: "runtime",
          source: "plan",
          secret: false,
        },
        {
          name: "PAPERLESS_DBHOST",
          scope: "runtime",
          source: "database",
          secret: true,
        },
        {
          name: "PAPERLESS_DBPASS",
          scope: "runtime",
          source: "generated",
          secret: true,
        },
        {
          name: "PAPERLESS_REDIS",
          scope: "runtime",
          source: "service",
          secret: false,
        },
        {
          name: "PAPERLESS_SECRET_KEY",
          scope: "runtime",
          source: "user",
          secret: true,
          updatedAt: "2026-09-08T18:02:00.000Z",
        },
        {
          name: "PAPERLESS_ADMIN_PASSWORD",
          scope: "runtime",
          source: "user",
          secret: true,
          updatedAt: "2026-09-08T18:02:00.000Z",
          note: "Used once for the first administrator; change it in the application",
        },
        {
          name: "PAPERLESS_EMAIL_HOST_PASSWORD",
          scope: "runtime",
          source: "user",
          secret: true,
          updatedAt: "2026-09-08T18:02:00.000Z",
        },
      ],
      pending: [],
    },
    security: {
      firewall: {
        state: "active",
        provider: "Hetzner Cloud",
        name: "sg-5c2e9b1d",
        lastCheckedAt: "2026-09-08T21:31:00.000Z",
        detail: "One firewall attached to this instance",
      },
      rules: [
        {
          id: "rule-http",
          port: "80",
          protocol: "tcp",
          sources: ["0.0.0.0/0", "::/0"],
          reach: "internet",
          serves: "app · the document archive",
        },
        {
          id: "rule-ssh",
          port: "22",
          protocol: "tcp",
          sources: ["0.0.0.0/0", "::/0"],
          reach: "internet",
          serves: "SSH · administrative access",
        },
      ],
      ssh: {
        state: "key-only",
        detail:
          "Password authentication is disabled in the instance’s cloud-init",
        holders: "One key held by this controller",
      },
      privateServices: ["PostgreSQL 16", "Valkey 8 broker"],
    },
    domains: {
      address: "http://203.0.113.24",
      domain: null,
      tls: { state: "not-configured" },
      cdn: { state: "not-configured", detail: "Not configured" },
      routes: [
        { host: "203.0.113.24", service: "app", port: 8000, protocol: "HTTP" },
      ],
    },
  };
  return state;
}

const issue = (input: Omit<Issue, "unread"> & { unread?: boolean }): Issue => ({
  unread: true,
  ...input,
});

export const richScenario: Scenario = {
  id: "rich",
  name: "Document archive",
  summary:
    "PostgreSQL, a Valkey broker, a Celery worker, three scheduled commands and 15 GB of documents on one CX23. Protection, a failed nightly upload, a worker crash, a release, a domain, a secret rotation and an unreachable host.",
  initial,
  steps: [
    {
      id: "start",
      title: "Running for a day",
      note: "Deployed yesterday, monitored, not backed up.",
      clock: "2026-09-09T09:00:00.000Z",
      apply: () => {},
    },
    {
      id: "ask-protection",
      title: "Ask for protection",
      note: "A new conversation asks Server Guy to back up the data.",
      clock: "2026-09-09T09:02:00.000Z",
      apply: (state) => {
        chat(state, "chat-protect", "Data protection");
        message(
          state,
          "chat-protect",
          "user",
          "Make sure my data is backed up.",
        );
        const reply = message(
          state,
          "chat-protect",
          "assistant",
          "I’ll look at what this application keeps on its instance before proposing anything: the database, the document volumes and the broker’s pending work. Read-only; nothing changes yet.",
        );
        operation(state, {
          id: "inspect-state",
          source: "inspection",
          kind: "inspection",
          title: "Inspect what needs protection",
          state: "working",
          destinations: ["database", "storage", "backups"],
          origin: { chatId: "chat-protect", messageId: reply.id },
          summary:
            "Measuring the database and the document volumes on the host. Nothing on the host is changed.",
          steps: steps(
            [
              "Connect to the host",
              "Measure the database",
              "Measure the volumes",
              "Record the evidence",
            ],
            1,
          ),
        });
      },
    },
    {
      id: "inspected",
      title: "Inspected",
      note: "Measurements recorded; Database and Storage show them.",
      clock: "2026-09-09T09:04:00.000Z",
      apply: (state) => {
        update(state, "inspect-state", {
          state: "inspected",
          steps: undefined,
          evidence:
            "PostgreSQL 1.9 GB · documents 12.4 GB · data 0.6 GB · consume 0.1 GB · Valkey holds 0 pending tasks. Instance disk 22 of 76 GB.",
        });
        state.facts.database!.measuredAt = state.clock;
        state.facts.storage!.volumes.forEach((volume) => {
          volume.measuredAt = state.clock;
        });
        state.facts.storage!.hostDisk!.measuredAt = state.clock;
        message(
          state,
          "chat-protect",
          "assistant",
          "Three things need protection: the PostgreSQL database (1.9 GB), the document and data volumes (13 GB) and, separately, the broker’s pending work, which cannot be backed up consistently and should stay small. Nothing is protected off the host today.",
        );
      },
    },
    {
      id: "proposal",
      title: "Backup proposal",
      note: "One recommendation with the one input only you can provide.",
      clock: "2026-09-09T09:05:00.000Z",
      apply: (state) => {
        const reply = message(
          state,
          "chat-protect",
          "assistant",
          "I propose nightly backups to a new private bucket in your Cloudflare R2 account: a consistent PostgreSQL dump plus archives of the document and data volumes, at 03:00 UTC after the sanity check, kept for 14 days. I’ll restore the first backup into an isolated scratch database to prove it. I need one R2 API token scoped to that bucket. Review the operation below before I proceed.",
        );
        operation(state, {
          id: "backups",
          source: "backup",
          kind: "change",
          title: "Configure nightly backups to Cloudflare R2",
          state: "proposed",
          destinations: ["backups", "database", "storage"],
          origin: { chatId: "chat-protect", messageId: reply.id },
          summary:
            "Nightly at 03:00 UTC to a private R2 bucket, kept 14 days: database dump plus document archives. Nothing is applied until you approve.",
          approval: {
            note: "Creates one bucket in your R2 account and installs a nightly schedule on the host.",
            action: "Approve and set up backups",
          },
          decision: {
            kind: "approval",
            note: "Creates one private bucket, installs the nightly schedule on the host, runs the first backup now and verifies it with an isolated restore.",
            cost: "About EUR 0.25 per month at today’s 15 GB · one bucket in your Cloudflare account · no new servers",
            inputs: [
              {
                name: "R2 API token",
                hint: "Scoped to one bucket, object read and write only. Stored on the controller, never in the repository or this transcript.",
                secret: true,
              },
            ],
            action: "Approve and set up backups",
          },
        });
      },
    },
    {
      id: "approved",
      title: "Approved · setting up",
      note: "The receipt shows the steps; Backups shows the change as not applied yet.",
      clock: "2026-09-09T09:12:00.000Z",
      apply: (state) => {
        update(state, "backups", {
          state: "working",
          decision: null,
          summary: "Setting up the bucket, the schedule and the first backup.",
          steps: steps(
            [
              "Verify bucket access with the token",
              "Install the nightly schedule",
              "Dump the database",
              "Archive the document volumes",
              "Upload and restore-test",
            ],
            2,
          ),
        });
        message(
          state,
          "chat-protect",
          "assistant",
          "Approved. The bucket is reachable with the token. I’m installing the schedule and taking the first backup now; you can follow the steps above.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "uploading",
      title: "Uploading the first backup",
      note: "Work continues while you look at other views.",
      clock: "2026-09-09T09:19:00.000Z",
      apply: (state) => {
        update(state, "backups", {
          steps: steps(
            [
              "Verify bucket access with the token",
              "Install the nightly schedule",
              "Dump the database · 418 MB",
              "Archive the document volumes · 13.1 GB",
              "Upload and restore-test",
            ],
            3,
          ),
        });
      },
    },
    {
      id: "verified",
      title: "Backups verified",
      note: "Facts change only now: destination, policy, coverage, restore test.",
      clock: "2026-09-09T09:41:00.000Z",
      apply: (state) => {
        update(state, "backups", {
          state: "verified",
          steps: undefined,
          summary: "Nightly at 03:00 UTC to Cloudflare R2, kept 14 days.",
          evidence:
            "418 MB database dump and 13.1 GB of files in R2 · isolated restore of the dump matched 1,284 documents · schedule installed on the host.",
        });
        state.facts.protection = {
          destination: {
            provider: "r2",
            bucket: "archive-backups-7f2e",
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
              key: "database:postgres",
              label: "PostgreSQL 16",
              method: "consistent database dump",
              state: "protected",
              lastSuccessfulAt: state.clock,
              size: "418 MB",
            },
            {
              key: "volume:media",
              label: "Files · media",
              method: "file archive",
              state: "protected",
              lastSuccessfulAt: state.clock,
              size: "12.4 GB",
            },
            {
              key: "volume:data",
              label: "Files · data",
              method: "file archive",
              state: "protected",
              lastSuccessfulAt: state.clock,
              size: "0.6 GB",
            },
            {
              key: "volume:consume",
              label: "Files · consume",
              method: "file archive",
              state: "protected",
              lastSuccessfulAt: state.clock,
              size: "0.1 GB",
            },
            {
              key: "service:broker",
              label: "Valkey · pending work",
              method: "not backed up",
              state: "not-covered",
              note: "Queued tasks are re-created by the application; a restore would replay recent work",
            },
          ],
          lastAttempt: {
            at: state.clock,
            outcome: "succeeded",
            size: "13.5 GB",
          },
          restoreTest: {
            at: state.clock,
            recoveryPointAt: at(state.clock, -20),
            verified: "1,284 documents matched in an isolated scratch database",
            operationId: "backups",
          },
          history: [
            {
              id: "h-restore-1",
              at: state.clock,
              kind: "restore-test",
              outcome: "succeeded",
              detail: "Isolated restore matched 1,284 documents",
              operationId: "backups",
            },
            {
              id: "h-backup-1",
              at: at(state.clock, -9),
              kind: "backup",
              outcome: "succeeded",
              detail: "First backup · 418 MB dump · 13.1 GB files",
              operationId: "backups",
            },
            {
              id: "h-policy-1",
              at: at(state.clock, -29),
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
          target: "R2 · archive-backups-7f2e",
          state: "passing",
          lastAt: state.clock,
          detail: "First backup verified",
        });
        message(
          state,
          "chat-protect",
          "assistant",
          "Done. The first backup is in R2 and I restored the database dump into an isolated scratch database: 1,284 documents matched. The nightly schedule runs on the host at 03:00 UTC whether or not this dashboard is open. Pending broker work stays uncovered by design; it is small and the application re-creates it.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "nightly-failed",
      title: "A nightly upload fails",
      note: "Automatic work with no conversation: an issue, a red mark, the last good copy kept.",
      clock: "2026-09-10T03:04:00.000Z",
      apply: (state) => {
        operation(state, {
          id: "nightly-1",
          source: "backup",
          kind: "change",
          title: "Nightly backup",
          state: "failed",
          destinations: ["backups", "database", "storage"],
          origin: null,
          summary:
            "The dump and archives were created on the host, but R2 rejected the upload. The previous backup remains the last good copy.",
          steps: steps(
            [
              "Dump the database · 421 MB",
              "Archive the document volumes · 13.2 GB",
              "Upload to R2",
            ],
            2,
            2,
          ),
          next: "R2 answered 403 Forbidden to the upload. The token is no longer accepted; provide a new one and I’ll retry.",
          decision: {
            kind: "recovery",
            note: "The local dump and archives from 03:00 are kept; a retry uploads them without repeating the dump.",
            retry: "Provide token and retry",
            inputs: [
              {
                name: "R2 API token",
                hint: "A new token scoped to the same bucket",
                secret: true,
              },
            ],
          },
        });
        const protection = state.facts.protection!;
        protection.lastAttempt = {
          at: state.clock,
          outcome: "failed",
          reason: "R2 rejected the upload (403 Forbidden)",
        };
        protection.coverage[0].state = "behind";
        protection.coverage[0].note = "Local dump only · upload rejected";
        protection.coverage[1].state = "behind";
        protection.coverage[2].state = "behind";
        protection.coverage[3].state = "behind";
        protection.history.unshift({
          id: "h-backup-2",
          at: state.clock,
          kind: "upload",
          outcome: "failed",
          detail:
            "Nightly upload rejected by R2 (403 Forbidden) · dump and archives kept on the host",
          operationId: "nightly-1",
        });
        const monitoring = state.facts.monitoring!;
        monitoring.collector.lastObservationAt = state.clock;
        monitoring.checks.find((check) => check.id === "backup")!.state =
          "failing";
        monitoring.checks.find((check) => check.id === "backup")!.detail =
          "Upload rejected (403)";
        monitoring.checks.find((check) => check.id === "backup")!.lastAt =
          state.clock;
        monitoring.issues.unshift(
          issue({
            id: "issue-backup",
            title: "Nightly backup upload rejected",
            impact:
              "Off-host protection is behind policy: the last good copy is from yesterday 09:41. The application itself is unaffected.",
            detectedAt: state.clock,
            state: "open",
            evidence:
              "PutObject to archive-backups-7f2e returned 403 Forbidden at 03:03:52; the dump (421 MB) and archives (13.2 GB) were written on the host.",
            next: "Provide a new R2 token in the investigation and Server Guy retries the upload without repeating the dump.",
            source: { kind: "backup", id: "nightly-1" },
            operationId: "nightly-1",
          }),
        );
        state.facts.jobs!.runs.unshift({
          id: "run-4",
          jobName: "Sanity check",
          startedAt: "2026-09-10T03:00:09.000Z",
          finishedAt: "2026-09-10T03:00:38.000Z",
          outcome: "succeeded",
          trigger: "schedule",
          revision: REVISION,
          durationSeconds: 29,
          output: "Checked 1,291 documents. No issues found.",
        });
      },
    },
    {
      id: "investigate-backup",
      title: "Investigate",
      note: "Investigate adopts the automatic work into a linked conversation.",
      clock: "2026-09-10T09:15:00.000Z",
      apply: (state) => {
        chat(state, "chat-backup-issue", "Investigate: backup upload rejected");
        const event = message(
          state,
          "chat-backup-issue",
          "assistant",
          "Nightly backup upload rejected at 03:04 UTC. R2 answered 403 Forbidden; the dump and archives were written on the host and kept. The last good off-host copy is from 9 September 09:41.",
          { source: "server-guy" },
        );
        update(state, "nightly-1", {
          origin: { chatId: "chat-backup-issue", messageId: event.id },
        });
        operation(state, {
          id: "diagnose-backup",
          source: "inspection",
          kind: "inspection",
          title: "Diagnose the rejected upload",
          state: "inspected",
          destinations: ["backups"],
          origin: { chatId: "chat-backup-issue", messageId: event.id },
          summary:
            "Read the upload log and checked the token against the bucket. Read-only.",
          evidence:
            "The token was created with a 24-hour expiry on 9 September 09:12 and expired at 09:12 today. The bucket, its contents and the schedule are unchanged.",
        });
        message(
          state,
          "chat-backup-issue",
          "assistant",
          "The token you provided yesterday was created with a one-day expiry, so R2 rejected this morning’s upload. Nothing else changed. Provide a token without an expiry (or a longer one) in the nightly backup above and I’ll upload the kept dump and archives without repeating them.",
        );
        const found = state.facts.monitoring!.issues.find(
          (item) => item.id === "issue-backup",
        )!;
        found.state = "acknowledged";
        found.unread = false;
        found.conversationId = "chat-backup-issue";
      },
    },
    {
      id: "retrying",
      title: "Retrying with a new token",
      note: "The retry uploads the kept dump; nothing is repeated blindly.",
      clock: "2026-09-10T09:18:00.000Z",
      apply: (state) => {
        update(state, "nightly-1", {
          state: "working",
          decision: null,
          next: undefined,
          summary: "Uploading the kept dump and archives with the new token.",
          steps: steps(
            [
              "Dump the database · 421 MB",
              "Archive the document volumes · 13.2 GB",
              "Upload to R2 · 41%",
              "Verify the objects",
            ],
            2,
          ),
        });
      },
    },
    {
      id: "recovered-backup",
      title: "Backup recovered",
      note: "The issue recovers; coverage is protected again.",
      clock: "2026-09-10T09:21:00.000Z",
      apply: (state) => {
        update(state, "nightly-1", {
          state: "verified",
          steps: undefined,
          summary: "Nightly backup uploaded after a retry with a new token.",
          evidence:
            "421 MB dump and 13.2 GB files in R2 · objects verified · recovery point 03:00 UTC.",
        });
        const protection = state.facts.protection!;
        protection.lastAttempt = {
          at: state.clock,
          outcome: "succeeded",
          size: "13.6 GB",
        };
        protection.coverage.slice(0, 4).forEach((item) => {
          item.state = "protected";
          item.note = null;
          item.lastSuccessfulAt = state.clock;
        });
        protection.destination!.access =
          "Token scoped to this bucket, object read and write · no expiry";
        protection.history.unshift({
          id: "h-backup-3",
          at: state.clock,
          kind: "upload",
          outcome: "succeeded",
          detail: "Retry uploaded the kept dump and archives · 13.6 GB",
          operationId: "nightly-1",
        });
        const monitoring = state.facts.monitoring!;
        const check = monitoring.checks.find((item) => item.id === "backup")!;
        check.state = "passing";
        check.detail = "Recovered after retry";
        check.lastAt = state.clock;
        const found = monitoring.issues.find(
          (item) => item.id === "issue-backup",
        )!;
        found.state = "recovered";
        found.recoveredAt = state.clock;
        message(
          state,
          "chat-backup-issue",
          "assistant",
          "Uploaded and verified with the new token: the recovery point from 03:00 UTC is in R2. I recorded the token as having no expiry so this cannot recur the same way.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "worker-stopped",
      title: "The worker stops",
      note: "Monitoring notices; the queue backs up; an issue and a failed mark appear.",
      clock: "2026-09-10T13:12:00.000Z",
      apply: (state) => {
        operation(state, {
          id: "worker-crash",
          source: "check",
          kind: "inspection",
          title: "Worker process stopped",
          state: "failed",
          destinations: ["processes", "jobs", "monitoring"],
          origin: null,
          summary:
            "The worker container exited with code 137 while processing a scan. Queued documents are waiting.",
          next: "Investigate to see why it stopped and restart it safely.",
        });
        const monitoring = state.facts.monitoring!;
        monitoring.collector.lastObservationAt = state.clock;
        const worker = monitoring.checks.find((item) => item.id === "worker")!;
        worker.state = "failing";
        worker.detail = "Exited 137 (out of memory) at 13:11";
        worker.lastAt = state.clock;
        monitoring.resources = {
          cpuPercent: 4,
          memoryUsedMb: 1180,
          memoryTotalMb: 4096,
          diskUsedGb: 22,
          diskTotalGb: 76,
          measuredAt: state.clock,
        };
        monitoring.issues.unshift(
          issue({
            id: "issue-worker",
            title: "Worker process stopped",
            impact:
              "New documents are not being processed; uploads still succeed and wait in the queue. Existing documents are unaffected.",
            detectedAt: state.clock,
            state: "open",
            evidence:
              "docker events: worker OOM-killed at 13:11:48 while OCR-ing consume/scan_0918.pdf (412 pages) · resident memory reached 3.7 GB of 4 GB · no memory limit set.",
            next: "Investigate to restart the worker with a memory limit and lower OCR concurrency.",
            source: { kind: "check", id: "worker" },
            operationId: "worker-crash",
          }),
        );
        state.facts.jobs!.queues[0] = {
          library: "Celery",
          backlog: 37,
          oldestWaitingSeconds: 2460,
          failedLastHour: 1,
          observedAt: state.clock,
        };
        state.facts.logs!.streams[1] = {
          service: "worker",
          lines: 1911,
          lastAt: at(state.clock, -1),
          level: "errors",
        };
        state.facts.logs!.snapshot = {
          at: state.clock,
          service: "all",
          lines: [
            "worker | [2026-09-10 13:11:48] ERROR Task consume_file[9a2c] raised: MemoryError while running OCR on scan_0918.pdf",
            "worker | [2026-09-10 13:11:48] WARNING Worker exited prematurely: signal 9 (SIGKILL) · exitcode 137",
            "app | [2026-09-10 13:12:03] INFO  POST /api/documents/post_document/ 200 41ms",
            "app | [2026-09-10 13:12:03] INFO  Queued consume task for upload_0919.pdf",
            "app | [2026-09-10 13:10:22] INFO  GET /api/documents/?page=2 200 58ms",
          ],
        };
      },
    },
    {
      id: "investigate-worker",
      title: "Investigating the worker",
      note: "A diagnosis with evidence and one proposal that needs approval.",
      clock: "2026-09-10T13:20:00.000Z",
      apply: (state) => {
        chat(state, "chat-worker-issue", "Investigate: worker stopped");
        const event = message(
          state,
          "chat-worker-issue",
          "assistant",
          "Worker process stopped at 13:11 UTC: exit code 137 (out of memory) while OCR-ing a 412-page scan. 37 documents are waiting in the queue; uploads still work.",
          { source: "server-guy" },
        );
        update(state, "worker-crash", {
          origin: { chatId: "chat-worker-issue", messageId: event.id },
        });
        operation(state, {
          id: "diagnose-worker",
          source: "inspection",
          kind: "inspection",
          title: "Diagnose the worker crash",
          state: "inspected",
          destinations: ["processes", "monitoring", "logs"],
          origin: { chatId: "chat-worker-issue", messageId: event.id },
          summary:
            "Read the worker log, Docker events and memory samples. Read-only.",
          evidence:
            "The worker runs two OCR tasks at once with no memory limit; a 412-page scan pushed it to 3.7 GB and the kernel killed it. The queue kept the task, so nothing was lost.",
        });
        const reply = message(
          state,
          "chat-worker-issue",
          "assistant",
          "It ran out of memory on an unusually large scan. I propose restarting the worker with a 1.5 GB memory limit and OCR concurrency of 1, so a big document slows the queue instead of stopping it. This restarts only the worker; the web process and your documents are untouched.",
        );
        operation(state, {
          id: "worker-limit",
          source: "job",
          kind: "change",
          title: "Restart the worker with a memory limit",
          state: "proposed",
          destinations: ["processes", "jobs"],
          origin: { chatId: "chat-worker-issue", messageId: reply.id },
          summary:
            "Memory limit 1.5 GB and OCR concurrency 1 for the worker, then restart it. Not applied until you approve.",
          approval: {
            note: "Restarts only the worker; queued work resumes.",
            action: "Approve and restart the worker",
          },
          decision: {
            kind: "approval",
            note: "Adds a memory limit and lowers OCR concurrency in the worker’s Compose service, then restarts it. Queued documents resume processing.",
            cost: "No new resources · about 20 seconds without a worker",
            inputs: [],
            action: "Approve and restart the worker",
          },
        });
        const found = state.facts.monitoring!.issues.find(
          (item) => item.id === "issue-worker",
        )!;
        found.state = "acknowledged";
        found.unread = false;
        found.conversationId = "chat-worker-issue";
      },
    },
    {
      id: "restarting",
      title: "Applying the limit",
      note: "Working while you browse Processes or Jobs.",
      clock: "2026-09-10T13:24:00.000Z",
      apply: (state) => {
        update(state, "worker-limit", {
          state: "working",
          decision: null,
          summary: "Applying the memory limit and restarting the worker.",
          steps: steps(
            [
              "Update the worker service",
              "Restart the worker",
              "Confirm it consumes the queue",
            ],
            1,
          ),
        });
        state.deployment!.native!.resolved.services.worker.command = [
          "celery",
          "-A",
          "paperless",
          "worker",
          "-l",
          "INFO",
          "--concurrency",
          "1",
        ];
      },
    },
    {
      id: "worker-back",
      title: "Worker back",
      note: "Verified: the check passes, the queue drains, the issue recovers.",
      clock: "2026-09-10T13:27:00.000Z",
      apply: (state) => {
        update(state, "worker-limit", {
          state: "verified",
          steps: undefined,
          summary:
            "The worker runs with a 1.5 GB memory limit and OCR concurrency 1.",
          evidence:
            "Worker restarted at 13:25 · consumed 25 of 37 queued documents in the first two minutes · resident memory 840 MB.",
        });
        update(state, "worker-crash", { resolvedById: "worker-limit" });
        const monitoring = state.facts.monitoring!;
        monitoring.collector.lastObservationAt = state.clock;
        const worker = monitoring.checks.find((item) => item.id === "worker")!;
        worker.state = "passing";
        worker.detail = "Running 2 min · 1.5 GB limit";
        worker.lastAt = state.clock;
        monitoring.resources = {
          cpuPercent: 62,
          memoryUsedMb: 2020,
          memoryTotalMb: 4096,
          diskUsedGb: 22,
          diskTotalGb: 76,
          measuredAt: state.clock,
        };
        const found = monitoring.issues.find(
          (item) => item.id === "issue-worker",
        )!;
        found.state = "recovered";
        found.recoveredAt = state.clock;
        state.facts.jobs!.queues[0] = {
          library: "Celery",
          backlog: 12,
          oldestWaitingSeconds: 900,
          failedLastHour: 1,
          observedAt: state.clock,
        };
        state.facts.logs!.streams[1] = {
          service: "worker",
          lines: 1960,
          lastAt: state.clock,
        };
        message(
          state,
          "chat-worker-issue",
          "assistant",
          "The worker is back with the limit and is working through the queue: 25 of 37 documents processed in two minutes. The large scan will take longer at concurrency 1 but will no longer stop the worker.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "candidate",
      title: "A new revision is available",
      note: "Detected, offered, never deployed on push.",
      clock: "2026-09-11T08:30:00.000Z",
      apply: (state) => {
        state.facts.releases!.candidate = {
          revision: NEXT_REVISION,
          message: "paperless-ngx 2.14.8 · security update for the PDF parser",
          author: "example",
          pushedAt: at(state.clock, -25),
          ci: {
            state: "passed",
            detail:
              "Build and tests passed on GitHub Actions · image ghcr.io/paperless-ngx/paperless-ngx:2.14.8",
          },
          image: "ghcr.io/paperless-ngx/paperless-ngx:2.14.8",
        };
        operation(state, {
          id: "candidate",
          source: "release",
          kind: "inspection",
          title: "Release candidate 2.14.8 detected",
          state: "inspected",
          destinations: ["deployment"],
          origin: null,
          summary:
            "A newer revision passed its checks. Nothing deploys on push; Deployment offers it.",
          evidence:
            "GitHub Actions passed for a91f4d2c8e7b · one pending migration · the worker drains before the switch.",
        });
        state.facts.monitoring!.collector.lastObservationAt = state.clock;
      },
    },
    {
      id: "release-requested",
      title: "Release requested",
      note: "One approval with what the release will do.",
      clock: "2026-09-11T08:41:00.000Z",
      apply: (state) => {
        message(state, "chat-deploy", "user", "Deploy 2.14.8, please.");
        const reply = message(
          state,
          "chat-deploy",
          "assistant",
          "2.14.8 passed its checks and includes one migration. I’ll pull the image, let the worker finish its current task, run the migration, start the new web process and verify the same two checks. The web process will be unavailable for about two minutes; queued documents wait. Review the release below.",
        );
        operation(state, {
          id: "release",
          source: "release",
          kind: "change",
          title: "Release 2.14.8",
          state: "proposed",
          destinations: ["deployment", "processes"],
          origin: { chatId: "chat-deploy", messageId: reply.id },
          summary:
            "Pull 2.14.8, drain the worker, run one migration, start and verify. Not applied until you approve.",
          approval: {
            note: "About two minutes of web downtime; queued work waits.",
            action: "Approve the release",
          },
          decision: {
            kind: "approval",
            note: "Pulls ghcr.io/paperless-ngx/paperless-ngx:2.14.8, drains the worker, runs one pending migration, starts the new web process and verifies the login page and API health. The previous image is kept for a compatible rollback.",
            cost: "No new resources · about two minutes without the web process",
            inputs: [],
            action: "Approve the release",
          },
        });
      },
    },
    {
      id: "releasing",
      title: "Releasing",
      note: "Steps in the receipt; Deployment shows the release in progress.",
      clock: "2026-09-11T08:43:00.000Z",
      apply: (state) => {
        update(state, "release", {
          state: "working",
          decision: null,
          summary: "Releasing 2.14.8.",
          steps: steps(
            [
              "Pull the image",
              "Drain the worker",
              "Run the migration",
              "Start the web process",
              "Verify",
            ],
            2,
          ),
        });
      },
    },
    {
      id: "released",
      title: "Release verified",
      note: "Serving changes only after verification; history keeps both.",
      clock: "2026-09-11T08:47:00.000Z",
      apply: (state) => {
        update(state, "release", {
          state: "verified",
          steps: undefined,
          summary: "2.14.8 is serving.",
          evidence:
            "Login page and API health passed on 2.14.8 · migration 1 of 1 applied · worker resumed · 118 seconds without the web process.",
        });
        const releases = state.facts.releases!;
        releases.serving = {
          revision: NEXT_REVISION,
          message: "paperless-ngx 2.14.8 · security update for the PDF parser",
          image: "ghcr.io/paperless-ngx/paperless-ngx:2.14.8",
          deployedAt: at(state.clock, -2),
          verifiedAt: state.clock,
        };
        releases.candidate = null;
        releases.history.unshift({
          id: "rel-2",
          revision: NEXT_REVISION,
          at: state.clock,
          outcome: "verified",
          note: "Release 2.14.8 · one migration · checks passed",
          operationId: "release",
        });
        state.deployment!.revision = NEXT_REVISION;
        state.deployment!.imageId =
          "ghcr.io/paperless-ngx/paperless-ngx:2.14.8";
        state.deployment!.verifiedAt = state.clock;
        state.deployment!.updatedAt = state.clock;
        state.facts.monitoring!.collector.lastObservationAt = state.clock;
        message(
          state,
          "chat-deploy",
          "assistant",
          "2.14.8 is serving and verified. The migration applied cleanly and the worker resumed; the web process was unavailable for 118 seconds. The previous image stays available for a compatible rollback.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "domain-requested",
      title: "Domain requested",
      note: "Server Guy does everything except the one DNS step only you can do.",
      clock: "2026-09-11T09:10:00.000Z",
      apply: (state) => {
        chat(state, "chat-domain", "Domain and HTTPS");
        message(
          state,
          "chat-domain",
          "user",
          "Put it on docs.example.dev with HTTPS.",
        );
        const reply = message(
          state,
          "chat-domain",
          "assistant",
          "docs.example.dev is not pointing anywhere yet. I’ve prepared the route and the certificate request on the host; it completes as soon as the name resolves here. Add an A record for docs.example.dev to 203.0.113.24 at your DNS provider. I’ll keep checking and take it from there. A CDN would not help this application; its pages are dynamic and authenticated.",
        );
        operation(state, {
          id: "domain",
          source: "domain",
          kind: "change",
          title: "Serve docs.example.dev with HTTPS",
          state: "working",
          destinations: ["domains"],
          origin: { chatId: "chat-domain", messageId: reply.id },
          summary:
            "Route prepared and certificate requested; waiting for the DNS record you add.",
          steps: steps(
            [
              "Prepare the route on the host",
              "Wait for docs.example.dev to resolve here",
              "Issue the certificate",
              "Verify HTTPS",
            ],
            1,
          ),
        });
        state.facts.domains = {
          address: "http://203.0.113.24",
          domain: {
            name: "docs.example.dev",
            provider: "external",
            state: "pending-dns",
            detail:
              "Server Guy checks every minute; nothing else is needed from you once the record exists.",
            userStep:
              "Add an A record at your DNS provider: docs.example.dev → 203.0.113.24. It usually takes a few minutes to spread.",
          },
          tls: {
            state: "pending",
            detail:
              "Requested from Let’s Encrypt; issues once the name resolves",
          },
          cdn: {
            state: "not-useful",
            detail: "Not useful here: pages are dynamic and authenticated",
          },
          routes: [
            {
              host: "203.0.113.24",
              service: "app",
              port: 8000,
              protocol: "HTTP",
            },
          ],
        };
      },
    },
    {
      id: "dns-resolves",
      title: "DNS resolves · certificate pending",
      note: "The user did their step; the rest is automatic.",
      clock: "2026-09-11T09:31:00.000Z",
      apply: (state) => {
        update(state, "domain", {
          summary: "docs.example.dev resolves here; issuing the certificate.",
          steps: steps(
            [
              "Prepare the route on the host",
              "Wait for docs.example.dev to resolve here",
              "Issue the certificate",
              "Verify HTTPS",
            ],
            2,
          ),
        });
        state.facts.domains!.domain = {
          ...state.facts.domains!.domain!,
          state: "resolving",
          detail: "Resolves to 203.0.113.24 since 09:29",
          userStep: null,
        };
      },
    },
    {
      id: "https",
      title: "HTTPS live",
      note: "Verified with a real certificate and renewal recorded.",
      clock: "2026-09-11T09:34:00.000Z",
      apply: (state) => {
        update(state, "domain", {
          state: "verified",
          steps: undefined,
          summary: "https://docs.example.dev serves the application.",
          evidence:
            "Certificate from Let’s Encrypt valid until 10 December · renewal automatic 30 days before · HTTP redirects to HTTPS · login page verified over TLS.",
        });
        state.facts.domains = {
          address: "https://docs.example.dev",
          domain: {
            name: "docs.example.dev",
            provider: "external",
            state: "resolving",
            detail: "Resolves to 203.0.113.24 · HTTP redirects to HTTPS",
          },
          tls: {
            state: "valid",
            issuer: "Let’s Encrypt",
            expiresAt: "2026-12-10T09:33:00.000Z",
            renewal:
              "Renews automatically 30 days before expiry; a failed renewal becomes an issue",
            detail: null,
          },
          cdn: {
            state: "not-useful",
            detail: "Not useful here: pages are dynamic and authenticated",
          },
          routes: [
            {
              host: "docs.example.dev",
              service: "app",
              port: 8000,
              protocol: "HTTPS",
            },
            {
              host: "203.0.113.24",
              service: "app",
              port: 8000,
              protocol: "HTTP → HTTPS redirect",
            },
          ],
        };
        state.facts.variables!.variables[0] = {
          name: "PAPERLESS_URL",
          scope: "runtime",
          source: "plan",
          secret: false,
          updatedAt: state.clock,
          note: "Now https://docs.example.dev",
        };
        state.facts.monitoring!.checks[0] = {
          id: "http",
          name: "Web responds",
          kind: "http",
          target: "GET https://docs.example.dev/api/ui_settings/",
          state: "passing",
          lastAt: state.clock,
          detail: "200 in 91 ms over TLS",
        };
        state.facts.monitoring!.checks.push({
          id: "cert",
          name: "Certificate valid",
          kind: "certificate",
          target: "docs.example.dev",
          state: "passing",
          lastAt: state.clock,
          detail: "89 days left",
        });
        state.facts.monitoring!.collector.lastObservationAt = state.clock;
        message(
          state,
          "chat-domain",
          "assistant",
          "https://docs.example.dev is live. The certificate comes from Let’s Encrypt and renews itself; HTTP redirects to HTTPS. I updated PAPERLESS_URL and restarted the web process so links use the new address.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "rotate-requested",
      title: "Rotate a secret",
      note: "A protected input inside the receipt; the value never appears anywhere.",
      clock: "2026-09-11T10:05:00.000Z",
      apply: (state) => {
        chat(state, "chat-secret", "Rotate the mail password");
        message(
          state,
          "chat-secret",
          "user",
          "Rotate the SMTP password, I changed it at the provider.",
        );
        const reply = message(
          state,
          "chat-secret",
          "assistant",
          "I’ll replace PAPERLESS_EMAIL_HOST_PASSWORD and restart the web and worker processes so both pick it up; mail sending pauses for about ten seconds. Paste the new value below; it goes straight to the host and is not kept in this transcript.",
        );
        operation(state, {
          id: "rotate",
          source: "variables",
          kind: "change",
          title: "Rotate PAPERLESS_EMAIL_HOST_PASSWORD",
          state: "proposed",
          destinations: ["variables", "processes"],
          origin: { chatId: "chat-secret", messageId: reply.id },
          summary:
            "Replace the value and restart web and worker. Not applied until you provide it.",
          approval: {
            note: "Restarts web and worker; about ten seconds.",
            action: "Apply and restart",
          },
          decision: {
            kind: "approval",
            note: "Writes the new value to the host’s protected configuration and restarts the web and worker processes.",
            cost: "No new resources · about ten seconds of restart",
            inputs: [
              {
                name: "PAPERLESS_EMAIL_HOST_PASSWORD",
                hint: "The new SMTP password from your mail provider",
                secret: true,
              },
            ],
            action: "Apply and restart",
          },
        });
        state.facts.variables!.pending = [
          {
            name: "PAPERLESS_EMAIL_HOST_PASSWORD",
            reason: "New value requested",
            operationId: "rotate",
          },
        ];
      },
    },
    {
      id: "rotating",
      title: "Applying",
      note: "Variables shows the pending restart.",
      clock: "2026-09-11T10:07:00.000Z",
      apply: (state) => {
        update(state, "rotate", {
          state: "working",
          decision: null,
          summary: "Applying the new value and restarting web and worker.",
          steps: steps(
            [
              "Write the value to the host",
              "Restart the web process",
              "Restart the worker",
              "Confirm mail configuration",
            ],
            1,
          ),
        });
        state.facts.variables!.pending = [];
        const variable = state.facts.variables!.variables.find(
          (item) => item.name === "PAPERLESS_EMAIL_HOST_PASSWORD",
        )!;
        variable.updatedAt = state.clock;
        variable.pendingRestart = true;
      },
    },
    {
      id: "rotated",
      title: "Rotated",
      note: "Applied and verified; the variable shows when it changed.",
      clock: "2026-09-11T10:08:00.000Z",
      apply: (state) => {
        update(state, "rotate", {
          state: "verified",
          steps: undefined,
          summary: "The new SMTP password is in use.",
          evidence:
            "Web and worker restarted with the new value · a test mail to the administrator address was accepted by the provider.",
        });
        const variable = state.facts.variables!.variables.find(
          (item) => item.name === "PAPERLESS_EMAIL_HOST_PASSWORD",
        )!;
        variable.pendingRestart = false;
        message(
          state,
          "chat-secret",
          "assistant",
          "Applied. Both processes restarted with the new password and a test mail was accepted by your provider.",
          { source: "server-guy" },
        );
      },
    },
    {
      id: "host-unreachable",
      title: "Host unreachable",
      note: "Stale, not healthy: the last observation is shown, nothing is inferred.",
      clock: "2026-09-11T14:02:00.000Z",
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
            "The controller cannot reach 203.0.113.24 over SSH or HTTPS. The last observation was at 13:58; whether the application is serving is unknown.",
          next: "Server Guy keeps trying every minute and asks Hetzner for the instance status. Investigate to see what is known.",
        });
        const monitoring = state.facts.monitoring!;
        monitoring.collector = {
          state: "stale",
          lastObservationAt: at(state.clock, -4),
          hostReachable: false,
          detail: "Host unreachable from the controller since 14:00",
        };
        monitoring.checks.forEach((check) => {
          if (check.kind !== "backup" && check.kind !== "job") {
            check.state = "unknown";
            check.detail = "No observation since 13:58";
          }
        });
        monitoring.issues.unshift(
          issue({
            id: "issue-host",
            title: "Instance unreachable",
            impact:
              "Unknown whether docs.example.dev is serving; the controller cannot observe the host. Nothing is inferred from silence.",
            detectedAt: state.clock,
            state: "open",
            evidence:
              "SSH and HTTPS to 203.0.113.24 time out since 14:00:12 · Hetzner reports the instance as running · last collector observation 13:58.",
            next: "Wait for the host to answer or investigate the Hetzner status; a reboot from Hetzner is possible from the investigation.",
            source: { kind: "host", id: "host" },
            operationId: "host-down",
          }),
        );
      },
    },
    {
      id: "host-back",
      title: "Host back",
      note: "Recovered with the gap recorded, not papered over.",
      clock: "2026-09-11T14:19:00.000Z",
      apply: (state) => {
        update(state, "host-down", {
          state: "inspected",
          summary:
            "The instance answered again at 14:17 after a 17-minute network interruption on Hetzner’s side.",
          next: undefined,
          evidence:
            "Hetzner status: network maintenance in fsn1 from 13:59 to 14:16 · the collector’s local history has no gap · all checks passing since 14:17.",
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
        found.evidence =
          "Network maintenance in fsn1 from 13:59 to 14:16 (Hetzner status) · the host kept running; its local history shows no gap.";
        monitoring.resources = {
          cpuPercent: 11,
          memoryUsedMb: 2090,
          memoryTotalMb: 4096,
          diskUsedGb: 23,
          diskTotalGb: 76,
          measuredAt: at(state.clock, -1),
        };
      },
    },
  ],
};

// Coordination examples share the same records across chat and History.
// Their executor is deliberately simulated, like the other reference scenes.
richScenario.steps.push(
  {
    id: "queued-change",
    title: "Two conversations, one change",
    note: "A second approved change waits. Read-only inspection continues alongside it; History shows all three.",
    clock: "2026-09-11T15:00:00.000Z",
    apply: (state) => {
      chat(state, "chat-coordinate-one", "Restart the worker");
      chat(state, "chat-coordinate-two", "Change worker concurrency");
      const first = message(
        state,
        "chat-coordinate-one",
        "assistant",
        "I’m restarting the worker and checking it comes back healthy.",
      );
      operation(state, {
        id: "coord-restart",
        source: "job",
        kind: "change",
        title: "Restart the worker",
        state: "working",
        destinations: ["processes", "jobs"],
        origin: { chatId: first.chatId, messageId: first.id },
        summary: "Waiting for the worker health check.",
        steps: steps(["Restart the worker", "Verify its health"], 1),
      });
      const second = message(
        state,
        "chat-coordinate-two",
        "assistant",
        "Restart the worker is running from the other conversation. Your approved concurrency change will follow it; I’ll recheck the worker configuration first.",
      );
      operation(state, {
        id: "coord-concurrency",
        source: "variables",
        kind: "change",
        title: "Increase worker concurrency",
        state: "queued",
        destinations: ["processes", "variables"],
        origin: { chatId: second.chatId, messageId: second.id },
        summary: "Queued · after Restart the worker",
        steps: [
          { label: "Wait for Restart the worker to finish", state: "pending" },
        ],
      });
      update(state, "coord-concurrency", {
        waitingForId: "coord-restart",
        waitingForTitle: "Restart the worker",
      });
      operation(state, {
        id: "coord-inspect",
        source: "inspection",
        kind: "inspection",
        title: "Inspect worker logs",
        state: "inspected",
        destinations: ["logs"],
        origin: null,
        summary: "Read-only inspection completed while the change was running.",
        evidence:
          "Worker is reconnecting; no fatal errors in the latest 100 lines.",
      });
    },
  },
  {
    id: "queue-recheck",
    title: "Facts changed while waiting",
    note: "The first change finished. A changed worker definition needs fresh approval; the queued change has not run.",
    clock: "2026-09-11T15:02:00.000Z",
    apply: (state) => {
      update(state, "coord-restart", {
        state: "verified",
        summary: "Worker restarted and healthy.",
        steps: undefined,
        evidence: "Worker connected and processed its health task.",
      });
      update(state, "coord-concurrency", {
        state: "proposed",
        waitingForId: null,
        waitingForTitle: null,
        steps: undefined,
        summary:
          "The worker definition changed while this was queued. Review the new configuration before applying concurrency.",
        decision: {
          kind: "approval",
          note: "Worker now runs in the updated image. Set concurrency to 2 in that configuration and restart this process.",
          action: "Approve updated change",
          inputs: [],
        },
      });
    },
  },
  {
    id: "queue-cancelled",
    title: "Cancelled, kept in History",
    note: "Cancellation is a recorded outcome, not a deleted proposal.",
    clock: "2026-09-11T15:03:00.000Z",
    apply: (state) =>
      update(state, "coord-concurrency", {
        state: "cancelled",
        decision: null,
        summary: "Cancelled by the user. Worker configuration was not changed.",
      }),
  },
);
