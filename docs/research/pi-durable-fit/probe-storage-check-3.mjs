// What the first probe did not check, and Hallvi does today: its controller
// recovery copy reads every file under pi-sessions "as it stands" while the
// worker runs (src/server/controller-protection.ts walk(): readdirSync().sort()
// then readFileSync per file). What does such a file-by-file copy of a LIVE
// pi-durable store contain?
// Usage: node probe-storage-check-3.mjs [copies=150] [section 1-5, default all]
//   [pauseMs=15]
import { fork } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { backup, DatabaseSync } from "node:sqlite";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import {
  NodeSqliteDatabase,
  openNodeSqliteStorage,
} from "@earendil-works/pi-durable/storage/sqlite/node";
import { openNodeJsonlStorage } from "@earendil-works/pi-durable/storage/jsonl/node";
import {
  call,
  CHECK_DATA,
  context,
  freshCheck,
  MODEL,
  open,
  quiet,
  say,
  texts,
} from "./probe-storage-check-lib.mjs";

quiet();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COPIES = Number(process.argv[2] ?? 150);
const ONLY = process.argv[3];
const PAUSE = Number(process.argv[4] ?? 15);
const section = (n) =>
  process.argv[2] !== "child" && (ONLY === undefined || ONLY === String(n));

async function exclusiveStorage(path) {
  const raw = new DatabaseSync(path, { timeout: 200 });
  raw.exec("PRAGMA locking_mode = EXCLUSIVE");
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA synchronous = NORMAL");
  return {
    raw,
    storage: await SqliteStorage.open(new NodeSqliteDatabase(raw)),
  };
}

// -------- child: one owner running turns forever --------
if (process.argv[2] === "child") {
  const [backend, path] = process.argv.slice(3);
  const storage =
    backend === "jsonl"
      ? await openNodeJsonlStorage(path, context)
      : backend === "sqlite-exclusive"
        ? (await exclusiveStorage(path)).storage
        : await openNodeSqliteStorage(path);
  const { harness, faux } = await open(storage, {
    settings: { compaction: { enabled: false, backgroundTokens: 0 } },
  });
  const root = await harness.root(context, { agent: { model: MODEL } });
  process.send({ ready: true });
  for (let turn = 1; ; turn++) {
    faux.appendResponses(
      turn % 3 === 0
        ? [
            call("noisy", { lines: 10, delayMs: 1 }, `c${turn}`),
            say(`answer ${turn}`),
          ]
        : [say(`answer ${turn}`)],
    );
    await (
      await root.submit({ type: "input", content: `question ${turn}` }, context)
    ).wait(context);
    if (turn % 5 === 0) await sleep(1); // let IPC/timers breathe
  }
}

function startOwner(backend, path) {
  const child = fork(fileURLToPath(import.meta.url), ["child", backend, path], {
    execArgv: ["--disable-warning=ExperimentalWarning"],
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  return new Promise((resolve) => child.once("message", () => resolve(child)));
}

/**
 * Hallvi's walk(): sorted names, one readFileSync per file. Returns the copy
 * directory, or the error.
 */
function walkCopy(sourceDir, targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  for (const name of readdirSync(sourceDir).sort())
    writeFileSync(join(targetDir, name), readFileSync(join(sourceDir, name)));
}

function checkSqliteCopy(path) {
  let db;
  try {
    db = new DatabaseSync(path);
    const integrity = db
      .prepare("PRAGMA integrity_check")
      .all()
      .map((r) => r.integrity_check)
      .join("; ");
    const entries = db
      .prepare("select count(*) n, max(id) top from entries")
      .get();
    return { integrity: integrity.slice(0, 80), entries: entries.n };
  } catch (error) {
    return { error: `${error.message}`.slice(0, 80) };
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const show = (map) =>
  JSON.stringify(
    Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1])),
  );

// -------- 1. sqlite: copy only the main file of an open store --------
if (section(1)) {
  console.log(
    "=== 1. sqlite: a copy of ONLY the main file while the store is open (a backup that skips -wal/-shm) ===",
  );
  const dir = await freshCheck("live-main-only");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "conversation.sqlite");
  const { harness } = await open(await openNodeSqliteStorage(path), {
    responses: [say("one"), say("two"), say("three")],
  });
  const root = await harness.root(context, { agent: { model: MODEL } });
  for (const q of ["1", "2", "3"])
    await (
      await root.submit({ type: "input", content: q }, context)
    ).wait(context);
  console.log(
    "  owner sees",
    (await texts(root)).length,
    "entries; main file is",
    statSync(path).size,
    "bytes, -wal is",
    statSync(`${path}-wal`).size,
    "bytes",
  );
  const copy = join(
    await freshCheck("live-main-only-copy"),
    "conversation.sqlite",
  );
  mkdirSync(dirname(copy), { recursive: true });
  copyFileSync(path, copy);
  console.log(
    "  raw check of the copy:",
    JSON.stringify(checkSqliteCopy(copy)),
  );
  try {
    const restored = await open(await openNodeSqliteStorage(copy));
    const restoredRoot = await restored.harness.root(context);
    console.log(
      "  Harness.open on the copy: ok, entries =",
      JSON.stringify(await texts(restoredRoot)),
      "<- an empty conversation, no error",
    );
    await restored.harness.close(context);
  } catch (error) {
    console.log("  Harness.open on the copy FAILED:", error.message);
  }
  await harness.close(context);
}

// -------- 2. sqlite: file-by-file copies while the owner commits --------
if (section(2)) {
  console.log(
    `=== 2. sqlite: ${COPIES} file-by-file copies (main, -shm, -wal in sorted order) while another process runs turns ===`,
  );
  const dir = await freshCheck("live-walk-sqlite");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "conversation.sqlite");
  const owner = await startOwner("sqlite", path);
  await sleep(300);
  const outcomes = new Map();
  let lost = 0;
  let worstLoss = 0;
  const copyDir = await freshCheck("live-walk-sqlite-copy");
  for (let i = 0; i < COPIES; i++) {
    // What was certainly committed before the copy began, read through a second
    // read-only connection.
    const live = new DatabaseSync(path, { readOnly: true });
    const before = live.prepare("select count(*) n from entries").get().n;
    live.close();
    try {
      walkCopy(dir, copyDir);
    } catch (error) {
      tally(outcomes, `walk threw ${error.code}`);
      continue;
    }
    const result = checkSqliteCopy(join(copyDir, "conversation.sqlite"));
    if (result.error) tally(outcomes, `error: ${result.error}`);
    else if (result.integrity !== "ok")
      tally(outcomes, `integrity: ${result.integrity}`);
    else if (result.entries < before) {
      lost++;
      worstLoss = Math.max(worstLoss, before - result.entries);
      tally(outcomes, "opens, integrity ok, but entries MISSING");
    } else tally(outcomes, "ok");
    await sleep(PAUSE);
  }
  const total = new DatabaseSync(path, { readOnly: true });
  console.log(
    `  owner committed ${total.prepare("select count(*) n from entries").get().n} entries meanwhile; main=${statSync(path).size} wal=${statSync(`${path}-wal`).size}`,
  );
  total.close();
  console.log(
    "  outcomes:",
    show(outcomes),
    lost ? `| worst silent loss: ${worstLoss} entries` : "",
  );
  owner.kill("SIGKILL");
}

// -------- 3. sqlite: the deterministic version of the race --------
if (section(3)) {
  console.log(
    "=== 3. sqlite, deterministic: main copied, then a checkpoint + more commits happen, then -wal copied ===",
  );
  const dir = await freshCheck("live-race");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "conversation.sqlite");
  const { harness, faux } = await open(
    await openNodeSqliteStorage(path, { walAutoCheckpointPages: 200 }),
    { settings: { compaction: { enabled: false, backgroundTokens: 0 } } },
  );
  const root = await harness.root(context, { agent: { model: MODEL } });
  const turn = async (n) => {
    faux.appendResponses([say(`answer ${n} ${"x".repeat(300)}`)]);
    await (
      await root.submit({ type: "input", content: `question ${n}` }, context)
    ).wait(context);
  };
  for (let n = 1; n <= 3; n++) await turn(n);
  const copyDir = await freshCheck("live-race-copy");
  mkdirSync(copyDir, { recursive: true });
  const mainAtCopy = statSync(path).size;
  copyFileSync(path, join(copyDir, "conversation.sqlite"));
  let n = 4;
  // until a checkpoint moved pages into main
  for (; n <= 200 && statSync(path).size === mainAtCopy; n++) await turn(n);
  for (let extra = 0; extra < 3; extra++) await turn(n++);
  copyFileSync(`${path}-wal`, join(copyDir, "conversation.sqlite-wal"));
  const truth = (await texts(root)).length;
  console.log(
    `  main copied at ${mainAtCopy} bytes; after ${n - 1} turns main is ${statSync(path).size} bytes; owner has ${truth} entries`,
  );
  console.log(
    "  raw check of the copy:",
    JSON.stringify(checkSqliteCopy(join(copyDir, "conversation.sqlite"))),
  );
  try {
    const restored = await open(
      await openNodeSqliteStorage(join(copyDir, "conversation.sqlite")),
    );
    const restoredRoot = await restored.harness.root(context);
    console.log(
      "  Harness.open on the copy: ok, entries =",
      (await texts(restoredRoot)).length,
    );
    await restored.harness.close(context);
  } catch (error) {
    console.log(
      "  Harness.open on the copy FAILED:",
      `${error.name}: ${error.message}`.slice(0, 200),
    );
  }
  await harness.close(context);
}

// -------- 4. jsonl: file-by-file copies while the owner commits --------
if (section(4)) {
  console.log(
    `=== 4. jsonl: ${COPIES} file-by-file copies (sorted names) while another process runs turns ===`,
  );
  const dir = await freshCheck("live-walk-jsonl");
  const owner = await startOwner("jsonl", dir);
  await sleep(300);
  const outcomes = new Map();
  const copyDir = await freshCheck("live-walk-jsonl-copy");
  for (let i = 0; i < COPIES; i++) {
    try {
      walkCopy(dir, copyDir);
    } catch (error) {
      tally(
        outcomes,
        `walk threw ${error.code} (${basename(error.path ?? "")})`.replace(
          /\d+/g,
          "N",
        ),
      );
      await sleep(15);
      continue;
    }
    try {
      const storage = await openNodeJsonlStorage(copyDir, context);
      await storage.close(context);
      tally(outcomes, "ok");
    } catch (error) {
      tally(
        outcomes,
        `${error.name}: ${error.message}`.replace(/\d+/g, "N").slice(0, 90),
      );
    }
    await sleep(15);
  }
  console.log("  outcomes:", show(outcomes));
  owner.kill("SIGKILL");
}

// -------- 5. a consistent copy: the SQLite online backup --------
if (section(5)) {
  console.log(
    "=== 5. sqlite: online backup (node:sqlite backup()) instead of copying files ===",
  );
  console.log("  node:sqlite exports backup():", typeof backup);
  // a. plain owner in another process; the copier uses its own read-only
  // connection.
  {
    const dir = await freshCheck("backup-plain");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "conversation.sqlite");
    const owner = await startOwner("sqlite", path);
    await sleep(300);
    const outcomes = new Map();
    const target = join(CHECK_DATA, "backup-plain-copy.sqlite");
    for (let i = 0; i < 40; i++) {
      rmSync(target, { force: true });
      const source = new DatabaseSync(path, { readOnly: true });
      const before = source.prepare("select count(*) n from entries").get().n;
      try {
        await backup(source, target);
        const result = checkSqliteCopy(target);
        tally(
          outcomes,
          result.error
            ? `error: ${result.error}`
            : result.integrity !== "ok"
              ? `integrity: ${result.integrity}`
              : result.entries < before
                ? "entries missing"
                : "ok",
        );
      } catch (error) {
        tally(outcomes, `backup threw: ${error.message}`.slice(0, 80));
      } finally {
        source.close();
      }
      await sleep(15);
    }
    console.log(
      "  a. plain owner, second connection + backup(), 40 copies during turns:",
      show(outcomes),
    );
    owner.kill("SIGKILL");
  }
  // b. owner uses the EXCLUSIVE fence: a second connection cannot read at all.
  {
    const dir = await freshCheck("backup-exclusive");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "conversation.sqlite");
    const owner = await startOwner("sqlite-exclusive", path);
    await sleep(300);
    const started = Date.now();
    try {
      const source = new DatabaseSync(path, { readOnly: true, timeout: 200 });
      try {
        await backup(source, join(CHECK_DATA, "backup-exclusive-copy.sqlite"));
        console.log(
          "  b. exclusive owner, second connection + backup(): ok (unexpected)",
        );
      } finally {
        source.close();
      }
    } catch (error) {
      console.log(
        `  b. exclusive owner, second connection + backup(): FAILED ${error.message} (${Date.now() - started} ms)`,
      );
    }
    owner.kill("SIGKILL");
  }
  // c. exclusive owner backs itself up through the raw handle the host kept,
  // while its own turns run.
  {
    const dir = await freshCheck("backup-self");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "conversation.sqlite");
    const { raw, storage } = await exclusiveStorage(path);
    const { harness, faux } = await open(storage, {
      fauxOptions: { tokensPerSecond: 400 },
      settings: { compaction: { enabled: false, backgroundTokens: 0 } },
    });
    const root = await harness.root(context, { agent: { model: MODEL } });
    let running = true;
    let turns = 0;
    const loop = (async () => {
      while (running) {
        faux.appendResponses([say(`answer ${turns} ${"word ".repeat(40)}`)]);
        const settled = await (
          await root.submit(
            { type: "input", content: `question ${turns}` },
            context,
          )
        ).wait(context);
        if (settled.status !== "done")
          throw new Error(`turn ${turns}: ${settled.status}`);
        turns++;
      }
    })();
    const outcomes = new Map();
    const target = join(CHECK_DATA, "backup-self-copy.sqlite");
    for (let i = 0; i < 20; i++) {
      await sleep(60);
      rmSync(target, { force: true });
      const before = (await texts(root)).length;
      try {
        await backup(raw, target);
        const result = checkSqliteCopy(target);
        tally(
          outcomes,
          result.error
            ? `error: ${result.error}`
            : result.integrity !== "ok"
              ? `integrity: ${result.integrity}`
              : result.entries < before
                ? "entries missing"
                : "ok",
        );
      } catch (error) {
        tally(outcomes, `backup threw: ${error.message}`.slice(0, 80));
      }
    }
    running = false;
    let loopError;
    await loop.catch((error) => (loopError = error));
    console.log(
      `  c. exclusive owner backs itself up via backup(raw, target) during its own streaming turns (${turns} turns ran): ${show(outcomes)}${loopError ? ` | owner loop error: ${loopError.message}` : " | owner turns all done"}`,
    );
    await harness.close(context);
  }
}
