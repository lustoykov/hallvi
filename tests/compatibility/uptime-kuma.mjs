// Real, opt-in acceptance after creating a monitor through Uptime Kuma's UI.
// Read SQLite consistently over pinned SSH; never edit it or read credentials.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDeployment } from "../../src/server/deployment-store.ts";
import { deploymentDirectory } from "../../src/server/deployment-files.ts";
const [id, mode = "after"] = process.argv.slice(2);
if (!["before", "after"].includes(mode)) throw Error("Use before or after.");
const record = getDeployment(id);
if (
  !record ||
  record.repository !== "louislam/uptime-kuma" ||
  record.status !== "live"
)
  throw Error("Choose a verified Uptime Kuma deployment.");
const directory = deploymentDirectory(record);
const volume = record.plan.volumes.find((v) => v.sqlite);
if (!volume) throw Error("No persistent SQLite volume recorded.");
const volumeName = `sg-${record.id.slice(0, 8)}_${volume.name}`;
const sqliteFile = volume.sqlite.slice(volume.target.length + 1);
const python = `import sqlite3,json,subprocess,os\nroot=subprocess.check_output(["docker","volume","inspect","--format","{{.Mountpoint}}",${JSON.stringify(volumeName)}],text=True).strip()\np=os.path.join(root,${JSON.stringify(sqliteFile)})\nc=sqlite3.connect("file:"+p+"?mode=ro",uri=True)\nc.execute("PRAGMA query_only=ON")\nc.execute("BEGIN")\nassert c.execute("PRAGMA integrity_check").fetchone()[0]=="ok"\nmonitor=c.execute("select id,name,url,interval from monitor where name=?",("Server Guy persistence proof",)).fetchone()\nassert monitor is not None\nbeats=c.execute("select count(*),min(id),max(id),sum(case when status=1 then 1 else 0 end) from heartbeat where monitor_id=?",(monitor[0],)).fetchone()\nassert beats[0]>0 and beats[3]>0\nprint(json.dumps({"monitor":list(monitor),"heartbeats":list(beats),"users":c.execute("select count(*) from user").fetchone()[0],"integrity":"ok"}))`;
const encoded = Buffer.from(python).toString("base64");
const result = spawnSync(
  "ssh",
  [
    "-i",
    join(directory, "client"),
    "-o",
    `UserKnownHostsFile=${join(directory, "known_hosts")}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "BatchMode=yes",
    `root@${record.address}`,
    `python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`,
  ],
  { encoding: "utf8", timeout: 30000, maxBuffer: 100000 },
);
if (result.status !== 0)
  throw Error(
    `Kuma acceptance failed: ${result.stderr || result.error?.message}`,
  );
const proof = JSON.parse(result.stdout.trim());
mkdirSync("tests/results/compatibility", { recursive: true });
if (mode === "after") {
  const previous = JSON.parse(
    readFileSync("tests/results/compatibility/kuma-before.json", "utf8"),
  );
  if (
    previous.deploymentId !== id ||
    JSON.stringify(previous.monitor) !== JSON.stringify(proof.monitor) ||
    previous.users !== proof.users ||
    previous.heartbeats[1] !== proof.heartbeats[1] ||
    previous.heartbeats[0] > proof.heartbeats[0]
  )
    throw Error("Application data did not survive unchanged.");
}
const evidence = {
  at: new Date().toISOString(),
  deploymentId: id,
  mode,
  ...proof,
};
writeFileSync(
  `tests/results/compatibility/kuma-${mode}.json`,
  JSON.stringify(evidence, null, 2),
);
console.log(evidence);
