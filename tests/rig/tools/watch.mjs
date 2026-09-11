// Emits one line per meaningful change in the rig's records: deployment
// status and events, operation states, Pi run states and completed messages.
// Read-only (sqlite3 -readonly).
import { execFileSync } from "node:child_process";

const db = process.argv[2];
const query = (sql) => {
  try {
    const out = execFileSync("sqlite3", ["-readonly", "-json", db, sql], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.trim() ? JSON.parse(out) : [];
  } catch {
    return [];
  }
};
const flat = (text, limit) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .slice(0, limit);
const now = () => new Date().toISOString().slice(11, 19);
const deployments = new Map();
const events = new Map();
const operations = new Map();
const runs = new Map();
const messages = new Set();
let first = true;

function tick() {
  for (const d of query(
    "select id, status, json_array_length(body, '$.events') as n from deployments",
  )) {
    if (deployments.get(d.id) !== d.status) {
      console.log(`${now()} deployment ${d.id.slice(0, 8)} -> ${d.status}`);
      deployments.set(d.id, d.status);
    }
    const from = events.get(d.id) ?? (first ? d.n : 0);
    if (d.n > from)
      for (const row of query(
        `select value from json_each((select body from deployments where id='${d.id}'), '$.events') where key >= ${from}`,
      ))
        console.log(
          `${now()} event: ${flat(JSON.parse(row.value).message, 320)}`,
        );
    events.set(d.id, d.n);
  }
  for (const o of query(
    "select id, kind, state, json_extract(body, '$.title') as title from application_operations",
  ))
    if (operations.get(o.id) !== o.state) {
      console.log(`${now()} operation "${o.title}" (${o.kind}) -> ${o.state}`);
      operations.set(o.id, o.state);
    }
  for (const r of query("select id, status, error from pi_runs"))
    if (runs.get(r.id) !== r.status) {
      console.log(
        `${now()} pi run ${r.id.slice(0, 8)} -> ${r.status}${r.error ? ` (${flat(r.error, 200)})` : ""}`,
      );
      runs.set(r.id, r.status);
    }
  for (const m of query(
    "select id, role, substr(body, 1, 600) as body from messages where status = 'completed'",
  ))
    if (!messages.has(m.id)) {
      if (!first) console.log(`${now()} ${m.role}: ${flat(m.body, 600)}`);
      messages.add(m.id);
    }
  first = false;
}
tick();
setInterval(tick, 3000);
