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

export interface Scenario {
  id: string;
  name: string;
  /** What this application exists to show. */
  shows: string;
  records: SavedInformation[];
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
      id: overclaimed,
      name: "Scenario · overclaimed",
      shows:
        "A plan that promises more than the copies deliver: off-site intended, beside the application in fact, and one volume nobody copies.",
      records: overclaimedRecords(overclaimed),
    },
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
      { kind: "backup-copy", id: "copy-last-night" },
      {
        at: ago(6 * HOUR),
        title: "A copy was written",
        views: ["backups"],
        facts: [
          fact("destination", "/var/backups/shop"),
          // Beside the application, whatever the plan intends.
          fact("destination-kind", "same-server"),
          fact("size", "94 MB", "contents"),
        ],
        checks: [check("written", "passed", "identity")],
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
  ];
}
