// Records for states the two real journeys do not produce.
//
// Every state a view claims to support has to be seen, and a real deployment
// only ever shows a handful of them: nothing has failed, nothing has been
// withdrawn, nothing is a week old. The rest are written here.
//
// These never go near a real application. They are loaded into an isolated
// database whose only purpose is to be looked at, because a scenario record
// mixed into a real one is a lie that outlives the test.

import type { Ref, SavedInformation } from "@/server/operator-data";

type Presentation = NonNullable<SavedInformation["presentation"]>;

/**
 * Command output, which Logs is built from.
 *
 * Logs is the one destination that reads nothing from saved information: it
 * shows what Server Guy's own commands printed. A scenario with no captured
 * output leaves that page empty, which says "nothing has run" rather than
 * showing the page doing its job.
 */
export interface ScenarioExecution {
  tool: string;
  target: string;
  input: string;
  output: string;
  status: "succeeded" | "failed";
  exitCode?: number;
  /** How long ago it finished, in milliseconds. */
  ago: number;
}

export interface Scenario {
  id: string;
  name: string;
  /** What this application exists to show. */
  shows: string;
  records: SavedInformation[];
  executions?: ScenarioExecution[];
}

let counter = 0;

function record(
  applicationId: string,
  input: Partial<Presentation> & {
    at?: string | null;
    title: string;
    body?: string;
    retiredAt?: string;
  },
): SavedInformation {
  const { at, title, body, retiredAt, ...presentation } = input;
  const when = at === undefined ? new Date().toISOString() : at;
  return {
    id: `scenario-${++counter}`,
    applicationId,
    title,
    body: body ?? "",
    evidence: [],
    establishedAt: when,
    createdAt: when ?? new Date().toISOString(),
    updatedAt: when ?? new Date().toISOString(),
    retiredAt: retiredAt ?? null,
    presentation: {
      views: ["overview"],
      role: "status",
      status: "verified",
      checks: [],
      ...presentation,
    },
  } as SavedInformation;
}

const states = (
  applicationId: string,
  ref: Ref,
  input: Partial<Presentation> & {
    at?: string | null;
    title: string;
    /** Pi's own words about what happened, which some events need. */
    body?: string;
    presence?: "present" | "absent";
    retiredAt?: string;
  },
) => {
  const { presence, ...rest } = input;
  return record(applicationId, {
    states: { ref, presence: presence ?? "present" },
    ...rest,
  });
};

const fact = (
  key: string,
  value: string,
  claim: string = "configuration",
  basis: string = "observed",
) => ({ key, label: key, value, claim, basis }) as never;

const check = (
  key: string,
  status: "passed" | "failed" | "info",
  claim: string = "reachability",
  extra: object = {},
) =>
  ({
    key,
    label: key,
    status,
    claim,
    basis: "observed",
    ...extra,
  }) as never;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * One application per shape of doubt, so a reader can hold each on its own
 * rather than hunting for it inside a healthy one.
 */
export function scenarios(): Scenario[] {
  const failing = "aaaaaaaa-0000-4000-8000-000000000001";
  const ageing = "aaaaaaaa-0000-4000-8000-000000000002";
  const absent = "aaaaaaaa-0000-4000-8000-000000000003";
  const recovered = "aaaaaaaa-0000-4000-8000-000000000004";
  const withdrawn = "aaaaaaaa-0000-4000-8000-000000000005";
  const rich = "aaaaaaaa-0000-4000-8000-000000000006";
  const overclaimed = "aaaaaaaa-0000-4000-8000-000000000007";
  const notes = "aaaaaaaa-0000-4000-8000-000000000008";
  const serving = "aaaaaaaa-0000-4000-8000-000000000009";
  const backupFailed = "aaaaaaaa-0000-4000-8000-00000000000a";

  return [
    {
      id: failing,
      name: "Scenario · failing",
      shows: "A failed check, which must stay failed however old it is.",
      records: [
        states(
          failing,
          { kind: "host", id: "scenario-host" },
          {
            at: ago(9 * DAY),
            title: "The host answered nine days ago",
            checks: [check("ssh", "passed")],
            facts: [fact("region", "Helsinki", "configuration", "reported")],
          },
        ),
        states(
          failing,
          { kind: "process", id: "web" },
          {
            at: ago(40 * DAY),
            title: "The web process stopped answering",
            status: "failed",
            views: ["overview", "processes"],
            checks: [
              check("http", "failed", "liveness", {
                detail: "connection refused on 3000",
              }),
            ],
            facts: [fact("port", "3000")],
          },
        ),
        states(
          failing,
          { kind: "volume", id: "data" },
          {
            at: ago(40 * DAY),
            title: "The data did not survive a container replacement",
            status: "failed",
            views: ["storage"],
            checks: [check("persistence", "failed", "configuration")],
            facts: [fact("path", "/var/lib/app")],
          },
        ),
      ],
    },
    {
      id: ageing,
      name: "Scenario · ageing",
      shows:
        "One claim of each kind, each just past its horizon, so freshness can be read at a glance.",
      records: [
        states(
          ageing,
          { kind: "host", id: "scenario-host" },
          {
            at: ago(13 * HOUR),
            title: "Everything passed, thirteen hours ago",
            checks: [check("ssh", "passed", "reachability")],
            facts: [
              // Identity never ages; configuration ages in seven days.
              fact("server-id", "4201", "identity", "reported"),
              fact("region", "Helsinki", "configuration", "reported"),
              fact("disk-used", "3.1 of 40 GB used", "contents"),
            ],
          },
        ),
        states(
          ageing,
          { kind: "process", id: "web" },
          {
            at: ago(20 * MINUTE),
            title: "The web process answered twenty minutes ago",
            views: ["overview", "processes"],
            // Liveness expires in fifteen minutes, so this is stale and the
            // page must say unwatched rather than unhealthy.
            checks: [check("http", "passed", "liveness")],
            facts: [fact("port", "3000")],
          },
        ),
      ],
    },
    {
      id: absent,
      name: "Scenario · absent",
      shows:
        "Established absence beside things nobody has looked at, which must not read alike.",
      records: [
        states(
          absent,
          { kind: "backup-plan", id: "plan" },
          {
            title: "Nothing backs this application up",
            presence: "absent",
            views: ["backups", "overview"],
          },
        ),
        states(
          absent,
          { kind: "firewall", id: "fw" },
          {
            title: "There is no firewall in front of this server",
            presence: "absent",
            views: ["security"],
          },
        ),
        states(
          absent,
          { kind: "cdn", id: "edge" },
          {
            title: "Nothing caches in front of this application",
            presence: "absent",
            views: ["cdn"],
          },
        ),
        states(
          absent,
          { kind: "monitor", id: "watch" },
          {
            title: "Nothing is watching this application",
            presence: "absent",
            views: ["monitoring"],
          },
        ),
        // Deliberately no process, volume, database, queue or job record:
        // those destinations must read "nobody looked", not "none".
      ],
    },
    {
      id: recovered,
      name: "Scenario · recovered",
      shows:
        "A failure followed by a pass: current state recovers, History keeps both.",
      records: [
        states(
          recovered,
          { kind: "process", id: "web" },
          {
            at: ago(3 * HOUR),
            title: "The web process stopped answering",
            status: "failed",
            views: ["overview", "processes", "history"],
            checks: [
              check("http", "failed", "liveness", {
                detail: "no route to host",
              }),
            ],
            facts: [fact("port", "3000")],
          },
        ),
        states(
          recovered,
          { kind: "process", id: "web" },
          {
            at: ago(2 * MINUTE),
            title: "The web process is answering again",
            views: ["overview", "processes", "history"],
            checks: [
              check("http", "passed", "liveness", { detail: "200 in 40 ms" }),
            ],
          },
        ),
      ],
    },
    {
      id: withdrawn,
      name: "Scenario · withdrawn",
      shows:
        "A record Pi took back: gone from current state, still legible in History.",
      records: [
        states(
          withdrawn,
          { kind: "process", id: "web" },
          {
            at: ago(2 * DAY),
            title: "The web process is on port 8080",
            views: ["processes", "history"],
            facts: [fact("port", "8080")],
            checks: [check("http", "passed", "liveness")],
          },
        ),
        states(
          withdrawn,
          { kind: "process", id: "web" },
          {
            at: ago(DAY),
            title: "That port was wrong; it is 3000",
            views: ["processes", "history"],
            retiredAt: ago(HOUR),
            facts: [fact("port", "3000")],
          },
        ),
      ],
    },
    {
      id: rich,
      name: "Scenario · everything",
      shows:
        "Every destination populated at once, with awkward values: long names, Unicode, odd units.",
      records: richRecords(rich),
    },
    {
      id: "dddddddd-0000-4000-8000-000000000001",
      name: "Scenario · four releases",
      shows:
        "A first release, a second, a failed update, a retry that worked, and a resolved failure — the sequence Deployment, History and Logs each have to tell truthfully.",
      records: releaseRecords("dddddddd-0000-4000-8000-000000000001"),
    },
    {
      id: "cccccccc-0000-4000-8000-000000000001",
      name: "Scenario · Paperless-ngx",
      shows:
        "The shape that broke the map: three backing services, four data locations, and the names an upstream Compose file actually uses.",
      records: paperlessRecords("cccccccc-0000-4000-8000-000000000001"),
    },
    {
      id: notes,
      name: "Scenario · Notes",
      shows:
        "The smallest real application: one process, one volume, one release — and a way in that has closed while everything else is fine.",
      records: notesRecords(notes),
      executions: notesExecutions(),
    },
    {
      id: serving,
      name: "Scenario · older release serving",
      shows:
        "The newest release failed and was not retried, so what answers the address is the release before it.",
      records: servingRecords(serving),
      executions: servingExecutions(),
    },
    {
      id: overclaimed,
      name: "Scenario · overclaimed",
      shows:
        "A plan that promises more than the copies deliver: off-site intended, beside the application in fact, and one volume nobody copies.",
      records: overclaimedRecords(overclaimed),
    },
    {
      id: backupFailed,
      name: "Scenario · backup failed",
      shows:
        "A healthy older copy followed by an actual failed copy, including the operational reason.",
      records: failedBackupRecords(backupFailed),
    },
  ];
}

function failedBackupRecords(id: string): SavedInformation[] {
  return [
    states(
      id,
      { kind: "application", id },
      {
        at: ago(2 * HOUR),
        title: "Orders",
        views: ["architecture", "overview"],
        content: {
          kind: "topology",
          from: "observed",
          parts: [
            {
              id: "orders-host",
              kind: "host",
              name: "orders-hel1",
              role: "the application server",
              plain: "the server",
            },
            {
              id: "orders-web",
              kind: "web",
              name: "Orders",
              role: "the application",
              plain: "the application",
            },
            {
              id: "orders-data",
              kind: "volume",
              name: "Order database",
              role: "orders and customer details",
              plain: "the application data",
            },
          ],
          edges: [
            { from: "orders-host", to: "orders-web", network: "private" },
            { from: "orders-web", to: "orders-data", network: "disk" },
          ],
        },
      },
    ),
    states(
      id,
      { kind: "volume", id: "orders-data" },
      {
        at: ago(2 * HOUR),
        title: "The order database survives replacement",
        views: ["storage"],
        facts: [
          fact("path", "/srv/orders/data"),
          fact("holds", "Orders and customer details"),
          fact("size", "86 MB", "contents"),
        ],
        checks: [check("persistence", "passed", "configuration")],
      },
    ),
    states(
      id,
      { kind: "backup-plan", id: "nightly" },
      {
        at: ago(4 * DAY),
        title: "Orders are copied nightly",
        views: ["backups"],
        facts: [
          fact("schedule", "Daily at 02:30", "configuration", "planned"),
          fact(
            "destination",
            "R2 · orders-backups",
            "configuration",
            "planned",
          ),
          fact("destination-kind", "off-site", "configuration", "planned"),
          fact("keep", "7 daily copies", "configuration", "planned"),
          fact("covers", "orders-data"),
        ],
      },
    ),
    states(
      id,
      { kind: "backup-copy", id: "orders-copy-yesterday" },
      {
        at: ago(30 * HOUR),
        title: "The previous copy completed",
        views: ["backups"],
        facts: [
          fact("destination", "R2 · orders-backups"),
          fact("destination-kind", "off-site"),
          fact("covers", "orders-data"),
          fact("size", "84 MB", "contents"),
        ],
      },
    ),
    states(
      id,
      { kind: "backup-copy", id: "orders-copy-today" },
      {
        at: ago(6 * HOUR),
        status: "failed",
        title: "The latest copy did not finish",
        body: "The archive stopped because /var ran out of space.",
        views: ["backups"],
        facts: [
          fact("destination", "R2 · orders-backups"),
          fact("destination-kind", "off-site"),
          fact("covers", "orders-data"),
        ],
      },
    ),
  ];
}

/**
 * The three ways this page used to say more than it knew, on one screen.
 *
 * The plan means to write off-site and the only copy is beside the
 * application. The copy's own class is declared, so the page cannot round it
 * up to the plan's. And the plan names the database and not the uploads, so a
 * reader who sees "copies exist" still has a volume in no copy at all.
 */
function overclaimedRecords(id: string): SavedInformation[] {
  return [
    states(
      id,
      { kind: "application", id },
      {
        at: ago(2 * HOUR),
        title: "Shop",
        views: ["architecture", "overview"],
        content: {
          kind: "topology",
          from: "observed",
          parts: [
            {
              id: "web",
              kind: "web",
              name: "Shop",
              role: "the site",
              plain: "the site",
            },
            {
              id: "shop-postgres",
              kind: "private",
              name: "PostgreSQL",
              role: "the database",
              plain: "the database",
            },
            {
              id: "shop-db",
              kind: "volume",
              name: "Database files",
              role: "the database files",
              plain: "the database files",
            },
            {
              id: "shop-uploads",
              kind: "volume",
              name: "Uploads",
              role: "the uploads",
              plain: "the uploads",
            },
          ],
          edges: [
            { from: "shop-postgres", to: "shop-db", network: "disk" },
            { from: "web", to: "shop-uploads", network: "disk" },
          ],
        },
      },
    ),
    states(
      id,
      { kind: "volume", id: "shop-db" },
      {
        at: ago(2 * HOUR),
        title: "The database files survive replacement",
        views: ["storage"],
        facts: [
          fact("path", "/var/lib/postgresql/data"),
          fact("holds", "PostgreSQL's data"),
        ],
        checks: [check("persistence", "passed", "configuration")],
      },
    ),
    states(
      id,
      { kind: "volume", id: "shop-uploads" },
      {
        at: ago(2 * HOUR),
        title: "The uploads survive replacement",
        views: ["storage"],
        facts: [
          fact("path", "/srv/shop/uploads"),
          fact("holds", "Customer uploads"),
        ],
        checks: [check("persistence", "passed", "configuration")],
      },
    ),
    states(
      id,
      { kind: "backup-plan", id: "nightly" },
      {
        at: ago(DAY),
        title: "Backups are meant to reach object storage",
        views: ["backups"],
        facts: [
          fact("schedule", "Daily at 02:30", "configuration", "planned"),
          fact("destination", "s3://shop-backups", "configuration", "planned"),
          fact("destination-kind", "off-site", "configuration", "planned"),
          fact("keep", "7", "configuration", "planned"),
          // The database, by its owner's id. Not the uploads.
          fact("covers", "shop-postgres"),
        ],
        checks: [check("configured", "passed", "configuration")],
      },
    ),
    states(
      id,
      { kind: "backup-copy", id: "copy-last-week" },
      {
        at: ago(8 * DAY),
        title: "A copy was written",
        views: ["backups"],
        facts: [
          fact("destination", "s3://shop-backups"),
          fact("destination-kind", "off-site"),
          fact("covers", "shop-postgres"),
          fact("size", "88 MB", "contents"),
        ],
        checks: [check("written", "passed", "identity")],
      },
    ),
    states(
      id,
      { kind: "backup-copy", id: "copy-last-night" },
      {
        at: ago(6 * HOUR),
        title: "A copy was written",
        views: ["backups"],
        facts: [
          fact("destination", "/var/backups/shop"),
          // Beside the application, whatever the plan intends, and whatever
          // last week's copy managed.
          fact("destination-kind", "same-server"),
          fact("covers", "shop-postgres"),
          fact("size", "94 MB", "contents"),
        ],
        checks: [check("written", "passed", "identity")],
      },
    ),
    states(
      id,
      { kind: "restore-test", id: "restore-last-night" },
      {
        at: ago(5 * HOUR),
        title: "A copy was restored and checked",
        views: ["backups"],
        facts: [
          fact("restored-copy", "copy-last-night"),
          fact("covers", "shop-postgres"),
          fact("took", "2 min", "contents"),
        ],
        checks: [check("restored", "passed", "identity")],
      },
    ),
  ];
}

/** Long names, Unicode and awkward units, so layout is tested by data. */
function richRecords(id: string): SavedInformation[] {
  const long = "a-really-quite-long-container-name-that-somebody-generated-01";
  return [
    states(
      id,
      { kind: "application", id },
      {
        at: ago(5 * MINUTE),
        title: "Everything is recorded",
        views: ["overview", "architecture"],
        checks: [check("http", "passed", "liveness")],
        content: {
          kind: "topology",
          from: "observed",
          parts: [
            {
              id: long,
              kind: "web",
              name: "Ünïcøde Wéb",
              role: "the web app",
              plain: "the web app",
            },
            {
              id: "worker",
              kind: "private",
              name: "Worker",
              role: "background work",
              plain: "background work",
            },
            {
              id: "big-volume",
              kind: "volume",
              name: "Data",
              role: "the data",
              plain: "the data",
            },
          ],
          edges: [
            { from: long, to: "big-volume", network: "disk" },
            { from: long, to: "worker", network: "private" },
          ],
        },
      },
    ),
    states(
      id,
      { kind: "process", id: long },
      {
        at: ago(5 * MINUTE),
        title: "The web process is healthy",
        views: ["processes"],
        facts: [
          fact("product", "Ünïcøde Wéb", "identity", "reported"),
          fact("port", "127.0.0.1:8443 → 8443/tcp"),
          fact(
            "image",
            "registry.example.com:5000/team/ünïcøde-web@sha256:" +
              "c".repeat(64),
            "identity",
          ),
          fact(
            "command",
            "node --enable-source-maps ./dist/server.js --port 8443",
          ),
        ],
        checks: [
          check("http", "passed", "liveness"),
          check("container", "passed", "liveness"),
        ],
      },
    ),
    states(
      id,
      { kind: "process", id: "worker" },
      {
        at: ago(5 * MINUTE),
        title: "The worker is running",
        views: ["processes"],
        facts: [fact("role", "worker")],
        checks: [check("reachable", "passed", "liveness")],
      },
    ),
    states(
      id,
      { kind: "volume", id: "big-volume" },
      {
        at: ago(5 * MINUTE),
        title: "The data survives replacement",
        views: ["storage"],
        facts: [
          fact("path", "/var/lib/a-really-quite-long-mount-point/data"),
          fact("size", "1,024.5 MiB", "contents"),
          fact("holds", "Uploads and thumbnails"),
        ],
        checks: [check("persistence", "passed", "configuration")],
      },
    ),
    states(
      id,
      { kind: "database", id: "main" },
      {
        at: ago(5 * MINUTE),
        title: "PostgreSQL answers",
        views: ["database"],
        facts: [
          fact("engine", "PostgreSQL", "identity", "reported"),
          fact("version", "16.15", "identity", "reported"),
          fact("size", "48,217,962 bytes", "contents"),
        ],
        checks: [check("answering", "passed", "liveness")],
      },
    ),
    states(
      id,
      { kind: "cache", id: "redis" },
      {
        at: ago(5 * MINUTE),
        title: "Redis is up",
        views: ["cache"],
        facts: [
          fact("engine", "Redis", "identity", "reported"),
          fact("version", "7.4.11", "identity", "reported"),
          fact("port", "6379"),
          fact("persistence", "AOF, fsync every second"),
        ],
        checks: [check("answering", "passed", "liveness")],
      },
    ),
    states(
      id,
      { kind: "queue", id: "orders" },
      {
        at: ago(5 * MINUTE),
        title: "The orders queue is draining",
        views: ["cache"],
        facts: [
          fact("library", "Sidekiq", "configuration", "reported"),
          fact("backend", "Redis", "configuration", "reported"),
          fact("depth", "1,204", "contents"),
          fact("oldest", "95 s", "contents"),
          fact("failed", "3", "contents"),
          fact("workers", "worker"),
        ],
        checks: [check("draining", "passed", "liveness")],
      },
    ),
    states(
      id,
      { kind: "job", id: "nightly-tidy" },
      {
        at: ago(6 * HOUR),
        title: "The nightly tidy ran",
        views: ["jobs"],
        facts: [
          fact("schedule", "Daily at 02:00", "configuration", "planned"),
          fact("command", "python nightly.py --verbose --keep 30"),
          fact("timezone", "Europe/Helsinki", "configuration", "reported"),
          fact(
            "next-run",
            new Date(Date.now() + 18 * HOUR).toISOString(),
            "configuration",
            "planned",
          ),
          fact("took", "4 s", "contents"),
        ],
        checks: [check("ran", "passed", "liveness")],
      },
    ),
    states(
      id,
      { kind: "backup-plan", id: "nightly" },
      {
        at: ago(2 * DAY),
        title: "Backups run nightly to R2",
        views: ["backups"],
        facts: [
          fact("schedule", "Daily at 03:30", "configuration", "planned"),
          fact("destination", "Cloudflare R2", "configuration", "reported"),
          fact("destination-kind", "off-site", "configuration", "planned"),
          fact("keep", "7", "configuration", "planned"),
          fact("covers", "big-volume"),
        ],
        checks: [check("configured", "passed", "configuration")],
      },
    ),
    states(
      id,
      { kind: "backup-copy", id: "copy-yesterday" },
      {
        at: ago(DAY),
        title: "A copy was written",
        views: ["backups"],
        facts: [
          fact("destination", "Cloudflare R2"),
          fact("destination-kind", "off-site"),
          fact("size", "512 MB", "contents"),
        ],
        checks: [check("written", "passed", "identity")],
      },
    ),
    states(
      id,
      { kind: "backup-copy", id: "copy-today" },
      {
        at: ago(4 * HOUR),
        title: "A copy was written",
        views: ["backups"],
        facts: [
          fact("destination", "Cloudflare R2"),
          fact("destination-kind", "off-site"),
          fact("size", "515 MB", "contents"),
        ],
        checks: [check("written", "passed", "identity")],
      },
    ),
    states(
      id,
      { kind: "restore-test", id: "restore-1" },
      {
        at: ago(3 * HOUR),
        title: "A restore was tested",
        views: ["backups"],
        facts: [
          fact("covers", "The whole volume"),
          // Deliberately the older copy, tested after the newer one existed.
          // This is the shape the page used to read as "recovery proved": the
          // restore is newer than the newest copy, and it opened a different
          // file. The page has to say which copy it proved.
          fact("restored-copy", "copy-yesterday"),
          fact("took", "3 min", "contents"),
        ],
        checks: [
          check("restored", "passed", "identity"),
          check("started", "info", "liveness"),
        ],
      },
    ),
    states(
      id,
      { kind: "monitor", id: "uptime" },
      {
        at: ago(3 * MINUTE),
        title: "An uptime check is watching",
        views: ["monitoring"],
        facts: [
          fact(
            "target",
            "https://a-really-quite-long-subdomain.example.test/health",
            "configuration",
            "reported",
          ),
          fact("interval", "60 s", "configuration", "reported"),
          fact("notifies", "ops@example.test", "configuration", "reported"),
        ],
        checks: [check("answering", "passed", "liveness")],
      },
    ),
    states(
      id,
      { kind: "domain", id: "a-really-quite-long-subdomain.example.test" },
      {
        at: ago(2 * HOUR),
        title: "The name resolves and serves",
        views: ["domains"],
        facts: [
          fact(
            "name",
            "a-really-quite-long-subdomain.example.test",
            "identity",
            "reported",
          ),
          fact("registrar", "Cloudflare", "configuration", "reported"),
          fact("nameservers", "ns1.example.test, ns2.example.test"),
          fact("records", "A → 203.0.113.10, AAAA → 2001:db8::10"),
        ],
        checks: [check("resolves", "passed"), check("serves", "passed")],
      },
    ),
    states(
      id,
      { kind: "certificate", id: "a-really-quite-long-subdomain.example.test" },
      {
        at: ago(2 * HOUR),
        title: "HTTPS is valid",
        views: ["domains"],
        facts: [
          fact("issuer", "Let's Encrypt", "identity", "reported"),
          fact(
            "expires",
            new Date(Date.now() + 60 * DAY).toISOString(),
            "identity",
            "reported",
          ),
        ],
        checks: [check("valid", "passed")],
      },
    ),
    states(
      id,
      { kind: "cdn", id: "edge" },
      {
        at: ago(2 * HOUR),
        title: "Cloudflare caches in front",
        views: ["cdn"],
        facts: [
          fact("provider", "Cloudflare", "configuration", "reported"),
          fact("covers", "Static assets and images"),
        ],
        checks: [check("caching", "passed")],
      },
    ),
    states(
      id,
      { kind: "firewall", id: "fw" },
      {
        at: ago(HOUR),
        title: "The firewall allows SSH and HTTPS",
        views: ["security"],
        facts: [
          fact("provider", "Hetzner Cloud", "configuration", "reported"),
          fact("default", "Deny unless listed", "configuration", "reported"),
          fact("rules", "TCP 22 from 203.0.113.4; TCP 443 from anywhere"),
        ],
        checks: [check("configured", "passed", "configuration")],
      },
    ),
    states(
      id,
      { kind: "door", id: "https" },
      {
        at: ago(HOUR),
        title: "HTTPS is open to everyone",
        views: ["security"],
        facts: [fact("port", "443"), fact("sources", "anywhere")],
        checks: [check("open", "passed")],
      },
    ),
    states(
      id,
      { kind: "door", id: "postgres" },
      {
        at: ago(HOUR),
        title: "The database port refuses from outside",
        views: ["security"],
        facts: [fact("port", "5432"), fact("sources", "the container network")],
        checks: [
          check("refused", "passed", "reachability", {
            detail: "timed out from outside",
          }),
        ],
      },
    ),
    states(
      id,
      { kind: "variable", id: "DATABASE_URL" },
      {
        at: ago(5 * MINUTE),
        title: "The database URL is set",
        views: ["variables"],
        facts: [fact("source", "Written by the release"), fact("scope", long)],
      },
    ),
    states(
      id,
      {
        kind: "variable",
        id: "A_VERY_LONG_ENVIRONMENT_VARIABLE_NAME_FOR_LAYOUT",
      },
      {
        at: ago(5 * MINUTE),
        title: "A long name, for layout",
        views: ["variables"],
        facts: [fact("source", "Written by the release"), fact("scope", long)],
      },
    ),
    states(
      id,
      { kind: "host", id: "hetzner-999999" },
      {
        at: ago(5 * MINUTE),
        title: "The host is up",
        views: ["overview"],
        facts: [
          fact("region", "Helsinki (hel1)", "configuration", "reported"),
          fact("size", "CX23", "configuration", "reported"),
          fact("memory", "4 GB", "configuration", "reported"),
          fact("memory-used", "1.2 of 4 GB", "contents"),
          fact("disk-used", "12.4 of 40 GB used", "contents"),
          fact("cpu-used", "7%", "contents"),
        ],
        checks: [check("ssh", "passed")],
      },
    ),
    record(id, {
      at: ago(10 * MINUTE),
      title: "Release 3f2a1b9 is serving",
      views: ["deployment", "overview"],
      role: "outcome",
      about: [{ kind: "application", id }],
      checks: [
        check("release-http", "passed", "liveness", {
          about: { kind: "application", id },
        }),
      ],
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/owner/repo",
        revision: "3f2a1b9c8d7e",
        server: "hetzner-999999",
        changes: ["Pinned every image to a digest"],
        services: [
          {
            process: long,
            image: "registry.example.com:5000/team/ünïcøde-web:2.4.0",
            digest: "sha256:" + "c".repeat(64),
          },
          {
            process: "worker",
            image: "registry.example.com:5000/team/worker:2.4.0",
          },
        ],
      },
    }),
    record(id, {
      at: ago(9 * MINUTE),
      title: "It is reachable from this PC",
      views: ["overview", "deployment"],
      role: "status",
      about: [{ kind: "application", id }],
      url: "http://127.0.0.1:19999",
      content: {
        kind: "application-access",
        mode: "private",
        server: "hetzner-999999",
        localPort: 19999,
        remotePort: 8443,
      },
    }),
    usageRecord(id),
  ];
}

/**
 * A day of traffic and server load, shaped like a real one: quiet overnight,
 * busy through the afternoon, a nightly backup at 03:00, and one bad half
 * hour where an export endpoint failed and pinned the CPU. Seeded, so every
 * run draws the same day.
 */
function usageRecord(id: string): SavedInformation {
  const step = 15;
  const buckets = 96;
  const end = Math.floor(Date.now() / (step * MINUTE)) * step * MINUTE;
  const start = end - buckets * step * MINUTE;
  let seed = 11;
  const noise = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const incident = buckets - 26;
  const bad = (i: number) => i >= incident && i < incident + 3;

  const requests: number[] = [];
  const serverErrors: number[] = [];
  const p95Ms: number[] = [];
  const cpu: number[] = [];
  const memory: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const time = new Date(start + i * step * MINUTE);
    const hour = time.getHours() + time.getMinutes() / 60;
    const day = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 17));
    const count = Math.round(18 + 360 * day ** 1.4 + noise() * 40);
    const backup = hour >= 3 && hour < 3.5;
    requests.push(count);
    serverErrors.push(
      bad(i) ? 18 + Math.round(noise() * 24) : noise() < 0.05 ? 1 : 0,
    );
    p95Ms.push(
      Math.round(
        bad(i) ? 1900 + noise() * 900 : 150 + count * 0.25 + noise() * 60,
      ),
    );
    cpu.push(
      Math.round(
        bad(i)
          ? 86 + noise() * 10
          : backup
            ? 42 + noise() * 8
            : 3 + count / 14 + noise() * 4,
      ),
    );
    memory.push(
      Math.round(
        bad(i)
          ? 58 + noise() * 6
          : i > incident
            ? 41 + noise() * 2
            : 36 + noise() * 2,
      ),
    );
  }
  const total = requests.reduce((a, b) => a + b, 0);

  return record(id, {
    at: new Date(end).toISOString(),
    title: "A day of traffic and server load was read",
    views: ["monitoring"],
    role: "status",
    status: "info",
    about: [
      { kind: "application", id },
      { kind: "host", id: "hetzner-999999" },
    ],
    content: {
      kind: "usage",
      start: new Date(start).toISOString(),
      stepMinutes: step,
      traffic: {
        source: "Caddy access log",
        requests,
        serverErrors,
        visitors: Math.round(total / 17),
        p95Ms,
        paths: [
          { path: "/", requests: Math.round(total * 0.34), serverErrors: 0 },
          {
            path: "/api/items",
            requests: Math.round(total * 0.27),
            serverErrors: 2,
          },
          {
            path: "/static/app.js",
            requests: Math.round(total * 0.16),
            serverErrors: 0,
          },
          {
            path: "/login",
            requests: Math.round(total * 0.08),
            serverErrors: 0,
          },
          {
            path: "/api/export?format=csv&include=attachments",
            requests: Math.round(total * 0.03),
            serverErrors: serverErrors.reduce((a, b) => a + b, 0) - 2,
          },
        ],
      },
      host: {
        source: "sysstat samples",
        cpu,
        memory,
        memoryTotal: "4 GB",
      },
    },
  });
}

/**
 * A Paperless-like stack, at the size that broke the map.
 *
 * Three backing services and four data locations, with the names a real
 * upstream Compose file uses rather than short ones invented to fit. The
 * diagram shrank its boxes to make room and left the text at its own size, so
 * names wrapped out of their boxes and across the wires.
 */
function paperlessRecords(id: string): SavedInformation[] {
  const services = [
    ["paperless-postgres", "PostgreSQL 16", "the database"],
    ["paperless-valkey", "Valkey", "the task broker"],
    ["paperless-gotenberg", "Gotenberg", "document conversion"],
  ] as const;
  const volumes = [
    [
      "paperless-ngx-data",
      "Indexes and the search database",
      "/usr/src/paperless/data",
      "3.4 GB",
    ],
    [
      "paperless-ngx-media",
      "Every document ever filed",
      "/usr/src/paperless/media",
      "48.2 GB",
    ],
    [
      "paperless-postgres-data",
      "PostgreSQL's own files",
      "/var/lib/postgresql/data",
      "2.1 GB",
    ],
    ["paperless-valkey-data", "Queued and running tasks", "/data", "18 MB"],
  ] as const;
  return [
    states(
      id,
      { kind: "application", id },
      {
        at: ago(2 * HOUR),
        title: "Paperless-ngx",
        views: ["architecture", "overview"],
        content: {
          kind: "topology",
          from: "observed",
          parts: [
            {
              id: "paperless-webserver",
              kind: "web",
              name: "paperless-webserver",
              role: "the site people use",
              plain: "the site",
            },
            ...services.map(([partId, name, role]) => ({
              id: partId,
              kind: "private" as const,
              name,
              role,
              plain: role,
            })),
            ...volumes.map(([partId, holds]) => ({
              id: partId,
              kind: "volume" as const,
              name: partId,
              role: holds,
              plain: holds,
            })),
          ],
          edges: [
            {
              from: "paperless-webserver",
              to: "paperless-postgres",
              network: "private",
            },
            {
              from: "paperless-webserver",
              to: "paperless-valkey",
              network: "private",
            },
            {
              from: "paperless-webserver",
              to: "paperless-gotenberg",
              network: "private",
            },
            {
              from: "paperless-webserver",
              to: "paperless-ngx-data",
              network: "disk",
            },
            {
              from: "paperless-webserver",
              to: "paperless-ngx-media",
              network: "disk",
            },
            {
              from: "paperless-postgres",
              to: "paperless-postgres-data",
              network: "disk",
            },
            {
              from: "paperless-valkey",
              to: "paperless-valkey-data",
              network: "disk",
            },
          ],
        },
      },
    ),
    states(
      id,
      { kind: "host", id: "paperless-host" },
      {
        at: ago(2 * HOUR),
        title: "The server",
        views: ["overview"],
        facts: [
          fact("address", "203.0.113.41"),
          fact("region", "Helsinki"),
          fact("size", "CPX31 · 4 vCPU · 8 GB"),
        ],
        checks: [check("ssh", "passed", "reachability")],
      },
    ),
    states(
      id,
      { kind: "process", id: "paperless-webserver" },
      {
        at: ago(20 * MINUTE),
        title: "The site answers",
        views: ["processes"],
        facts: [
          fact("image", "ghcr.io/paperless-ngx/paperless-ngx:2.13.5"),
          fact("port", "8000"),
        ],
        checks: [check("http", "passed", "reachability")],
      },
    ),
    ...services.map(([partId, name, role]) =>
      states(
        id,
        { kind: "process", id: partId },
        {
          at: ago(20 * MINUTE),
          title: `${name} is running`,
          views: ["processes"],
          facts: [fact("product", name), fact("role", role)],
          checks: [check("reachable", "passed", "reachability")],
        },
      ),
    ),
    ...volumes.map(([partId, holds, path, size]) =>
      states(
        id,
        { kind: "volume", id: partId },
        {
          at: ago(2 * HOUR),
          title: `${partId} survives replacement`,
          views: ["storage"],
          facts: [
            fact("path", path),
            fact("holds", holds),
            fact("size", size, "contents"),
          ],
          checks: [check("persistence", "passed", "configuration")],
        },
      ),
    ),
  ];
}

/**
 * The release history Deployment, History and Logs each have to tell.
 *
 * Four releases and one failed attempt between the last two, because the
 * question that matters is what a page says when the newest thing that
 * happened is not the thing that is running.
 */
function releaseRecords(id: string): SavedInformation[] {
  const release = (
    key: string,
    at: number,
    revision: string,
    changes: string[],
    failed = false,
  ) =>
    states(
      id,
      { kind: "application", id: `release-${key}` },
      {
        at: ago(at),
        status: failed ? "failed" : "verified",
        title: failed
          ? `Update to ${revision.slice(0, 7)} did not finish`
          : `Released ${revision.slice(0, 7)}`,
        views: ["deployment", "history"],
        body: failed
          ? "The image built and the container would not start: the new release expects a column the database does not have."
          : "",
        content: {
          kind: "deployment",
          repositoryUrl: "https://github.com/qa/shop",
          revision,
          image: `ghcr.io/qa/shop:${revision.slice(0, 7)}`,
          server: "shop-host",
          changes,
        },
        checks: failed
          ? [check("started", "failed", "liveness")]
          : [
              check("started", "passed", "liveness"),
              check("http", "passed", "reachability"),
            ],
      },
    );

  return [
    states(
      id,
      { kind: "host", id: "shop-host" },
      {
        at: ago(9 * DAY),
        title: "The server",
        views: ["overview"],
        facts: [fact("address", "203.0.113.24"), fact("region", "Helsinki")],
      },
    ),
    release("1", 9 * DAY, "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", [
      "First release",
    ]),
    release("2", 4 * DAY, "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1", [
      "Add the receipts page",
      "Bump Django to 5.1",
    ]),
    release(
      "3",
      26 * HOUR,
      "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
      ["Add a discount column"],
      true,
    ),
    release("4", 22 * HOUR, "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3", [
      "Add a discount column",
      "Run the migration first",
    ]),
    // A consequential event that is not a release, between two that are.
    states(
      id,
      { kind: "backup-copy", id: "copy-nightly" },
      {
        at: ago(7 * HOUR),
        title: "A copy was written",
        views: ["backups", "history"],
        facts: [
          fact("destination", "s3://shop-backups"),
          fact("destination-kind", "off-site"),
          fact("size", "412 MB", "contents"),
        ],
        checks: [check("written", "passed", "identity")],
      },
    ),
    // A failure that was resolved, which History must keep without making it
    // read as something still wrong.
    states(
      id,
      { kind: "access", id: "private-access" },
      {
        at: ago(20 * HOUR),
        status: "failed",
        title: "The private way in stopped answering",
        views: ["history"],
        body: "The tunnel died when the Mac slept.",
      },
    ),
    states(
      id,
      { kind: "access", id: "private-access" },
      {
        at: ago(19 * HOUR),
        title: "Private access reopened",
        views: ["history"],
        body: "Reopened on port 18000; the application answered.",
        checks: [check("reachable", "passed", "reachability")],
      },
    ),
    record(id, {
      at: ago(19 * HOUR),
      title: "It is reachable from this PC",
      views: ["deployment", "overview"],
      role: "status",
      about: [{ kind: "application", id }],
      url: "http://127.0.0.1:18000",
      content: {
        kind: "application-access",
        mode: "private",
        server: "shop-host",
        localPort: 18000,
        remotePort: 8000,
      },
    }),
  ];
}

/**
 * The smallest application anybody actually runs.
 *
 * Every other scenario here is a shape of doubt or a shape of density. This
 * one is the ordinary case, and it is the hardest for a page to get right:
 * with one process, one volume and one release, a destination has nothing to
 * fill itself with and must still read as an answer rather than as a page
 * that failed to load. Its way in is closed while everything else passes, so
 * a reader can see the product refuse to offer a dead link beside a green
 * process.
 */
function notesRecords(id: string): SavedInformation[] {
  return [
    states(
      id,
      { kind: "host", id: "notes-host" },
      {
        at: ago(2 * HOUR),
        title: "The server",
        views: ["overview", "architecture"],
        facts: [
          fact("address", "203.0.113.41"),
          fact("region", "Nuremberg", "configuration", "reported"),
          fact("size", "CX22", "configuration", "reported"),
          fact("disk-used", "1.2 of 40 GB used", "contents"),
        ],
        checks: [check("ssh", "passed")],
      },
    ),
    states(
      id,
      { kind: "process", id: "notes" },
      {
        at: ago(6 * MINUTE),
        title: "Notes is answering",
        views: ["overview", "processes"],
        facts: [
          fact("product", "Standard Notes", "identity", "reported"),
          fact("role", "web", "configuration"),
          fact("port", "3000"),
          fact("image", "ghcr.io/qa/notes:1.14.2", "identity", "reported"),
          fact("revision", "e9a71c4", "identity", "reported"),
          fact("memory-used", "180 of 512 MB", "contents"),
        ],
        checks: [
          check("http", "passed", "liveness", { detail: "200 in 31 ms" }),
          check("container", "passed", "liveness"),
        ],
      },
    ),
    states(
      id,
      { kind: "volume", id: "notes-data" },
      {
        at: ago(2 * HOUR),
        title: "The notes survive a container replacement",
        views: ["storage", "architecture"],
        facts: [
          fact("path", "/var/lib/notes"),
          fact("size", "94 MB", "contents"),
        ],
        checks: [check("persistence", "passed", "configuration")],
      },
    ),
    record(id, {
      at: ago(2 * HOUR),
      title: "Released e9a71c4",
      views: ["deployment", "history"],
      role: "outcome",
      about: [{ kind: "application", id }],
      checks: [
        check("started", "passed", "liveness"),
        check("http", "passed", "reachability"),
      ],
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/qa/notes",
        revision: "e9a71c4f8b2d6a05c31e7d9b4a6f8021c5e3d7b9",
        image: "ghcr.io/qa/notes:1.14.2",
        server: "notes-host",
        changes: ["First release"],
      },
    }),
    // Nothing listens on this port, so the product asks and finds it closed.
    // The application is fine; the way in is not, and the page must not
    // offer a link it already knows will fail.
    record(id, {
      at: ago(2 * HOUR),
      title: "It is reachable from this PC",
      views: ["deployment", "overview"],
      role: "status",
      about: [{ kind: "application", id }],
      url: "http://127.0.0.1:18321",
      content: {
        kind: "application-access",
        mode: "private",
        server: "notes-host",
        localPort: 18321,
        remotePort: 3000,
      },
    }),
    states(
      id,
      { kind: "access", id: "notes-access" },
      {
        at: ago(11 * MINUTE),
        status: "failed",
        title: "The private way in stopped answering",
        views: ["history"],
        body: "The connection dropped when this computer slept. Nothing on the server changed.",
        checks: [check("reachable", "failed", "reachability")],
      },
    ),
  ];
}

function notesExecutions(): ScenarioExecution[] {
  return [
    {
      tool: "server_bash",
      target: "notes-host",
      input: "docker compose ps",
      output:
        "NAME    IMAGE                      STATUS        PORTS\n" +
        "notes   ghcr.io/qa/notes:1.14.2    Up 2 hours    127.0.0.1:3000->3000/tcp\n",
      status: "succeeded",
      exitCode: 0,
      ago: 6 * MINUTE,
    },
    {
      tool: "server_bash",
      target: "notes-host",
      input: "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/",
      output: "200\n",
      status: "succeeded",
      exitCode: 0,
      ago: 6 * MINUTE,
    },
    {
      tool: "open_server_port",
      target: "notes-host",
      input: "3000 → 18321",
      output: "curl: (7) Failed to connect to 127.0.0.1 port 18321\n",
      status: "failed",
      exitCode: 7,
      ago: 11 * MINUTE,
    },
  ];
}

/**
 * The newest release failed, and the one before it is still serving.
 *
 * This is the state a deployment page is most easily wrong about. The last
 * thing that happened failed, and the application is up: a page that reads
 * the newest record says the application is down, and a page that reads the
 * newest success says everything shipped. What is true is that release four
 * did not start and release three is answering, and both have to be on the
 * page at once.
 */
function servingRecords(id: string): SavedInformation[] {
  const release = (
    key: string,
    at: number,
    revision: string,
    changes: string[],
    failed = false,
  ) =>
    states(
      id,
      { kind: "application", id: `release-${key}` },
      {
        at: ago(at),
        status: failed ? "failed" : "verified",
        title: failed
          ? `Update to ${revision.slice(0, 7)} did not start`
          : `Released ${revision.slice(0, 7)}`,
        views: ["deployment", "history"],
        body: failed
          ? "The image built and pushed. The container exited on boot: the new release reads a variable nothing sets on this server. The release before it was left running and is still serving."
          : "",
        content: {
          kind: "deployment",
          repositoryUrl: "https://github.com/qa/shopfront",
          revision,
          image: `ghcr.io/qa/shopfront:${revision.slice(0, 7)}`,
          server: "shopfront-host",
          changes,
        },
        checks: failed
          ? [check("started", "failed", "liveness")]
          : [
              check("started", "passed", "liveness"),
              check("http", "passed", "reachability"),
            ],
      },
    );
  return [
    states(
      id,
      { kind: "host", id: "shopfront-host" },
      {
        at: ago(30 * MINUTE),
        title: "The server",
        views: ["overview", "architecture"],
        facts: [
          fact("address", "203.0.113.77"),
          fact("region", "Falkenstein", "configuration", "reported"),
          fact("disk-used", "9.4 of 80 GB used", "contents"),
        ],
        checks: [check("ssh", "passed")],
      },
    ),
    release("1", 12 * DAY, "10a7c3e9d5b18f2604ac7e3d95b1f8206a4c7e3d", [
      "First release",
    ]),
    release("2", 3 * DAY, "2b8d4f0a6c92e7315bd8f4a06c92e7315bd8f4a0", [
      "Add the checkout summary",
    ]),
    release(
      "3",
      95 * MINUTE,
      "3c9e5a1b7d03f8426ce9a5b17d03f8426ce9a5b1",
      ["Read the pricing tier from the environment"],
      true,
    ),
    // What is actually answering, recorded against the release before the
    // failure. Without this the page could only say something failed.
    states(
      id,
      { kind: "process", id: "shopfront" },
      {
        at: ago(4 * MINUTE),
        title: "The previous release is still serving",
        views: ["overview", "processes"],
        facts: [
          fact("role", "web", "configuration"),
          fact("port", "8080"),
          fact("image", "ghcr.io/qa/shopfront:2b8d4f0", "identity", "reported"),
          fact("revision", "2b8d4f0", "identity", "reported"),
          fact("restarts", "0", "contents"),
        ],
        checks: [
          check("http", "passed", "liveness", { detail: "200 in 62 ms" }),
          check("container", "passed", "liveness"),
        ],
      },
    ),
  ];
}

function servingExecutions(): ScenarioExecution[] {
  return [
    {
      tool: "server_bash",
      target: "shopfront-host",
      input: "docker compose up -d shopfront",
      output:
        "shopfront  Pulling\n" +
        "shopfront  Pulled\n" +
        "shopfront  Starting\n" +
        "shopfront  Error: PRICING_TIER is not set\n" +
        "dependency failed to start: container shopfront exited (1)\n",
      status: "failed",
      exitCode: 1,
      ago: 95 * MINUTE,
    },
    {
      tool: "server_bash",
      target: "shopfront-host",
      input: "docker compose ps --format json",
      output:
        '{"Name":"shopfront","Image":"ghcr.io/qa/shopfront:2b8d4f0","State":"running","Status":"Up 3 days"}\n',
      status: "succeeded",
      exitCode: 0,
      ago: 4 * MINUTE,
    },
  ];
}
