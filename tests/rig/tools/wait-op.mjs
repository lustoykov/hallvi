// Exit when the given operation leaves proposed/queued/working (read-only).
// Usage: node wait-op.mjs <db> <operationId> [timeoutSeconds]
import { execFileSync } from "node:child_process";

const [db, id, timeout = "1800"] = process.argv.slice(2);
const deadline = Date.now() + Number(timeout) * 1000;
const read = () => {
  try {
    return execFileSync(
      "sqlite3",
      [
        "-readonly",
        db,
        `select state, substr(json_extract(body,'$.summary'),1,600) from application_operations where id='${id}'`,
      ],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
};
for (;;) {
  const row = read();
  const state = row.split("|")[0];
  if (row && !["proposed", "queued", "working"].includes(state)) {
    console.log(row);
    process.exit(0);
  }
  if (Date.now() > deadline) {
    console.log(`timeout; last: ${row}`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
