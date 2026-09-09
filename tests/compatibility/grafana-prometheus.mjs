// Opt-in real acceptance. Application APIs run over pinned SSH; no credentials
// appear in command arguments, output, evidence files, or an HTTP WAN request.
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
  record.status !== "live" ||
  !record.plan?.services?.some((s) => s.name === "prometheus")
)
  throw Error("Choose a verified Grafana/Prometheus deployment.");
const directory = deploymentDirectory(record);
const credentials = JSON.parse(
  readFileSync(join(directory, "inputs.json"), "utf8"),
);
if (!credentials.GF_SECURITY_ADMIN_PASSWORD)
  throw Error("Missing private Grafana input.");
const previous =
  mode === "after"
    ? JSON.parse(
        readFileSync("tests/results/compatibility/grafana-before.json", "utf8"),
      )
    : null;
if (previous && previous.deploymentId !== id)
  throw Error("Deployment differs from before evidence.");
const python = `import json,sys,urllib.request,urllib.parse,urllib.error,base64,time,subprocess
x=json.load(sys.stdin)
auth="Basic "+base64.b64encode(("admin:"+x["password"]).encode()).decode()
def request(path,body=None):
 req=urllib.request.Request("http://127.0.0.1"+path,data=None if body is None else json.dumps(body).encode(),headers={"Authorization":auth,"Content-Type":"application/json"})
 with urllib.request.urlopen(req,timeout=20) as r: return json.load(r)
health=request("/api/health")
assert health["database"]=="ok"
ds=request("/api/datasources/uid/prometheus")
assert ds["url"]=="http://prometheus:9090" and ds["type"]=="prometheus"
# Query through Grafana's datasource proxy: proves their private connection.
def metric(at):
 q=request("/api/datasources/proxy/uid/prometheus/api/v1/query?"+urllib.parse.urlencode({"query":"up{job=\\"prometheus\\"}","time":at}))
 assert q["status"]=="success" and q["data"]["result"][0]["value"][1]=="1"
 return q["data"]["result"][0]
endpoint="/apis/dashboard.grafana.app/v1/namespaces/default/dashboards"
uid="sg-persistence-proof"
if x["mode"]=="before":
 try: request(endpoint+"/"+uid)
 except urllib.error.HTTPError as e:
  if e.code!=404: raise
  request(endpoint,{"metadata":{"name":uid},"spec":{"title":"Server Guy persistence proof","schemaVersion":41,"timezone":"browser","time":{"from":"now-15m","to":"now"},"panels":[{"id":1,"type":"timeseries","title":"Prometheus is scraping","gridPos":{"h":10,"w":24,"x":0,"y":0},"datasource":{"type":"prometheus","uid":"prometheus"},"targets":[{"refId":"A","expr":"up{job=\\"prometheus\\"}","datasource":{"type":"prometheus","uid":"prometheus"}}]}]}})
 at=int(time.time())-10
else: at=x["previous"]["sampleAt"]
dashboard=request(endpoint+"/"+uid)
assert dashboard["spec"]["title"]=="Server Guy persistence proof"
assert dashboard["spec"]["panels"][0]["targets"][0]["expr"]=='up{job="prometheus"}'
old=metric(at)
current=metric(int(time.time()))
# Inspect only port bindings; never print container environment secrets.
project="sg-"+x["id"][:8]
ids=subprocess.check_output(["docker","compose","-p",project,"-f","/opt/server-guy/"+x["id"]+"/compose.json","ps","-q","prometheus"],text=True).strip()
ports=json.loads(subprocess.check_output(["docker","inspect","--format","{{json .HostConfig.PortBindings}}",ids],text=True))
assert not ports
print(json.dumps({"dashboardUid":uid,"dashboardVersion":dashboard["metadata"]["resourceVersion"],"title":dashboard["spec"]["title"],"sampleAt":at,"retainedSample":old,"currentSample":current,"datasourceUrl":ds["url"],"prometheusPublishedPorts":ports,"grafanaDatabase":health["database"]}))`;
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
  {
    input: JSON.stringify({
      id,
      mode,
      password: credentials.GF_SECURITY_ADMIN_PASSWORD,
      previous,
    }),
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 100000,
  },
);
if (result.status !== 0)
  throw Error(
    `Grafana acceptance failed: ${result.stderr || result.error?.message}`,
  );
const proof = JSON.parse(result.stdout.trim());
if (
  previous &&
  (previous.dashboardUid !== proof.dashboardUid ||
    previous.dashboardVersion !== proof.dashboardVersion ||
    JSON.stringify(previous.retainedSample) !==
      JSON.stringify(proof.retainedSample))
)
  throw Error("Persisted dashboard/sample differs after recreation.");
const evidence = {
  at: new Date().toISOString(),
  deploymentId: id,
  mode,
  ...proof,
};
mkdirSync("tests/results/compatibility", { recursive: true });
writeFileSync(
  `tests/results/compatibility/grafana-${mode}.json`,
  JSON.stringify(evidence, null, 2),
);
console.log(evidence);
