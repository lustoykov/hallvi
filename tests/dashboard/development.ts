// What the Development and Releases panels show, gathered in one place.
//
// Two rules shape all of it. It reports only what is *registered* — the
// development environment's own register, this checkout, and the release this
// repository would build — and never goes looking around the machine for
// databases. And it separates what is true of the files on disk from what is
// true of the process that is running, because those drift apart the moment
// somebody checks out a branch while Hallvi is up, and a panel that conflates
// them tells a confident lie.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

export const DEVELOPMENT_ROOT = join(
  homedir(),
  ".local",
  "share",
  "hallvi-dev",
);

/** A command that cannot become a shell string, and never throws. */
function run(
  command: string,
  args: string[],
  cwd?: string,
  maxBuffer?: number,
) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
      maxBuffer,
    }).trim();
  } catch {
    return null;
  }
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Read the committed schema, including a change still in SQLite's WAL. */
export function schemaOf(path: string) {
  let database: Database.Database | undefined;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    return database.pragma("user_version", { simple: true }) as number;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export function checkout(root: string) {
  const revision = run("git", ["rev-parse", "HEAD"], root);
  return {
    path: root,
    branch: run("git", ["rev-parse", "--abbrev-ref", "HEAD"], root),
    revision,
    short: revision ? revision.slice(0, 9) : null,
    // Tracked changes only: a build artefact differing is not "local work".
    changed: (run("git", ["status", "--porcelain", "-uno"], root) ?? "")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(/^\s*\S+\s+/, "")),
  };
}

/**
 * Which directory the process on this port is actually serving.
 *
 * This is the question the panel exists to answer. A dashboard started in one
 * worktree while Hallvi runs from another would otherwise print this
 * checkout's branch next to that one's address, which is a confident lie. An
 * installed Hallvi reports a release revision; a development one has no
 * release identity at all, so the only honest answer is where its files are.
 */
function servingFrom(port: number) {
  const pid = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  const first = pid?.split("\n")[0]?.trim();
  if (!first) return null;
  // `next dev` serves from a child; the working directory is the same.
  const printed = run("lsof", ["-p", first, "-a", "-d", "cwd", "-Fn"]);
  const directory = printed
    ?.split("\n")
    .find((line) => line.startsWith("n"))
    ?.slice(1);
  return directory ?? null;
}

/**
 * The running controller, asked rather than assumed. `/api/host` answers with
 * the revision the running process was built from, which is the only honest
 * way to say whether it matches the files in the checkout.
 */
export async function running(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/host`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return { address: `http://127.0.0.1:${port}`, up: false };
    const body = (await response.json()) as Record<string, unknown>;
    return {
      address: `http://127.0.0.1:${port}`,
      up: true,
      name: typeof body.name === "string" ? body.name : null,
      version: typeof body.version === "string" ? body.version : null,
      revision: typeof body.revision === "string" ? body.revision : null,
    };
  } catch {
    return { address: `http://127.0.0.1:${port}`, up: false };
  }
}

type Registered = {
  name?: string;
  port?: number;
  host?: Record<string, unknown>;
  applications?: {
    id: string;
    name: string;
    exercises?: string;
    url?: string;
  }[];
};

/** Copies this environment is known to have taken, newest first. */
function backups(root: string) {
  const places = [join(root, "backups"), join(root, "state", "migrations")];
  const found: { path: string; takenAt: string; kind: string }[] = [];
  for (const place of places) {
    if (!existsSync(place)) continue;
    for (const name of readdirSync(place)) {
      const path = join(place, name);
      try {
        found.push({
          path,
          takenAt: statSync(path).mtime.toISOString(),
          kind: place.endsWith("migrations")
            ? "before a migration"
            : "taken by hand",
        });
      } catch {
        // Gone between listing and reading; nothing to report.
      }
    }
  }
  return found.sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 12);
}

export async function developmentState(root: string) {
  const register = readJsonFile<Registered>(
    join(DEVELOPMENT_ROOT, "instance.json"),
  );
  const database = join(DEVELOPMENT_ROOT, "state", "hallvi.db");
  const port = register?.port ?? 5147;
  const live = await running(port);
  const here = checkout(root);
  const from = live.up ? servingFrom(port) : null;
  // In development the answer is a directory, not a revision: there is no
  // release identity to compare. Whichever it is, it is measured rather than
  // assumed to be this checkout.
  const serving = from ? { ...checkout(from), path: from } : null;
  return {
    checkout: here,
    running: { ...live, serving },
    sameCheckout: from ? from === root : null,
    sameRevision:
      live.up && live.revision && here.revision
        ? live.revision === here.revision
        : null,
    records: existsSync(database)
      ? {
          // Registered, not discovered: this is the database the environment
          // says it uses, and nothing scans for others.
          path: database,
          schema: schemaOf(database),
          browser: `http://127.0.0.1:${port}`,
        }
      : null,
    applications: (register?.applications ?? []).map((application) => ({
      id: application.id,
      name: application.name,
      exercises: application.exercises ?? null,
      url: application.url ?? null,
      // Hallvi's own records are local; these are the applications' own
      // databases, on their own host.
      dataLivesOn: (register?.host as { address?: string })?.address ?? null,
    })),
    host: register?.host ?? null,
    backups: backups(DEVELOPMENT_ROOT),
    registeredAt: existsSync(join(DEVELOPMENT_ROOT, "instance.json"))
      ? join(DEVELOPMENT_ROOT, "instance.json")
      : null,
  };
}

/** Everything that would go into a release archive, from the allowlist. */
function plannedContents(root: string) {
  const source = readFileSync(join(root, "scripts", "package.mjs"), "utf8");
  const block = source.slice(source.indexOf("for (const path of ["));
  const listed = [...block.slice(0, block.indexOf("])")).matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.includes(" "));
  return listed;
}

/** What a built archive actually holds, from the archive itself. */
export function actualContents(archive: string) {
  // A release includes tens of thousands of dependency paths. Node's default
  // 1 MiB output limit truncates that listing before we can inspect it.
  const listing = run("tar", ["-tzf", archive], undefined, 32 * 1024 * 1024);
  if (!listing) return null;
  return listing.split("\n").filter(Boolean);
}

/**
 * The boundaries worth checking on a real archive. Retained state, secrets,
 * backups and development-only tooling must not ship; the helpers that
 * development and production genuinely share must.
 */
const MUST_BE_ABSENT: { what: string; test: (entry: string) => boolean }[] = [
  {
    what: "the test suites and this dashboard",
    test: (e) => /(^|\/)tests\//.test(e),
  },
  {
    what: "any retained controller state",
    test: (e) => /(^|\/)\.hallvi\//.test(e),
  },
  {
    what: "migration or state backups",
    test: (e) =>
      /(^|\/)(migrations|backups)\//.test(e) && !e.startsWith(".next/"),
  },
  { what: "any database", test: (e) => /\.(db|sqlite3?)(-wal|-shm)?$/.test(e) },
  { what: "environment files", test: (e) => /(^|\/)\.env/.test(e) },
  {
    // Only the controller's own credential directories. `.next/` holds
    // compiled route handlers whose URLs contain the words "secrets" and
    // "operator"; those are code and belong in the archive.
    what: "sealed secrets or managed keys",
    test: (e) =>
      !e.startsWith(".next/") &&
      (/(^|\/)(secrets|operator)\//.test(e) || /id_ed25519/.test(e)),
  },
  {
    what: "the release signing tool",
    test: (e) => e === "scripts/sign-release.mjs",
  },
  {
    // Named exactly. A prefix match here would catch dev-environment.mjs,
    // which production reads.
    what: "development-only launchers",
    test: (e) =>
      [
        "scripts/dev.mjs",
        "scripts/dev-instance.mjs",
        "scripts/scenarios.ts",
        "scripts/inspect-conversation.mjs",
        "scripts/rotate-rig-credentials.mjs",
      ].includes(e),
  },
  { what: "the source tree", test: (e) => /(^|\/)src\//.test(e) },
];

const MUST_BE_PRESENT = [
  "install.sh",
  "scripts/serve.mjs",
  "scripts/cli.mjs",
  "scripts/migrations.mjs",
  "scripts/migrate-state.mjs",
  "dist/worker.mjs",
  "dist/schema.sql",
  "dist/schema-version.json",
  "node/bin/node",
];

export function archiveBoundary(entries: string[]) {
  const inside = entries.map((entry) => entry.replace(/^[^/]+\//, ""));
  // Only Hallvi's own paths are judged. A real archive carries 65,000
  // entries, most of them third-party: a dependency ships its own `tests/`
  // and the bundled Node.js carries npm's `src/`, and reading either as a
  // leak would make this check cry wolf on every build.
  const ours = inside.filter((entry) => !/^(node_modules|node)\//.test(entry));
  return {
    absent: MUST_BE_ABSENT.map(({ what, test }) => ({
      what,
      offenders: ours.filter((entry) => test(entry)).slice(0, 5),
    })),
    present: MUST_BE_PRESENT.map((path) => ({
      path,
      there: inside.some(
        (entry) => entry === path || entry.startsWith(`${path}/`),
      ),
    })),
    shared:
      "scripts/dev-environment.mjs, scripts/migrations.mjs and scripts/state-location.mjs are named for development but are read by serve.mjs and install.sh in production; they belong in the archive.",
  };
}

export async function releasesState(root: string) {
  const here = checkout(root);
  const version =
    readJsonFile<{ version: string }>(join(root, "package.json"))?.version ??
    null;
  const schema =
    readJsonFile<{ version: number }>(
      join(root, "src", "server", "schema-version.json"),
    )?.version ?? null;

  // The transitions this release would be able to carry out, read from the
  // one list both ways of upgrading use.
  const migrations = (() => {
    const source = readFileSync(
      join(root, "scripts", "migrations.mjs"),
      "utf8",
    );
    return [...source.matchAll(/from:\s*(\d+),\s*\n\s*to:\s*(\d+)/g)].map(
      (match) => ({ from: Number(match[1]), to: Number(match[2]) }),
    );
  })();

  const built = (() => {
    const dist = join(root, "dist");
    if (!existsSync(dist)) return [];
    return readdirSync(dist)
      .filter((name) => /^hallvi-.*\.tgz$/.test(name))
      .sort()
      .map((name) => {
        const path = join(dist, name);
        const checksum = existsSync(`${path}.sha256`)
          ? readFileSync(`${path}.sha256`, "utf8").trim().split(/\s+/)[0]
          : null;
        const entries = actualContents(path);
        return {
          name,
          // An archive whose name carries no platform predates the current
          // packaging; reporting its contents as today's boundary would be
          // measuring the wrong thing.
          stale: !/-(darwin-arm64|linux-x64)\.tgz$/.test(name),
          size: statSync(path).size,
          builtAt: statSync(path).mtime.toISOString(),
          checksum,
          contents: entries ? archiveBoundary(entries) : null,
          entries: entries?.length ?? null,
        };
      });
  })();

  const releases = (() => {
    const printed = run("gh", [
      "release",
      "list",
      "--repo",
      "lustoykov/hallvi",
      "--limit",
      "10",
      "--json",
      "tagName,isDraft,isPrerelease,publishedAt,createdAt",
    ]);
    return printed ? safeParse(printed) : null;
  })();

  const runs = (() => {
    const printed = run("gh", [
      "run",
      "list",
      "--repo",
      "lustoykov/hallvi",
      "--workflow",
      "release.yml",
      "--limit",
      "5",
      "--json",
      "databaseId,status,conclusion,headSha,createdAt,url",
    ]);
    return printed ? safeParse(printed) : null;
  })();

  const actionsEnabled = (() => {
    const printed = run("gh", [
      "api",
      `repos/lustoykov/hallvi/actions/permissions`,
      "--jq",
      ".enabled",
    ]);
    return printed === "true" ? true : printed === "false" ? false : null;
  })();

  return {
    version,
    schema,
    migrations,
    platforms: ["darwin-arm64", "linux-x64"],
    checkout: here,
    // Said plainly rather than shown as a badge: a release is built from a
    // revision, and anything not committed is simply not in it.
    excludesLocalChanges: here.changed.length > 0,
    built,
    plannedContents: built.length ? null : plannedContents(root),
    releases,
    runs,
    actionsEnabled,
    signedIn: run("gh", ["auth", "status"]) !== null,
  };
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
