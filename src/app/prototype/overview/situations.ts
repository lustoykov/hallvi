// PROTOTYPE · prototype/overview-directions · throwaway.
// DEVELOPMENT PREVIEW ONLY: every record here is invented.
//
// The situations an Overview has to read well, layered on the traffic
// fixtures' own records: an application that is looked after with nothing
// open, the same with two things open, a new one nobody has looked at yet, a
// private one whose connection dropped, and a public one that stopped
// answering.

import type { Reachability } from "@/components/hallvi/deployment-prototype/page-head";
import type { Pulse } from "@/components/hallvi/pulse";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { Ref, SavedInformation } from "@/server/operator-data";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const iso = (at: number) => new Date(at).toISOString();

type Presentation = NonNullable<SavedInformation["presentation"]>;

export interface Situation {
  id: string;
  label: string;
  reachable: Reachability;
  pulse: Pulse;
  records: (
    base: SavedInformation[],
    application: { id: string; name: string },
    now: number,
  ) => SavedInformation[];
  executions: (applicationId: string, now: number) => ExecutionRecord[];
}

const fact = (
  key: string,
  value: string,
  claim: string = "configuration",
  basis: string = "observed",
) => ({ key, label: key, value, claim, basis }) as never;

const check = (
  key: string,
  label: string,
  status: "passed" | "failed" | "info",
  claim: string = "reachability",
  extra: object = {},
) => ({ key, label, status, claim, basis: "observed", ...extra }) as never;

function maker(applicationId: string, now: number, prefix: string) {
  let counter = 0;
  const record = (
    input: Partial<Presentation> & {
      ago: number;
      title: string;
      body?: string;
    },
  ): SavedInformation => {
    const { ago, title, body, ...presentation } = input;
    const at = iso(now - ago);
    return {
      id: `${applicationId}-${prefix}-${++counter}`,
      applicationId,
      title,
      body: body ?? "",
      evidence: [],
      establishedAt: at,
      createdAt: at,
      updatedAt: at,
      retiredAt: null,
      presentation: {
        views: ["overview"],
        role: "status",
        status: "verified",
        checks: [],
        ...presentation,
      },
    } as SavedInformation;
  };
  const states = (
    ref: Ref,
    input: Partial<Presentation> & {
      ago: number;
      title: string;
      body?: string;
    },
  ) => record({ states: { ref, presence: "present" }, ...input });
  return { record, states };
}

/** What Hallvi has checked on an application it looks after. */
function care(
  { id, name }: { id: string; name: string },
  now: number,
): SavedInformation[] {
  const { states } = maker(id, now, "care");
  const host = `${name.toLowerCase()}.example.com`;
  return [
    states(
      { kind: "application", id },
      {
        ago: 6 * MINUTE,
        title: `${name} is mapped`,
        views: ["overview", "architecture"],
        checks: [check("http", "Answers web requests", "passed", "liveness")],
        content: {
          kind: "topology",
          from: "observed",
          parts: [
            {
              id: "web",
              kind: "web",
              name,
              role: "the web app",
              plain: "the web app",
            },
            {
              id: "data",
              kind: "volume",
              name: "Uploads",
              role: "uploaded files",
              plain: "uploaded files",
            },
          ],
          edges: [{ from: "web", to: "data", network: "disk" }],
        },
      },
    ),
    states(
      { kind: "process", id: "web" },
      {
        ago: 6 * MINUTE,
        title: "The web container is running",
        views: ["processes"],
        checks: [
          check("http", "Answers web requests", "passed", "liveness"),
          check("container", "Its container is running", "passed", "liveness"),
        ],
      },
    ),
    states(
      { kind: "volume", id: "data" },
      {
        ago: 6 * MINUTE,
        title: "Uploads survive a restart",
        views: ["storage"],
        facts: [
          fact("path", "/var/lib/app/uploads"),
          fact("size", "2.1 GB", "contents"),
          fact("holds", "Uploaded files"),
        ],
        checks: [
          check(
            "persistence",
            "Data survives a restart",
            "passed",
            "configuration",
          ),
        ],
      },
    ),
    states(
      { kind: "host", id: "hetzner-4242" },
      {
        ago: 6 * MINUTE,
        title: "The server accepts connections",
        views: ["overview"],
        facts: [
          fact("region", "Helsinki (hel1)", "configuration", "reported"),
          fact("size", "CX23", "configuration", "reported"),
          fact("memory", "4 GB", "configuration", "reported"),
          fact("disk-used", "12.4 of 40 GB used", "contents"),
        ],
        checks: [check("ssh", "Server accepts connections", "passed")],
      },
    ),
    states(
      { kind: "backup-plan", id: "nightly" },
      {
        ago: 9 * DAY,
        title: "Backups run nightly to R2",
        views: ["backups"],
        facts: [
          fact("schedule", "Daily at 03:30", "configuration", "planned"),
          fact("destination", "Cloudflare R2", "configuration", "reported"),
          fact("destination-kind", "off-site", "configuration", "planned"),
          fact("keep", "7", "configuration", "planned"),
          fact("covers", "data"),
        ],
        checks: [
          check(
            "configured",
            "A backup is scheduled",
            "passed",
            "configuration",
          ),
        ],
      },
    ),
    states(
      { kind: "backup-copy", id: "copy-today" },
      {
        ago: 7 * HOUR,
        title: "A copy was written",
        views: ["backups"],
        facts: [
          fact("destination", "Cloudflare R2"),
          fact("destination-kind", "off-site"),
          fact("size", "1.9 GB", "contents"),
          fact("covers", "data"),
        ],
        checks: [
          check("written", "The copy was written", "passed", "identity"),
        ],
      },
    ),
    states(
      { kind: "restore-test", id: "restore-1" },
      {
        ago: 6 * HOUR,
        title: "A restore was tested",
        views: ["backups"],
        facts: [
          fact("covers", "data"),
          fact("restored-copy", "copy-today"),
          fact("took", "3 min", "contents"),
        ],
        checks: [
          check("restored", "The copy restored", "passed", "identity"),
          check(
            "started",
            "The restored application started",
            "passed",
            "liveness",
          ),
        ],
      },
    ),
    states(
      { kind: "certificate", id: host },
      {
        ago: 2 * HOUR,
        title: "HTTPS is valid",
        views: ["access"],
        facts: [
          fact("issuer", "Let's Encrypt", "identity", "reported"),
          fact("expires", iso(now + 61 * DAY), "identity", "reported"),
        ],
        checks: [check("valid", "The certificate is valid", "passed")],
      },
    ),
    states(
      { kind: "door", id: "https" },
      {
        ago: 2 * HOUR,
        title: "HTTPS is open to everyone",
        views: ["access"],
        facts: [fact("port", "443"), fact("sources", "anywhere")],
        checks: [check("open", "Port 443 answers from outside", "passed")],
      },
    ),
  ];
}

function execution(
  applicationId: string,
  now: number,
  input: {
    id: string;
    ago: number;
    intent: string;
    command: string;
    status: ExecutionRecord["status"];
    tool?: string;
  },
): ExecutionRecord {
  const at = iso(now - input.ago);
  return {
    id: `${applicationId}-run-${input.id}`,
    applicationId,
    chatId: "chat",
    runId: `run-${input.id}`,
    tool: input.tool ?? "server_bash",
    target: "root@203.0.113.7:22",
    input: JSON.stringify({ intent: input.intent, command: input.command }),
    mode: "always-ask",
    status: input.status,
    output: "",
    exitCode: input.status === "succeeded" ? 0 : null,
    createdAt: at,
    finishedAt:
      input.status === "awaiting-approval" || input.status === "running"
        ? undefined
        : at,
  };
}

const routine = (applicationId: string, now: number) => [
  execution(applicationId, now, {
    id: "load",
    ago: 25 * MINUTE,
    intent: "Read a day of traffic and server load",
    command: "sar -u -r 3600 24",
    status: "succeeded",
  }),
  execution(applicationId, now, {
    id: "restore",
    ago: 6 * HOUR,
    intent: "Restore last night's copy into a scratch container and start it",
    command: "restic restore latest --target /srv/restore-test",
    status: "succeeded",
  }),
  execution(applicationId, now, {
    id: "copy",
    ago: 7 * HOUR,
    intent: "Copy the uploads to R2",
    command: "restic backup /var/lib/app/uploads",
    status: "succeeded",
  }),
];

/** The public address the traffic fixtures record, as a private one. */
const privately = (records: SavedInformation[]) =>
  records.map((record) =>
    record.presentation?.content?.kind === "application-access"
      ? ({
          ...record,
          title: "It is reachable from this PC",
          presentation: {
            ...record.presentation,
            url: "http://127.0.0.1:18080",
            content: {
              kind: "application-access",
              mode: "private",
              server: "hetzner-4242",
              localPort: 18080,
              remotePort: 8080,
            },
          },
        } as SavedInformation)
      : record,
  );

const ANSWERING: Pulse = { app: "answering", server: "answering" };

export const SITUATIONS: Situation[] = [
  {
    id: "calm",
    label: "Looked after, nothing open",
    reachable: "open",
    pulse: ANSWERING,
    records: (base, application, now) => [...base, ...care(application, now)],
    executions: routine,
  },
  {
    id: "open",
    label: "Two things open",
    reachable: "open",
    pulse: ANSWERING,
    records: (base, application, now) => {
      const { states } = maker(application.id, now, "open");
      return [
        ...base,
        ...care(application, now),
        states(
          { kind: "process", id: "import" },
          {
            ago: 2 * HOUR,
            title: "The nightly import stopped part way",
            views: ["jobs"],
            status: "failed",
            checks: [
              check("ran", "Nightly import", "failed", "liveness", {
                detail:
                  "It exited with code 1 after 14 minutes. 2,104 of 9,800 rows were imported.",
              }),
            ],
          },
        ),
      ];
    },
    executions: (applicationId, now) => [
      execution(applicationId, now, {
        id: "restart",
        ago: 12 * MINUTE,
        intent: "Restart the web container with a 1 GB memory limit",
        command: "docker compose up -d --force-recreate web",
        status: "awaiting-approval",
      }),
      ...routine(applicationId, now),
    ],
  },
  {
    id: "new",
    label: "New, nothing checked yet",
    reachable: "open",
    pulse: ANSWERING,
    records: (base) => base,
    executions: () => [],
  },
  {
    id: "closed",
    label: "Private, connection closed",
    reachable: "closed",
    pulse: { app: "unknown", server: "answering" },
    records: (base, application, now) =>
      privately([...base, ...care(application, now)]),
    executions: routine,
  },
  {
    id: "silent",
    label: "The address stopped answering",
    reachable: "closed",
    pulse: { app: "silent", server: "answering" },
    records: (base, application, now) => [...base, ...care(application, now)],
    executions: routine,
  },
];
