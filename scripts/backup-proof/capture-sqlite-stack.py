"""Run on the source host under a transient systemd unit with ExecStopPost.

Only supports the two inspected image-based reference stacks. Captures a
quiesced whole volume, including SQLite WAL through SQLite's backup API.
"""

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import time
import uuid
from contextlib import closing
from pathlib import Path


def command(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE, timeout=90)


def sqlite_evidence(path):
    database = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        if database.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise RuntimeError("SQLite integrity check failed")
        if database.execute("PRAGMA foreign_key_check").fetchone():
            raise RuntimeError("SQLite foreign-key check failed")
        evidence = {}
        schema = database.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"
        ).fetchall()
        evidence["schemaSha256"] = hashlib.sha256(
            json.dumps(schema).encode()
        ).hexdigest()
        evidence["tables"] = {}
        for (name,) in database.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ):
            rows = database.execute(
                'SELECT * FROM "' + name.replace('"', '""') + '"'
            ).fetchall()
            encoded = sorted(
                json.dumps(
                    row,
                    default=lambda blob: {"blob": blob.hex()},
                    separators=(",", ":"),
                )
                for row in rows
            )
            evidence["tables"][name] = {
                "rows": len(rows),
                "sha256": hashlib.sha256("\n".join(encoded).encode()).hexdigest(),
            }
        return evidence
    finally:
        database.close()


def table_hash(path, table, ignored_columns=()):
    with closing(sqlite3.connect(f"file:{path}?mode=ro", uri=True)) as database:
        columns = [
            row[1]
            for row in database.execute(
                'PRAGMA table_info("' + table.replace('"', '""') + '")'
            )
            if row[1] not in ignored_columns
        ]
        if not columns:
            raise RuntimeError("Missing business table")
        names = ",".join('"' + name.replace('"', '""') + '"' for name in columns)
        rows = database.execute(
            "SELECT " + names + ' FROM "' + table.replace('"', '""') + '"'
        ).fetchall()
        encoded = sorted(
            json.dumps(
                row, default=lambda blob: {"blob": blob.hex()}, separators=(",", ":")
            )
            for row in rows
        )
        return hashlib.sha256("\n".join(encoded).encode()).hexdigest()


def inventory(root):
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise RuntimeError("Unsupported link or special file in backup")
        if path.is_file():
            with path.open("rb") as stream:
                result[str(path.relative_to(root))] = hashlib.file_digest(
                    stream, "sha256"
                ).hexdigest()
    return result


def capture(deployment_id, proof_id):
    uuid.UUID(deployment_id)
    uuid.UUID(proof_id)
    root = Path("/opt/server-guy") / deployment_id
    output = Path("/var/tmp") / ("server-guy-proof-" + proof_id)
    output.mkdir(mode=0o700)
    stage = output / "snapshot"
    stage.mkdir(mode=0o700)
    compose = json.loads((root / "compose.json").read_text())
    services = compose["services"]
    if set(services) not in [{"app"}, {"app", "prometheus"}]:
        raise RuntimeError("Unsupported stack")
    is_grafana = services["app"]["image"].startswith("grafana/grafana@sha256:")
    if not is_grafana and not services["app"]["image"].startswith(
        "louislam/uptime-kuma@sha256:"
    ):
        raise RuntimeError("Unsupported application image")
    project = "sg-" + deployment_id[:8]
    ids = (
        command(
            "docker",
            "compose",
            "-p",
            project,
            "-f",
            str(root / "compose.json"),
            "ps",
            "-q",
        )
        .decode()
        .split()
    )
    containers = json.loads(command("docker", "inspect", *ids))
    if len(containers) != len(services) or not all(
        c["State"]["Running"] for c in containers
    ):
        raise RuntimeError("All source services must be running")
    manifest = {
        "deploymentId": deployment_id,
        "proofId": proof_id,
        "kind": "grafana" if is_grafana else "kuma",
        "images": {},
        "volumes": {},
        "bindings": {},
        "sqlite": {},
        "method": "quiesced complete volumes with SQLite backup API",
        "startedAt": time.time(),
    }
    for c in containers:
        service = c["Config"]["Labels"]["com.docker.compose.service"]
        if c["Config"]["Image"] != services[service]["image"]:
            raise RuntimeError("Running image differs from accepted Compose definition")
        manifest["images"][service] = c["Config"]["Image"]
        for mount in c["Mounts"]:
            if mount["Type"] == "volume":
                prefix = project + "_"
                if not mount["Name"].startswith(prefix):
                    raise RuntimeError("Unexpected source volume owner")
                name = mount["Name"][len(prefix) :]
                manifest["volumes"][name] = {
                    "service": service,
                    "target": mount["Destination"],
                    "source": mount["Source"],
                }
            elif mount["Type"] == "bind":
                path = Path(mount["Source"])
                if (
                    not path.is_relative_to(root)
                    or path.is_symlink()
                    or not path.is_file()
                ):
                    raise RuntimeError("Unsupported configuration mount")
                manifest["bindings"][mount["Destination"]] = str(path.relative_to(root))
            else:
                raise RuntimeError("Unsupported mount type")
    if is_grafana:
        prom = next(
            c
            for c in containers
            if c["Config"]["Labels"]["com.docker.compose.service"] == "prometheus"
        )
        end = int(time.time()) - 30
        query = f"/api/v1/query_range?query=up&start={end - 300}&end={end}&step=15"
        data = json.loads(
            command(
                "docker",
                "exec",
                prom["Id"],
                "wget",
                "-qO-",
                "http://127.0.0.1:9090" + query,
            )
        )
        if data.get("status") != "success" or not data["data"]["result"]:
            raise RuntimeError("No historical Prometheus samples to prove recovery")
        manifest["prometheus"] = {"query": query, "expected": data["data"]}
    stopped = False
    try:
        # ExecStopPost on the owning systemd unit also restarts these containers
        # if this process dies or the controller disconnects.
        manifest["stopStartedAt"] = time.time()
        stopped = True
        command("docker", "stop", "--time", "30", *ids)
        states = json.loads(command("docker", "inspect", *ids))
        if any(c["State"]["Running"] or c["State"]["ExitCode"] != 0 for c in states):
            raise RuntimeError("A service failed to stop cleanly")
        (stage / "configuration").mkdir()
        shutil.copy2(root / "compose.json", stage / "configuration/compose.json")
        for relative in manifest["bindings"].values():
            target = stage / "configuration" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / relative, target)
        for name, volume in manifest["volumes"].items():
            source = Path(volume["source"])
            # Inspect first: do not follow an application-controlled symlink.
            inventory(source)
            target = stage / "state" / name
            database_name = (
                ("grafana.db" if is_grafana else "kuma.db")
                if volume["service"] == "app"
                else None
            )
            excluded = (
                {
                    database_name,
                    database_name + "-wal",
                    database_name + "-shm",
                    database_name + "-journal",
                }
                if database_name
                else set()
            )
            shutil.copytree(
                source,
                target,
                ignore=lambda path, names, excluded=excluded, source=source: (
                    excluded if Path(path) == source else set()
                ),
            )
            if database_name:
                source_db = source / database_name
                expected = sqlite_evidence(source_db)
                source_connection = sqlite3.connect(
                    f"file:{source_db}?mode=ro", uri=True
                )
                target_connection = sqlite3.connect(target / database_name)
                try:
                    source_connection.backup(target_connection, pages=256)
                finally:
                    target_connection.close()
                    source_connection.close()
                shutil.copystat(source_db, target / database_name)
                stat = source_db.stat()
                os.chown(target / database_name, stat.st_uid, stat.st_gid)
                if sqlite_evidence(target / database_name) != expected:
                    raise RuntimeError("SQLite snapshot differs from quiesced source")
                manifest["sqlite"][name + "/" + database_name] = expected
            # copytree does not retain numeric ownership; restore the source IDs.
            for path in [source, *source.rglob("*")]:
                dest = target / path.relative_to(source)
                if dest.exists():
                    stat = path.stat()
                    os.chown(dest, stat.st_uid, stat.st_gid)
        manifest["capturedAt"] = time.time()
    finally:
        if stopped:
            command("docker", "start", *ids)
            manifest["restartedAt"] = time.time()
            states = json.loads(command("docker", "inspect", *ids))
            if not all(c["State"]["Running"] for c in states):
                raise RuntimeError("A source service needs recovery")
    manifest["files"] = inventory(stage)
    (stage / "manifest.json").write_text(json.dumps(manifest, indent=2))
    with tarfile.open(output / "stack.tar.gz", "w:gz") as archive:
        for child in sorted(stage.iterdir()):
            archive.add(child, arcname=child.name)
    print(
        json.dumps(
            {
                "path": str(output / "stack.tar.gz"),
                "bytes": (output / "stack.tar.gz").stat().st_size,
                "sha256": hashlib.file_digest(
                    (output / "stack.tar.gz").open("rb"), "sha256"
                ).hexdigest(),
                "pauseSeconds": manifest["restartedAt"] - manifest["stopStartedAt"],
            }
        )
    )


if __name__ == "__main__":
    capture(sys.argv[1], sys.argv[2])
