"""Temporary Grafana fixtures and functional verification of downloaded restores.

The random password is supplied ONLY to the external test endpoint after restore,
never back to Grafana. A successful query therefore requires secret decryption.
"""

import hashlib
import json
import secrets
import shlex
import time
from pathlib import Path

SOURCE_API = """import base64,json,sys,urllib.request,urllib.error
p=json.load(sys.stdin)
definition=json.load(open(p["compose"]))
env=definition["services"]["app"]["environment"]
if isinstance(env,list): env=dict(v.split("=",1) for v in env)
auth=base64.b64encode((env["GF_SECURITY_ADMIN_USER"]+":"+env["GF_SECURITY_ADMIN_PASSWORD"]).encode()).decode()
data=json.dumps(p["body"]).encode() if p.get("body") is not None else None
request=urllib.request.Request("http://127.0.0.1:80"+p["path"],data=data,method=p["method"],headers={"Authorization":"Basic "+auth,"Content-Type":"application/json"})
try:
 response=urllib.request.urlopen(request,timeout=20)
except urllib.error.HTTPError as error: response=error
with response:
 raw=response.read()
 try: body=json.loads(raw)
 except ValueError: body={"bytes":len(raw),"sha256":__import__("hashlib").sha256(raw).hexdigest()}
 print(json.dumps({"status":response.status,"body":body}))
"""


def source_api(run, ssh, deployment_id, method, path, body=None):
    result = json.loads(
        run(
            *ssh,
            "python3 -c " + shlex.quote(SOURCE_API),
            input=json.dumps(
                {
                    "compose": f"/opt/server-guy/{deployment_id}/compose.json",
                    "path": path,
                    "method": method,
                    "body": body,
                }
            ).encode(),
        )
    )
    if result["status"] >= 400:
        raise RuntimeError(
            "Grafana source API failed with HTTP " + str(result["status"])
        )
    return result["body"]


def setup(run, ssh, deployment_id, proof, directory, fixture):
    """Populate fixture incrementally so a partial setup can always be cleaned up."""

    def save_fixture():
        path = directory / "functional-fixture.json"
        path.write_text(json.dumps(fixture))
        path.chmod(0o600)

    fixture.update(
        {
            "uid": "sg-proof-" + proof[:12],
            "container": "sg-auth-" + proof,
            "remoteDir": "/var/tmp/sg-functional-" + proof,
            "alias": "sg-auth-" + proof[:12],
            "password": secrets.token_urlsafe(32),
        }
    )
    fixture["image"] = (
        run(
            "docker",
            "image",
            "inspect",
            "python:3.12-alpine",
            "--format",
            "{{index .RepoDigests 0}}",
        )
        .decode()
        .strip()
    )
    save_fixture()
    # All dependencies are ready before creating application records or pausing it.
    run(*ssh, "docker pull " + shlex.quote(fixture["image"]), timeout=180)
    meta = json.loads(run(*ssh, "docker inspect sg-" + deployment_id[:8] + "-app-1"))[0]
    networks = list(meta["NetworkSettings"]["Networks"])
    if len(networks) != 1:
        raise RuntimeError("Functional proof requires one source Compose network")
    remote = fixture["remoteDir"]
    run(*ssh, "umask 077; mkdir " + shlex.quote(remote))
    run(
        *ssh,
        "cat > " + shlex.quote(remote + "/server.py"),
        input=Path(__file__).with_name("fixture-http.py").read_bytes(),
    )
    config = {"password": fixture["password"], "upstream": "http://prometheus:9090"}
    run(
        *ssh,
        "umask 077; cat > " + shlex.quote(remote + "/config.json"),
        input=json.dumps(config).encode(),
    )
    command = [
        "docker",
        "run",
        "-d",
        "--name",
        fixture["container"],
        "--label",
        "sg-backup-proof=" + proof,
        "--network",
        networks[0],
        "--network-alias",
        fixture["alias"],
        "--memory",
        "128m",
        "--cpus",
        "0.5",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "-v",
        remote + ":/fixture:ro",
        fixture["image"],
        "python3",
        "/fixture/server.py",
        "/fixture/config.json",
    ]
    run(*ssh, shlex.join(command))
    sources = source_api(run, ssh, deployment_id, "GET", "/api/datasources")
    original = next(d for d in sources if d["type"] == "prometheus")
    datasource = {
        "uid": fixture["uid"],
        "name": "Restore proof · authenticated Prometheus",
        "type": "prometheus",
        "access": "proxy",
        "url": "http://" + fixture["alias"] + ":8080",
        "basicAuth": True,
        "basicAuthUser": "proof",
        "secureJsonData": {"basicAuthPassword": fixture["password"]},
        "jsonData": {
            "httpMethod": "POST",
            "prometheusType": "Prometheus",
            "prometheusVersion": "3.0.0",
        },
    }
    # Mark IDs before writes, covering uncertain network outcomes.
    fixture["datasourceAttempted"] = True
    save_fixture()
    source_api(run, ssh, deployment_id, "POST", "/api/datasources", datasource)
    panels = []
    for index, source in enumerate([original["uid"], fixture["uid"]], 1):
        panels.append(
            {
                "id": index,
                "type": "timeseries",
                "title": "Recovered samples"
                if index == 1
                else "Encrypted credential query",
                "gridPos": {"h": 9, "w": 12, "x": (index - 1) * 12, "y": 0},
                "datasource": {"type": "prometheus", "uid": source},
                "targets": [
                    {
                        "refId": "A",
                        "expr": "up",
                        "range": True,
                        "datasource": {"type": "prometheus", "uid": source},
                    }
                ],
            }
        )
    dashboard = {
        "uid": fixture["uid"],
        "title": "Server Guy restore verification",
        "tags": ["server-guy-restore-proof"],
        "schemaVersion": 40,
        "panels": panels,
        "time": {"from": "now-1h", "to": "now"},
        "refresh": "",
    }
    fixture["dashboardAttempted"] = True
    save_fixture()
    source_api(
        run,
        ssh,
        deployment_id,
        "POST",
        "/api/dashboards/db",
        {"dashboard": dashboard, "overwrite": False},
    )
    fixture["dashboard"] = source_api(
        run, ssh, deployment_id, "GET", "/api/dashboards/uid/" + fixture["uid"]
    )["dashboard"]
    health = source_api(
        run,
        ssh,
        deployment_id,
        "GET",
        "/api/datasources/uid/" + fixture["uid"] + "/health",
    )
    if health.get("status") != "OK":
        raise RuntimeError("Source authenticated datasource health failed")
    save_fixture()


def start_restore_fixture(run, fixture, proof, project, directory):
    config = directory / "auth-endpoint.json"
    config.write_text(
        json.dumps(
            {"password": fixture["password"], "upstream": "http://prometheus:9090"}
        )
    )
    config.chmod(0o600)
    run(
        "docker",
        "run",
        "-d",
        "--name",
        "sg-restored-auth-" + proof,
        "--label",
        "sg-backup-proof=" + proof,
        "--network",
        project + "_proof",
        "--network-alias",
        fixture["alias"],
        "--memory",
        "128m",
        "--cpus",
        "0.5",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "-v",
        str(Path(__file__).with_name("fixture-http.py").resolve()) + ":/server.py:ro",
        "-v",
        str(config) + ":/config.json:ro",
        fixture["image"],
        "python3",
        "/server.py",
        "/config.json",
    )


def verify(run, fixture, proof, project, restored, grafana_request, manifest):
    dashboard = grafana_request("/api/dashboards/uid/" + fixture["uid"])["dashboard"]
    if dashboard != fixture["dashboard"]:
        raise RuntimeError("Saved dashboard differs after restore")
    # Exercise the actual stored query definitions, not just an HTTP health check.
    query_start = str(int((manifest["startedAt"] - 600) * 1000))
    query_end = str(int((manifest["startedAt"] - 30) * 1000))
    frames = []
    for panel in dashboard["panels"]:
        query = {
            **panel["targets"][0],
            "intervalMs": 15000,
            "maxDataPoints": 100,
            "format": "time_series",
        }
        response = grafana_request(
            "/api/ds/query", {"queries": [query], "from": query_start, "to": query_end}
        )
        result = response.get("results", {}).get("A", {})
        if result.get("error") or not result.get("frames"):
            raise RuntimeError("Restored dashboard query returned no data")
        data = [frame.get("data", {}).get("values") for frame in result["frames"]]
        if not data or not any(values and values[0] for values in data):
            raise RuntimeError("Restored dashboard query returned empty frames")
        frames.append(data)
    if len(frames) != 2 or frames[0] != frames[1]:
        raise RuntimeError("Authenticated query differs from direct Prometheus query")
    datasource = grafana_request("/api/datasources/uid/" + fixture["uid"])
    if not datasource.get("secureJsonFields", {}).get("basicAuthPassword"):
        raise RuntimeError("Restored datasource has no encrypted password")
    # Independent negative controls against the exact endpoint Grafana just used.
    control_script = """import base64,json,urllib.request,urllib.error,sys
url=sys.argv[1]+"/api/v1/query?query=up"
statuses=[]
for auth in [None,"Basic "+base64.b64encode(b"proof:definitely-wrong").decode()]:
 req=urllib.request.Request(url,headers={"Authorization":auth} if auth else {})
 try:
  with urllib.request.urlopen(req,timeout=5) as r: statuses.append(r.status)
 except urllib.error.HTTPError as e: statuses.append(e.code)
print(json.dumps(statuses))
"""
    statuses = json.loads(
        run(
            "docker",
            "run",
            "--rm",
            "--label",
            "sg-backup-proof=" + proof,
            "--network",
            project + "_proof",
            fixture["image"],
            "python3",
            "-c",
            control_script,
            datasource["url"],
        )
    )
    if statuses != [401, 401]:
        raise RuntimeError("Authenticated endpoint did not reject invalid credentials")
    plugins = []
    for path in sorted((restored / "state").glob("*/plugins/*/plugin.json")):
        plugin = json.loads(path.read_text())
        plugin_id = plugin["id"]
        settings = grafana_request("/api/plugins/" + plugin_id + "/settings")
        if (
            settings.get("id") != plugin_id
            or settings.get("info", {}).get("version") != plugin["info"]["version"]
        ):
            raise RuntimeError("Restored plugin registration or version differs")
        module = grafana_request(
            "/public/plugins/" + plugin_id + "/module.js", raw=True
        )
        expected = (path.parent / "module.js").read_bytes()
        if hashlib.sha256(module).digest() != hashlib.sha256(expected).digest():
            raise RuntimeError("Restored plugin frontend module differs")
        plugins.append(
            {
                "id": plugin_id,
                "name": plugin["name"],
                "version": plugin["info"]["version"],
                "registered": True,
                "moduleServed": True,
                "behavior": None,
            }
        )
    return {
        "dashboard": {
            "uid": fixture["uid"],
            "panels": len(dashboard["panels"]),
            "queriesVerified": len(frames),
        },
        "credential": {
            "authenticatedQuery": True,
            "unauthenticatedRejected": True,
            "wrongPasswordRejected": True,
        },
        "plugins": plugins,
        "checkedAt": time.time(),
    }


def verify_browser(run, fixture, proof, project, directory, restored, auth):
    config = directory / "browser-bridge.json"
    config.write_text(json.dumps({"upstream": "http://app:3000"}))
    config.chmod(0o600)
    name = "sg-browser-" + proof
    # Only this forwarding helper joins both networks. The restored application
    # retains its internal-only network and cannot send alerts to external hosts.
    run(
        "docker",
        "create",
        "--name",
        name,
        "--label",
        "sg-backup-proof=" + proof,
        "--network",
        "bridge",
        "-p",
        "127.0.0.1::8080",
        "--memory",
        "256m",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "-v",
        str(Path(__file__).with_name("fixture-http.py").resolve()) + ":/server.py:ro",
        "-v",
        str(config) + ":/config.json:ro",
        fixture["image"],
        "python3",
        "/server.py",
        "/config.json",
    )
    run("docker", "network", "connect", project + "_proof", name)
    run("docker", "start", name)
    meta = json.loads(run("docker", "inspect", name))[0]
    binding = meta["NetworkSettings"]["Ports"]["8080/tcp"][0]
    if binding["HostIp"] != "127.0.0.1":
        raise RuntimeError("Browser helper must bind loopback only")
    plugins = []
    for path in sorted((restored / "state").glob("*/plugins/*/plugin.json")):
        data = json.loads(path.read_text())
        pages = [item for item in data.get("includes", []) if item["type"] == "page"]
        if pages:
            plugins.append({"id": data["id"], "path": pages[0]["path"]})
    output = json.loads(
        run(
            "node",
            str(Path(__file__).with_name("verify-grafana-browser.mjs")),
            input=json.dumps(
                {
                    "url": "http://127.0.0.1:" + binding["HostPort"],
                    "auth": auth,
                    "uid": fixture["uid"],
                    "directory": str(directory),
                    "plugins": plugins,
                }
            ).encode(),
            timeout=300,
        )
    )
    return output


def verify_postgres_plugin(run, proof, project, directory, grafana_request):
    """Exercise the restored external PostgreSQL plugin against real test rows.

    This checks the recovered plugin binary, not recovery of this disposable
    PostgreSQL database (the separate Todo proof covers PostgreSQL recovery).
    """
    password = secrets.token_urlsafe(32)
    env_file = directory / "postgres-plugin.env"
    env_file.write_text("POSTGRES_PASSWORD=" + password + "\n")
    env_file.chmod(0o600)
    name = "sg-plugin-pg-" + proof
    run(
        "docker",
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "sg-backup-proof=" + proof,
        "--network",
        project + "_proof",
        "--network-alias",
        "plugin-postgres",
        "--env-file",
        str(env_file),
        "--memory",
        "256m",
        "--cpus",
        "1",
        "--tmpfs",
        "/var/lib/postgresql/data:rw,size=128m",
        "postgres:16-alpine",
    )
    for attempt in range(30):
        try:
            run(
                "docker",
                "exec",
                name,
                "pg_isready",
                "-h",
                "127.0.0.1",
                "-U",
                "postgres",
            )
            break
        except RuntimeError:
            if attempt == 29:
                raise
            time.sleep(1)
    run(
        "docker",
        "exec",
        "-i",
        name,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        input=b"CREATE TABLE restore_plugin_test(label text, value integer); INSERT INTO restore_plugin_test VALUES ('restored plugin',42),('second row',84);",
    )
    uid = "sg-plugin-pg-" + proof[:12]
    grafana_request(
        "/api/datasources",
        {
            "uid": uid,
            "name": "Restored PostgreSQL plugin test",
            "type": "grafana-postgresql-datasource",
            "access": "proxy",
            "url": "plugin-postgres:5432",
            "user": "postgres",
            "jsonData": {
                "database": "postgres",
                "sslmode": "disable",
                "postgresVersion": 1600,
            },
            "secureJsonData": {"password": password},
        },
    )
    health = grafana_request("/api/datasources/uid/" + uid + "/health")
    if health.get("status") != "OK":
        raise RuntimeError(
            "Restored PostgreSQL plugin failed its database health check"
        )
    response = grafana_request(
        "/api/ds/query",
        {
            "from": "0",
            "to": "1000",
            "queries": [
                {
                    "refId": "A",
                    "datasource": {"type": "grafana-postgresql-datasource", "uid": uid},
                    "rawSql": "SELECT label,value FROM restore_plugin_test ORDER BY value",
                    "format": "table",
                }
            ],
        },
    )
    result = response.get("results", {}).get("A", {})
    values = [frame.get("data", {}).get("values") for frame in result.get("frames", [])]
    if result.get("error") or values != [[["restored plugin", "second row"], [42, 84]]]:
        raise RuntimeError("Restored PostgreSQL plugin did not return the test rows")
    return {"rowsVerified": 2, "healthVerified": True}


def cleanup(run, ssh, deployment_id, fixture):
    failures = []
    for kind, path in [
        ("dashboard", "/api/dashboards/uid/"),
        ("datasource", "/api/datasources/uid/"),
    ]:
        if fixture.get(kind + "Attempted"):
            try:
                source_api(run, ssh, deployment_id, "DELETE", path + fixture["uid"])
                # A successful delete alone is not the verification.
                try:
                    source_api(run, ssh, deployment_id, "GET", path + fixture["uid"])
                except RuntimeError as error:
                    if not str(error).endswith("HTTP 404"):
                        raise
                else:
                    raise RuntimeError("Fixture record remains after deletion")
            except RuntimeError:
                failures.append(kind)
    if fixture.get("container"):
        try:
            run(*ssh, "docker rm -f " + shlex.quote(fixture["container"]))
        except RuntimeError:
            # May not have been created if preflight failed.
            remaining = run(
                *ssh, "docker ps -aq --filter name=^/" + fixture["container"] + "$"
            ).strip()
            if remaining:
                failures.append("container")
    if fixture.get("remoteDir"):
        run(*ssh, "rm -rf -- " + shlex.quote(fixture["remoteDir"]))
    if failures:
        raise RuntimeError(
            "Source fixture cleanup requires attention: " + ", ".join(failures)
        )
