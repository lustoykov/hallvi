// Build the isolated scenario database.
//
// States a real deployment never shows — a week-old check, a withdrawn
// record, an established absence — have to be looked at somewhere, and it
// must not be inside a real application. This writes them into a database of
// their own whose only purpose is to be inspected.
//
// Usage: node scripts/load-scenarios.mjs <state directory>
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const target = resolve(process.argv[2] ?? "tests/results/scenarios");
const database = join(target, "server-guy.db");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

// Start from a schema-stamped database rather than recreating the schema, so
// the scenarios always match the version the product refuses to run without.
const source = process.argv[3]
  ? resolve(process.argv[3])
  : resolve("tests/results/rig/acceptance/state");
for (const name of ["server-guy.db"])
  cpSync(join(source, name), join(target, name));
for (const name of ["pi-settings.json", "github-connection.json"])
  try {
    cpSync(join(source, name), join(target, name));
  } catch {
    // Optional: a scenario database needs no credentials.
  }

const sql = (statement) =>
  execFileSync("sqlite3", [database, statement], { encoding: "utf8" });

// Nothing real survives into the scenario database.
sql(
  "delete from saved_information; delete from messages; delete from conversations; delete from applications;",
);

const { scenarios } =
  await import("../tests/fixtures/scenario-records.ts").catch(async () => {
    // Run the TypeScript through tsx when this is invoked directly.
    const { execFileSync: run } = await import("node:child_process");
    run(
      "node",
      ["--import", "tsx", process.argv[1], ...process.argv.slice(2)],
      {
        stdio: "inherit",
      },
    );
    process.exit(0);
  });

const quote = (value) =>
  value === null || value === undefined
    ? "null"
    : `'${String(value).split("'").join("''")}'`;
const now = new Date().toISOString();

for (const scenario of scenarios()) {
  sql(
    `insert into applications (id, name, repository_url, repository_owner, repository_name, permission_mode, created_at, updated_at) values (${quote(scenario.id)}, ${quote(scenario.name)}, 'https://github.com/scenario/scenario', 'scenario', 'scenario', 'always-ask', ${quote(now)}, ${quote(now)})`,
  );
  for (const record of scenario.records)
    sql(
      `insert into saved_information (id, application_id, title, body, evidence, established_at, presentation, created_at, updated_at, retired_at) values (${quote(record.id)}, ${quote(scenario.id)}, ${quote(record.title)}, ${quote(record.body)}, '[]', ${quote(record.establishedAt)}, ${quote(JSON.stringify(record.presentation))}, ${quote(record.createdAt)}, ${quote(record.updatedAt)}, ${quote(record.retiredAt)})`,
    );
  console.log(
    `${scenario.name}: ${scenario.records.length} records — ${scenario.shows}`,
  );
}
console.log(`\nwrote ${database}`);
void dirname;
