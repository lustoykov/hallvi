// Serve the real application against the scenario records.
//
// Usage: npm run scenarios -- [port]
//
// Every state a destination claims to support has to be looked at, and the
// two real journeys only ever produce a handful of them: nothing has failed,
// nothing has been withdrawn, nothing is a week old, every application is the
// same shape. The rest are written in `tests/fixtures/scenario-records.ts`,
// and this command puts them through the shipping pages rather than through a
// second set of layouts built to display them. A page that only a reference
// shell renders proves nothing about the page an owner opens.
//
// The database is built here, from scratch, every time. It never reads
// `HALLVI_DB_PATH`, never opens `.hallvi`, and holds no credentials:
// a scenario record mixed into a real application is a lie that outlives the
// command that wrote it.
import Database from "better-sqlite3";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  scenarios,
  type ScenarioExecution,
} from "../tests/fixtures/scenario-records";

const port = Number(process.argv[2] ?? 3190);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Give a port from 1024 to 65535.");

// Under `tests/results`, which is local data and never committed. Fixed
// rather than derived from the environment: this command has exactly one
// database, and the owner's is not reachable from here by any setting.
const state = resolve("tests/results/scenarios");
const database = join(state, "hallvi.db");
rmSync(state, { recursive: true, force: true });
mkdirSync(state, { recursive: true });

const environment = {
  ...process.env,
  HALLVI_DB_PATH: database,
  HALLVI_CONFIG_DIR: state,
  // Isolated too: this command must not read, refresh or disturb the
  // ChatGPT connection the owner's checkouts share.
  HALLVI_PI_CONFIG_DIR: state,
  HALLVI_LOG_DIR: join(state, "diagnostics"),
  HALLVI_TRACING: "0",
};

// The product refuses to run against a database it did not stamp, so the
// schema comes from the same command a developer runs, not from SQL here.
const pushed = spawnSync("npm", ["run", "db:push", "--silent"], {
  env: environment,
  stdio: "inherit",
});
if (pushed.status !== 0)
  throw new Error("The scenario schema could not be created.");

const db = new Database(database);
const now = new Date().toISOString();
const application = db.prepare(
  `insert into applications (id, name, repository_url, repository_owner, repository_name, permission_mode, created_at, updated_at)
   values (?, ?, ?, ?, ?, 'always-ask', ?, ?)`,
);
const conversation = db.prepare(
  `insert into conversations (id, application_id, title, kind, created_at, updated_at)
   values (?, ?, 'Main operator', 'main', ?, ?)`,
);
const information = db.prepare(
  `insert into saved_information (id, application_id, title, body, evidence, established_at, presentation, created_at, updated_at, retired_at)
   values (?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
);

/**
 * Command output lives in files beside the database rather than in a table,
 * so Logs is populated the way the product populates it.
 */
function writeExecutions(
  applicationId: string,
  chatId: string,
  list: ScenarioExecution[],
) {
  const directory = join(state, "operator", applicationId, "executions");
  mkdirSync(directory, { recursive: true });
  for (const item of list) {
    const id = randomUUID();
    const at = new Date(Date.now() - item.ago).toISOString();
    writeFileSync(
      join(directory, `${id}.json`),
      JSON.stringify(
        {
          id,
          applicationId,
          chatId,
          runId: randomUUID(),
          tool: item.tool,
          target: item.target,
          input: item.input,
          mode: "always-ask",
          status: item.status,
          output: item.output,
          exitCode: item.exitCode ?? null,
          createdAt: at,
          outputAt: at,
          finishedAt: at,
        },
        null,
        2,
      ),
    );
  }
}

const built = scenarios().map((scenario) => {
  const slug = scenario.name
    .replace(/^Scenario · /, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  application.run(
    scenario.id,
    scenario.name,
    `https://github.com/scenario/${slug}`,
    "scenario",
    slug,
    now,
    now,
  );
  const chatId = randomUUID();
  conversation.run(chatId, scenario.id, now, now);
  for (const record of scenario.records)
    information.run(
      record.id,
      scenario.id,
      record.title,
      record.body,
      record.establishedAt,
      JSON.stringify(record.presentation),
      record.createdAt,
      record.updatedAt,
      record.retiredAt,
    );
  if (scenario.executions?.length)
    writeExecutions(scenario.id, chatId, scenario.executions);
  return scenario;
});
db.close();

console.log(`Scenario database: ${database}\n`);
for (const scenario of built)
  console.log(
    `${scenario.name}\n  ${scenario.shows}\n  http://127.0.0.1:${port}/applications/${scenario.id}\n`,
  );
console.log(
  "Every destination is a fragment on those addresses, for example #deployment, #storage, #backups, #logs.\n",
);

const next = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { stdio: "inherit", env: environment },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => next.kill(signal));
next.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
