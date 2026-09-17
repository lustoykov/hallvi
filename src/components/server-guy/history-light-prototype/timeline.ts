// PROTOTYPE · prototype/history-tasks · throwaway.
//
// The shared synthetic timeline. Three fictional applications, written as the
// two things the product already stores: saved information records and
// execution records. Nothing here is real, nothing here is loaded from a
// database, and nothing here goes near an application.
//
// Every variant reads the same timeline, so a difference between A, B and C is
// a difference in the design and never in the facts.
//
// The one thing to notice while reading this file: each record names the
// executions it rests on in `evidence`, and names the message that asked for
// the work. That field is in the product's schema today and Pi leaves it
// empty, which is why the shipped History has to offer "what ran around this"
// instead of "what produced this". Every variant here depends on those links
// being written.

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import type { ChatSummary } from "@/server/types";

export type StateId = "paperless" | "notes" | "shop";

export interface StateChoice {
  id: StateId;
  label: string;
  note: string;
}

export const states: StateChoice[] = [
  {
    id: "paperless",
    label: "Paperless · dense",
    note: "Six days, twelve pieces of work, every event in the brief",
  },
  {
    id: "notes",
    label: "Notes · sparse",
    note: "Three days, three pieces of work",
  },
  {
    id: "shop",
    label: "Shop · dense",
    note: "A release that failed and was not retried, two commands nobody claimed",
  },
];

export interface Timeline {
  applicationName: string;
  records: SavedInformation[];
  executions: ExecutionRecord[];
  chats: ChatSummary[];
}

const DAY = 86_400_000;

/** A fixed wall clock inside a chosen day, so the fixture is deterministic. */
function at(now: number, daysAgo: number, hour: number, minute: number) {
  const base = new Date(now - daysAgo * DAY);
  base.setHours(hour, minute, 0, 0);
  return base.toISOString();
}

interface ExecutionInput {
  id: string;
  run: string;
  chat: string;
  tool: string;
  target: string;
  input: string;
  status: ExecutionRecord["status"];
  output?: string;
  exitCode?: number | null;
  startedAt: string;
  seconds?: number;
}

function execution(
  applicationId: string,
  input: ExecutionInput,
): ExecutionRecord {
  const finished = new Date(
    Date.parse(input.startedAt) + (input.seconds ?? 4) * 1000,
  ).toISOString();
  const settled =
    input.status !== "awaiting-approval" && input.status !== "running";
  return {
    id: input.id,
    applicationId,
    chatId: input.chat,
    runId: input.run,
    tool: input.tool,
    target: input.target,
    input: input.input,
    mode: "pi-decides",
    status: input.status,
    output: input.output ?? "",
    exitCode: input.exitCode ?? (input.status === "succeeded" ? 0 : undefined),
    createdAt: input.startedAt,
    outputAt: input.output ? finished : undefined,
    finishedAt: settled ? finished : undefined,
  };
}

type Presentation = NonNullable<SavedInformation["presentation"]>;

interface RecordInput {
  id: string;
  title: string;
  body: string;
  at: string;
  /** The executions this record rests on, by id. Written at save time. */
  from: string[];
  /** The message that asked for the work, when a conversation asked. */
  message?: string;
  presentation: Presentation;
}

function record(applicationId: string, input: RecordInput): SavedInformation {
  return {
    id: input.id,
    applicationId,
    title: input.title,
    body: input.body,
    evidence: [
      ...(input.message
        ? [{ type: "message" as const, id: input.message }]
        : []),
      ...input.from.map((id) => ({ type: "execution" as const, id })),
    ],
    establishedAt: input.at,
    createdAt: input.at,
    updatedAt: input.at,
    retiredAt: null,
    presentation: input.presentation,
  };
}

function chat(
  id: string,
  applicationId: string,
  title: string,
  kind: "main" | "side",
  updatedAt: string,
): ChatSummary {
  return {
    id,
    applicationId,
    title,
    kind,
    status: "idle",
    createdAt: updatedAt,
    updatedAt,
    archivedAt: null,
    lastActivityAt: updatedAt,
    currentResponseId: null,
    nativeSessionId: null,
  } as ChatSummary;
}

/* -------------------------------------------------------------------------- */
/* Paperless — the dense state, carrying every event the brief names.       */
/* -------------------------------------------------------------------------- */

function paperless(now: number): Timeline {
  const id = "paperless";
  const main = "chat-paperless-main";
  const side = "chat-paperless-side";
  const ex: ExecutionRecord[] = [];
  const records: SavedInformation[] = [];
  const add = (input: ExecutionInput) => {
    ex.push(execution(id, input));
    return input.id;
  };

  // Day −5 · the first deployment, which worked.
  const t1 = at(now, 5, 9, 12);
  add({
    id: "p-e1",
    run: "run-p1",
    chat: main,
    tool: "bash",
    target: "workspace",
    input: '{"command":"set -euo pipefail\\ncat docker-compose.yml"}',
    status: "succeeded",
    output:
      "services:\n  webserver:\n    image: ghcr.io/paperless-ngx/paperless-ngx:2.13.5\n  broker:\n    image: docker.io/library/redis:7\n  db:\n    image: docker.io/library/postgres:16",
    startedAt: t1,
    seconds: 2,
  });
  add({
    id: "p-e2",
    run: "run-p1",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input:
      '{"command":"set -euo pipefail\\ndocker compose pull\\ndocker compose up -d"}',
    status: "succeeded",
    output:
      "webserver Pulling\nbroker Pulling\ndb Pulling\nwebserver Pulled\nbroker Pulled\ndb Pulled\n Network paperless_default  Created\n Container paperless-db-1  Started\n Container paperless-broker-1  Started\n Container paperless-webserver-1  Started",
    startedAt: at(now, 5, 9, 14),
    seconds: 96,
  });
  add({
    id: "p-e3",
    run: "run-p1",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input: '{"command":"docker compose ps --format json"}',
    status: "succeeded",
    output:
      '{"Name":"paperless-webserver-1","State":"running","Health":"healthy"}\n{"Name":"paperless-broker-1","State":"running","Health":""}\n{"Name":"paperless-db-1","State":"running","Health":"healthy"}',
    startedAt: at(now, 5, 9, 16),
    seconds: 3,
  });
  add({
    id: "p-e4",
    run: "run-p1",
    chat: main,
    tool: "check_public_access",
    target: "http://203.0.113.41:8000/",
    input: '{"url":"http://203.0.113.41:8000/"}',
    status: "succeeded",
    output:
      "HTTP/1.1 200 OK\ncontent-type: text/html; charset=utf-8\nserver: nginx",
    startedAt: at(now, 5, 9, 18),
    seconds: 2,
  });
  records.push(
    record(id, {
      id: "p-r1",
      title: "Paperless is serving 2.13.5 at 203.0.113.41",
      body: "Three containers came up and the home page answered 200 over plain HTTP. No certificate yet.",
      at: at(now, 5, 9, 19),
      message: "msg-p1",
      from: ["p-e1", "p-e2", "p-e3", "p-e4"],
      presentation: {
        views: ["deployment", "overview"],
        role: "outcome",
        status: "verified",
        checks: [
          { key: "http", label: "Home page answered 200", status: "passed" },
          { key: "db", label: "Postgres reported healthy", status: "passed" },
        ],
        facts: [
          { key: "revision", label: "Revision", value: "a1b2c3d", mono: true },
          {
            key: "image",
            label: "Image",
            value: "paperless-ngx:2.13.5",
            mono: true,
          },
          { key: "host", label: "Host", value: "203.0.113.41" },
        ],
        content: {
          kind: "deployment",
          repositoryUrl: "https://github.com/prototype/paperless",
          revision: "a1b2c3d",
          image: "ghcr.io/paperless-ngx/paperless-ngx:2.13.5",
        } as Presentation["content"],
      },
    }),
  );

  // Day −4 · a private way in.
  add({
    id: "p-e5",
    run: "run-p2",
    chat: main,
    tool: "open_server_port",
    target: "root@203.0.113.41:22",
    input: '{"remotePort":8000,"localPort":8010}',
    status: "succeeded",
    output: "Forwarding 127.0.0.1:8010 -> 203.0.113.41:8000",
    startedAt: at(now, 4, 14, 2),
    seconds: 3,
  });
  records.push(
    record(id, {
      id: "p-r2",
      title: "Paperless is reachable only through this Mac",
      body: "The host firewall now refuses 8000 from the internet. The way in is an SSH tunnel this controller holds open.",
      at: at(now, 4, 14, 4),
      message: "msg-p2",
      from: ["p-e5"],
      presentation: {
        views: ["domains", "security"],
        role: "outcome",
        status: "verified",
        states: {
          ref: { kind: "access", id: "paperless-web" },
          presence: "present",
        },
        checks: [
          {
            key: "tunnel",
            label: "Tunnel answered on 127.0.0.1:8010",
            status: "passed",
          },
        ],
        facts: [
          { key: "mode", label: "Reach", value: "Private, through this Mac" },
          { key: "port", label: "Local port", value: "8010", mono: true },
        ],
        url: "http://127.0.0.1:8010/",
        content: {
          kind: "application-access",
          mode: "private",
          localPort: 8010,
          remotePort: 8000,
        } as Presentation["content"],
      } as Presentation,
    }),
  );

  // Day −3 · a backup that no conversation asked for.
  add({
    id: "p-e6",
    run: "run-p3",
    chat: "",
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input:
      '{"command":"set -euo pipefail\\npg_dump -Fc paperless > /tmp/paperless.dump\\nrclone copy /tmp/paperless.dump r2:paperless-backups/"}',
    status: "succeeded",
    output:
      "pg_dump: saving database definition\nTransferred:   184.226 MiB / 184.226 MiB, 100%, 22.310 MiB/s, ETA 0s\nTransferred:            1 / 1, 100%\nElapsed time:         8.4s",
    startedAt: at(now, 3, 3, 15),
    seconds: 24,
  });
  records.push(
    record(id, {
      id: "p-r3",
      title: "Nightly copy of the database reached R2",
      body: "184 MB written to r2:paperless-backups/2026-09-14.dump. Nobody has opened this copy, so it is not yet proof of a restore.",
      at: at(now, 3, 3, 16),
      from: ["p-e6"],
      presentation: {
        views: ["backups"],
        role: "outcome",
        status: "verified",
        states: {
          ref: { kind: "backup-copy", id: "paperless-db" },
          presence: "present",
        },
        checks: [{ key: "size", label: "Copy is 184 MB", status: "info" }],
        facts: [
          { key: "size", label: "Size", value: "184 MB" },
          { key: "target", label: "Where", value: "r2:paperless-backups" },
        ],
      },
    }),
  );

  // Day −3 · a release that failed while the old one kept serving.
  const t5 = at(now, 3, 16, 40);
  add({
    id: "p-e7",
    run: "run-p4",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input: '{"command":"docker compose pull webserver"}',
    status: "succeeded",
    output: "webserver Pulling\nwebserver Pulled",
    startedAt: t5,
    seconds: 41,
  });
  add({
    id: "p-e8",
    run: "run-p4",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input:
      '{"command":"set -euo pipefail\\ndocker compose run --rm webserver python manage.py migrate"}',
    status: "failed",
    exitCode: 1,
    output:
      'Operations to perform:\n  Apply all migrations: documents, paperless_mail\nRunning migrations:\n  Applying documents.1053_customfieldinstance… ERROR\ndjango.db.utils.ProgrammingError: column "value_select" of relation "documents_customfieldinstance" already exists\n\nThe migration was rolled back. No schema change was committed.',
    startedAt: at(now, 3, 16, 42),
    seconds: 18,
  });
  add({
    id: "p-e9",
    run: "run-p4",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input: '{"command":"docker compose ps --format json"}',
    status: "succeeded",
    output:
      '{"Name":"paperless-webserver-1","State":"running","Health":"healthy","Image":"paperless-ngx:2.13.5"}',
    startedAt: at(now, 3, 16, 43),
    seconds: 3,
  });
  records.push(
    record(id, {
      id: "p-r4",
      title: "Release 2.14.0 stopped at the migration; 2.13.5 is still serving",
      body: "The migration failed and rolled itself back, so nothing was committed and the running container was never replaced. Visitors are still on 2.13.5.",
      at: at(now, 3, 16, 44),
      message: "msg-p4",
      from: ["p-e7", "p-e8", "p-e9"],
      presentation: {
        views: ["deployment"],
        role: "outcome",
        status: "failed",
        checks: [
          { key: "migrate", label: "Migration rolled back", status: "failed" },
          { key: "serving", label: "2.13.5 still answering", status: "passed" },
        ],
        facts: [
          { key: "revision", label: "Revision", value: "a1b2c3d", mono: true },
          {
            key: "image",
            label: "Image",
            value: "paperless-ngx:2.13.5",
            mono: true,
          },
          { key: "host", label: "Host", value: "203.0.113.41" },
        ],
        nextStep:
          "The column the migration adds is already there. Someone has to decide whether to fake the migration or roll the schema back before 2.14.0 can go out.",
      },
    }),
  );

  // Day −2 · a command nobody attributed.
  add({
    id: "p-e10",
    run: "",
    chat: "chat-gone",
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input: '{"command":"docker system df"}',
    status: "succeeded",
    output:
      "TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\nImages          11        3         6.21GB    4.02GB (64%)\nContainers      3         3         1.4MB     0B (0%)\nLocal Volumes   4         3         19.8GB    2.1GB (10%)",
    startedAt: at(now, 2, 11, 5),
    seconds: 2,
  });

  // Day −2 · an inspection that changed nothing, from the side conversation.
  add({
    id: "p-e11",
    run: "run-p5",
    chat: side,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input: '{"command":"docker compose exec -T broker redis-cli llen celery"}',
    status: "succeeded",
    output: "(integer) 0",
    startedAt: at(now, 2, 15, 30),
    seconds: 2,
  });
  add({
    id: "p-e12",
    run: "run-p5",
    chat: side,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input: '{"command":"docker compose logs --tail 40 webserver"}',
    status: "succeeded",
    output:
      "webserver-1  | [2026-09-15 15:29:41,002] [INFO] [paperless.consumer] Consuming inbox/scan_0182.pdf\nwebserver-1  | [2026-09-15 15:29:48,771] [INFO] [paperless.parsing.tesseract] OCR took 7.2s\nwebserver-1  | [2026-09-15 15:29:49,004] [INFO] [paperless.consumer] Document 1182 consumed",
    startedAt: at(now, 2, 15, 31),
    seconds: 3,
  });
  records.push(
    record(id, {
      id: "p-r5",
      title: "The consumer is not behind; OCR is simply slow",
      body: "The queue is empty and each scan takes about seven seconds in Tesseract. Nothing was changed.",
      at: at(now, 2, 15, 33),
      message: "msg-p5",
      from: ["p-e11", "p-e12"],
      presentation: {
        views: ["processes", "jobs"],
        role: "status",
        status: "info",
        checks: [
          { key: "queue", label: "Celery queue empty", status: "passed" },
          { key: "ocr", label: "OCR about 7 s a page", status: "info" },
        ],
      },
    }),
  );

  // Day −1 · the second nightly copy.
  add({
    id: "p-e13",
    run: "run-p6",
    chat: "",
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input:
      '{"command":"set -euo pipefail\\npg_dump -Fc paperless > /tmp/paperless.dump\\nrclone copy /tmp/paperless.dump r2:paperless-backups/"}',
    status: "succeeded",
    output:
      "pg_dump: saving database definition\nTransferred:   191.803 MiB / 191.803 MiB, 100%, 24.117 MiB/s, ETA 0s\nElapsed time:         8.0s",
    startedAt: at(now, 1, 3, 15),
    seconds: 22,
  });
  records.push(
    record(id, {
      id: "p-r6",
      title: "Nightly copy of the database reached R2",
      body: "192 MB written to r2:paperless-backups/2026-09-16.dump. Still nobody has opened one of these copies.",
      at: at(now, 1, 3, 16),
      from: ["p-e13"],
      presentation: {
        views: ["backups"],
        role: "outcome",
        status: "verified",
        states: {
          ref: { kind: "backup-copy", id: "paperless-db" },
          presence: "present",
        },
        checks: [{ key: "size", label: "Copy is 192 MB", status: "info" }],
        facts: [
          { key: "size", label: "Size", value: "192 MB" },
          { key: "target", label: "Where", value: "r2:paperless-backups" },
        ],
      },
    }),
  );

  // Day −1 · the private way in was dead and was reopened.
  add({
    id: "p-e14",
    run: "run-p7",
    chat: main,
    tool: "connect_server",
    target: "root@203.0.113.41:22",
    input: '{"check":"ssh"}',
    status: "succeeded",
    output: "SSH control socket open; host key matched known_hosts.",
    startedAt: at(now, 1, 10, 2),
    seconds: 3,
  });
  add({
    id: "p-e15",
    run: "run-p7",
    chat: main,
    tool: "open_server_port",
    target: "root@203.0.113.41:22",
    input: '{"remotePort":8000,"localPort":8012}',
    status: "succeeded",
    output: "Forwarding 127.0.0.1:8012 -> 203.0.113.41:8000",
    startedAt: at(now, 1, 10, 3),
    seconds: 2,
  });
  records.push(
    record(id, {
      id: "p-r7",
      title: "The private way in is open again, on a new port",
      body: "The old tunnel died when this Mac restarted. 8010 was taken by something else, so the tunnel now lands on 8012.",
      at: at(now, 1, 10, 4),
      message: "msg-p7",
      from: ["p-e14", "p-e15"],
      presentation: {
        views: ["domains", "security"],
        role: "outcome",
        status: "verified",
        states: {
          ref: { kind: "access", id: "paperless-web" },
          presence: "present",
        },
        checks: [
          {
            key: "tunnel",
            label: "Tunnel answered on 127.0.0.1:8012",
            status: "passed",
          },
        ],
        facts: [
          { key: "mode", label: "Reach", value: "Private, through this Mac" },
          { key: "port", label: "Local port", value: "8012", mono: true },
        ],
        url: "http://127.0.0.1:8012/",
        content: {
          kind: "application-access",
          mode: "private",
          localPort: 8012,
          remotePort: 8000,
        } as Presentation["content"],
      } as Presentation,
    }),
  );

  // Day −1 · something that was offered and turned down.
  add({
    id: "p-e16",
    run: "run-p8",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input:
      '{"command":"set -euo pipefail\\ndocker image prune -a -f\\ndocker volume prune -f"}',
    status: "declined",
    output: "",
    startedAt: at(now, 1, 17, 20),
    seconds: 0,
  });

  // Today · a settings change that worked, and one still waiting.
  add({
    id: "p-e17",
    run: "run-p9",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input:
      '{"command":"set -euo pipefail\\nsed -i \'s/^PAPERLESS_OCR_THREADS=.*/PAPERLESS_OCR_THREADS=4/\' .env\\ndocker compose up -d webserver"}',
    status: "succeeded",
    output:
      " Container paperless-webserver-1  Recreated\n Container paperless-webserver-1  Started",
    startedAt: at(now, 0, 9, 40),
    seconds: 31,
  });
  records.push(
    record(id, {
      id: "p-r8",
      title: "OCR now runs on four threads",
      body: "PAPERLESS_OCR_THREADS went from 1 to 4 and the web container was recreated to pick it up.",
      at: at(now, 0, 9, 41),
      message: "msg-p9",
      from: ["p-e17"],
      presentation: {
        views: ["variables", "processes"],
        role: "outcome",
        status: "verified",
        states: {
          ref: { kind: "variable", id: "PAPERLESS_OCR_THREADS" },
          presence: "present",
        },
        checks: [
          {
            key: "restart",
            label: "Web container recreated",
            status: "passed",
          },
        ],
        facts: [
          { key: "threads", label: "OCR threads", value: "4" },
          { key: "source", label: "Set in", value: ".env on the host" },
        ],
      },
    }),
  );
  add({
    id: "p-e18",
    run: "run-p10",
    chat: main,
    tool: "server_bash",
    target: "root@203.0.113.41:22",
    input:
      '{"command":"set -euo pipefail\\ncertbot --nginx -d paperless.example.org --agree-tos -m owner@example.org"}',
    status: "awaiting-approval",
    output: "",
    startedAt: at(now, 0, 10, 55),
  });

  // The earlier variable value, so a change has a before as well as an after.
  records.unshift(
    record(id, {
      id: "p-r0",
      title: "OCR runs on a single thread",
      body: "Read back from .env on the host while looking at why scans take so long.",
      at: at(now, 2, 15, 32),
      message: "msg-p5",
      from: ["p-e12"],
      presentation: {
        views: ["variables"],
        role: "status",
        status: "info",
        states: {
          ref: { kind: "variable", id: "PAPERLESS_OCR_THREADS" },
          presence: "present",
        },
        checks: [],
        facts: [
          { key: "threads", label: "OCR threads", value: "1" },
          { key: "source", label: "Set in", value: ".env on the host" },
        ],
      },
    }),
  );

  return {
    applicationName: "Paperless",
    records,
    executions: ex,
    chats: [
      chat(main, id, "Deploy Paperless", "main", at(now, 0, 10, 55)),
      chat(side, id, "Why is the consumer slow?", "side", at(now, 2, 15, 33)),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Notes — the sparse state.                                                */
/* -------------------------------------------------------------------------- */

function notes(now: number): Timeline {
  const id = "notes";
  const main = "chat-notes-main";
  const ex: ExecutionRecord[] = [];
  const records: SavedInformation[] = [];
  const add = (input: ExecutionInput) => ex.push(execution(id, input));

  add({
    id: "n-e1",
    run: "run-n1",
    chat: main,
    tool: "server_bash",
    target: "root@198.51.100.7:22",
    input: '{"command":"set -euo pipefail\\ndocker compose up -d --build"}',
    status: "succeeded",
    output:
      " Building notes\n #8 exporting layers 1.4s done\n Container notes-web-1  Started",
    startedAt: at(now, 2, 20, 10),
    seconds: 148,
  });
  add({
    id: "n-e2",
    run: "run-n1",
    chat: main,
    tool: "check_public_access",
    target: "http://198.51.100.7:3000/",
    input: '{"url":"http://198.51.100.7:3000/"}',
    status: "succeeded",
    output: "HTTP/1.1 200 OK\ncontent-length: 1841",
    startedAt: at(now, 2, 20, 13),
    seconds: 2,
  });
  records.push(
    record(id, {
      id: "n-r1",
      title: "Notes is serving 7c31f9e at 198.51.100.7",
      body: "Built from source on the host and answered 200 on port 3000.",
      at: at(now, 2, 20, 14),
      message: "msg-n1",
      from: ["n-e1", "n-e2"],
      presentation: {
        views: ["deployment", "overview"],
        role: "outcome",
        status: "verified",
        checks: [
          { key: "http", label: "Home page answered 200", status: "passed" },
        ],
        facts: [
          { key: "revision", label: "Revision", value: "7c31f9e", mono: true },
          { key: "host", label: "Host", value: "198.51.100.7" },
        ],
        content: {
          kind: "deployment",
          repositoryUrl: "https://github.com/prototype/notes",
          revision: "7c31f9e",
          image: "notes:local",
        } as Presentation["content"],
      },
    }),
  );

  add({
    id: "n-e3",
    run: "run-n2",
    chat: main,
    tool: "server_bash",
    target: "root@198.51.100.7:22",
    input: '{"command":"df -h /"}',
    status: "succeeded",
    output:
      "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        38G  4.1G   32G  12% /",
    startedAt: at(now, 1, 9, 5),
    seconds: 2,
  });
  records.push(
    record(id, {
      id: "n-r2",
      title: "The disk has 32 GB free",
      body: "Looked because the build was slow. It was not the disk; nothing was changed.",
      at: at(now, 1, 9, 6),
      message: "msg-n2",
      from: ["n-e3"],
      presentation: {
        views: ["storage"],
        role: "status",
        status: "info",
        checks: [
          { key: "disk", label: "12% of the root disk used", status: "info" },
        ],
        facts: [{ key: "free", label: "Free", value: "32 GB" }],
      },
    }),
  );

  add({
    id: "n-e4",
    run: "run-n3",
    chat: main,
    tool: "server_bash",
    target: "root@198.51.100.7:22",
    input:
      '{"command":"set -euo pipefail\\napt-get update\\napt-get install -y ufw\\nufw allow 80,443/tcp\\nufw --force enable"}',
    status: "awaiting-approval",
    output: "",
    startedAt: at(now, 0, 11, 30),
  });

  return {
    applicationName: "Notes",
    records,
    executions: ex,
    chats: [chat(main, id, "Deploy Notes", "main", at(now, 0, 11, 30))],
  };
}

/* -------------------------------------------------------------------------- */
/* Shop — dense, with a failure nobody went back to.                        */
/* -------------------------------------------------------------------------- */

function shop(now: number): Timeline {
  const id = "shop";
  const main = "chat-shop-main";
  const side = "chat-shop-side";
  const ex: ExecutionRecord[] = [];
  const records: SavedInformation[] = [];
  const add = (input: ExecutionInput) => ex.push(execution(id, input));

  add({
    id: "s-e1",
    run: "run-s1",
    chat: main,
    tool: "server_bash",
    target: "root@192.0.2.88:22",
    input: '{"command":"set -euo pipefail\\ndocker compose up -d"}',
    status: "succeeded",
    output:
      " Container shop-db-1  Started\n Container shop-redis-1  Started\n Container shop-web-1  Started\n Container shop-worker-1  Started",
    startedAt: at(now, 6, 13, 2),
    seconds: 74,
  });
  add({
    id: "s-e2",
    run: "run-s1",
    chat: main,
    tool: "check_public_access",
    target: "https://shop.example.net/",
    input: '{"url":"https://shop.example.net/"}',
    status: "succeeded",
    output:
      "HTTP/2 200\nserver: Caddy\nstrict-transport-security: max-age=31536000",
    startedAt: at(now, 6, 13, 4),
    seconds: 2,
  });
  records.push(
    record(id, {
      id: "s-r1",
      title: "Shop is serving 5e90aa1 at shop.example.net",
      body: "Four containers up behind Caddy, with a certificate it fetched itself.",
      at: at(now, 6, 13, 5),
      message: "msg-s1",
      from: ["s-e1", "s-e2"],
      presentation: {
        views: ["deployment", "overview"],
        role: "outcome",
        status: "verified",
        checks: [
          { key: "https", label: "HTTPS answered 200", status: "passed" },
          { key: "hsts", label: "HSTS header present", status: "passed" },
        ],
        facts: [
          { key: "revision", label: "Revision", value: "5e90aa1", mono: true },
          { key: "image", label: "Image", value: "shop:5e90aa1", mono: true },
          { key: "host", label: "Host", value: "192.0.2.88" },
        ],
        content: {
          kind: "deployment",
          repositoryUrl: "https://github.com/prototype/shop",
          revision: "5e90aa1",
          image: "shop:5e90aa1",
        } as Presentation["content"],
      },
    }),
  );

  add({
    id: "s-e3",
    run: "run-s2",
    chat: "",
    tool: "server_bash",
    target: "root@192.0.2.88:22",
    input:
      '{"command":"pg_dump -Fc shop | rclone rcat r2:shop-backups/nightly.dump"}',
    status: "succeeded",
    output:
      "Transferred:   2.418 GiB / 2.418 GiB, 100%\nElapsed time:  1m52.0s",
    startedAt: at(now, 4, 3, 30),
    seconds: 118,
  });
  records.push(
    record(id, {
      id: "s-r2",
      title: "Nightly copy of the shop database reached R2",
      body: "2.4 GB written. No restore has been attempted from any of these copies.",
      at: at(now, 4, 3, 33),
      from: ["s-e3"],
      presentation: {
        views: ["backups"],
        role: "outcome",
        status: "verified",
        states: {
          ref: { kind: "backup-copy", id: "shop-db" },
          presence: "present",
        },
        checks: [{ key: "size", label: "Copy is 2.4 GB", status: "info" }],
        facts: [
          { key: "size", label: "Size", value: "2.4 GB" },
          { key: "target", label: "Where", value: "r2:shop-backups" },
        ],
      },
    }),
  );

  add({
    id: "s-e4",
    run: "",
    chat: "chat-gone",
    tool: "server_bash",
    target: "root@192.0.2.88:22",
    input: '{"command":"systemctl status docker --no-pager"}',
    status: "succeeded",
    output:
      "● docker.service - Docker Application Container Engine\n   Active: active (running) since Fri 2026-09-11 13:01:44 UTC\n  Process: 812 ExecStart=/usr/bin/dockerd",
    startedAt: at(now, 3, 22, 41),
    seconds: 2,
  });
  add({
    id: "s-e5",
    run: "",
    chat: "chat-gone",
    tool: "bash",
    target: "workspace",
    input: '{"command":"git log --oneline -5"}',
    status: "succeeded",
    output:
      "5e90aa1 Checkout: keep the cart when the session rolls\n0b7712c Bump stripe to 12.4\n77a1e30 Fix tax rounding on refunds",
    startedAt: at(now, 3, 22, 42),
    seconds: 1,
  });

  add({
    id: "s-e6",
    run: "run-s3",
    chat: main,
    tool: "server_bash",
    target: "root@192.0.2.88:22",
    input: '{"command":"set -euo pipefail\\ndocker compose up -d web worker"}',
    status: "failed",
    exitCode: 125,
    output:
      " Container shop-web-1  Recreate\nError response from daemon: driver failed programming external connectivity on endpoint shop-web-1: Bind for 0.0.0.0:443 failed: port is already allocated\n Container shop-web-1  Started (previous image)",
    startedAt: at(now, 2, 18, 12),
    seconds: 19,
  });
  add({
    id: "s-e7",
    run: "run-s3",
    chat: main,
    tool: "check_public_access",
    target: "https://shop.example.net/",
    input: '{"url":"https://shop.example.net/"}',
    status: "succeeded",
    output: "HTTP/2 200\nserver: Caddy",
    startedAt: at(now, 2, 18, 13),
    seconds: 2,
  });
  records.push(
    record(id, {
      id: "s-r3",
      title:
        "Release 2f44c08 could not take port 443; 5e90aa1 is still serving",
      body: "A second Caddy from an earlier experiment still holds 443, so the new container never bound. The old one was never stopped and visitors saw nothing.",
      at: at(now, 2, 18, 14),
      message: "msg-s3",
      from: ["s-e6", "s-e7"],
      presentation: {
        views: ["deployment"],
        role: "outcome",
        status: "failed",
        checks: [
          {
            key: "bind",
            label: "Port 443 already allocated",
            status: "failed",
          },
          {
            key: "serving",
            label: "5e90aa1 still answering",
            status: "passed",
          },
        ],
        facts: [
          { key: "revision", label: "Revision", value: "5e90aa1", mono: true },
          { key: "image", label: "Image", value: "shop:5e90aa1", mono: true },
          { key: "host", label: "Host", value: "192.0.2.88" },
        ],
        nextStep:
          "Find out what the earlier Caddy belongs to before stopping it. Nothing has been done about this since.",
      },
    }),
  );

  add({
    id: "s-e8",
    run: "run-s4",
    chat: side,
    tool: "server_bash",
    target: "root@192.0.2.88:22",
    input:
      '{"command":"docker compose exec -T db psql -c \\"select count(*) from orders\\""}',
    status: "succeeded",
    output: " count \n-------\n 41822\n(1 row)",
    startedAt: at(now, 1, 12, 20),
    seconds: 3,
  });
  records.push(
    record(id, {
      id: "s-r4",
      title: "The orders table holds 41,822 rows",
      body: "Counted while working out how big a restore would be. Nothing was changed.",
      at: at(now, 1, 12, 21),
      message: "msg-s4",
      from: ["s-e8"],
      presentation: {
        views: ["database"],
        role: "status",
        status: "info",
        checks: [
          { key: "rows", label: "41,822 orders on record", status: "info" },
        ],
        facts: [{ key: "rows", label: "Orders", value: "41,822" }],
      },
    }),
  );

  add({
    id: "s-e9",
    run: "run-s5",
    chat: main,
    tool: "server_bash",
    target: "root@192.0.2.88:22",
    input:
      '{"command":"set -euo pipefail\\ndocker stop $(docker ps -q --filter name=caddy)"}',
    status: "declined",
    output: "",
    startedAt: at(now, 0, 8, 50),
    seconds: 0,
  });

  return {
    applicationName: "Shop",
    records,
    executions: ex,
    chats: [
      chat(main, id, "Deploy Shop", "main", at(now, 0, 8, 50)),
      chat(side, id, "How big is a restore?", "side", at(now, 1, 12, 21)),
    ],
  };
}

export function timelineFor(state: StateId, now: number): Timeline {
  if (state === "notes") return notes(now);
  if (state === "shop") return shop(now);
  return paperless(now);
}
