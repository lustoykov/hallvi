"""R2 whole-stack recovery proof for the inspected Kuma and Grafana deployments.

Usage: python3 scripts/backup-proof/prove-sqlite-stack.py APP_UUID ACCOUNT BUCKET
Briefly pauses the source; restores into new local volumes on an internal network.
"""

import base64
import hashlib
import importlib.util
import ipaddress
import json
import os
import re
import shlex
import signal
import sqlite3
import subprocess
import sys
import tarfile
import time
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "capture", Path(__file__).with_name("capture-sqlite-stack.py")
)
capture_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture_module)
functional_spec = importlib.util.spec_from_file_location(
    "grafana_functional", Path(__file__).with_name("grafana-functional.py")
)
functional_module = importlib.util.module_from_spec(functional_spec)
functional_spec.loader.exec_module(functional_module)


def run(*args, input=None, timeout=180):
    result = subprocess.run(
        args, input=input, capture_output=True, timeout=timeout, check=False
    )
    if result.returncode:
        # Keep potential secrets and application rows out of terminal output.
        raise RuntimeError(f"{args[0]} failed with exit {result.returncode}")
    return result.stdout


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def finish_cleanup(receipt, tasks):
    """Attempt every cleanup; its result must never rewrite restore evidence."""
    for field, operation in tasks:
        try:
            operation()
            receipt[field] = True
        except (OSError, RuntimeError, subprocess.SubprocessError, ValueError):
            receipt[field] = False


def safe_extract(archive, destination):
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        for member in members:
            path = Path(member.name)
            if (
                path.is_absolute()
                or ".." in path.parts
                or not (member.isfile() or member.isdir())
            ):
                raise RuntimeError("Unsafe member in backup archive")
            if path.parts[0] not in {"state", "configuration", "manifest.json"}:
                raise RuntimeError("Unexpected archive root")
        bundle.extractall(destination, filter="data")


def main():
    app, account, bucket = sys.argv[1:]
    uuid.UUID(app)
    if not re.fullmatch(r"[a-f0-9]{32}", account) or not re.fullmatch(
        r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket
    ):
        raise RuntimeError("Invalid destination")
    runtime = Path(os.environ.get("HALLVI_CONFIG_DIR", ".hallvi")).resolve()
    db_path = Path(
        os.environ.get("HALLVI_DB_PATH", ".hallvi/hallvi.db")
    ).resolve()
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        if db.execute(
            "SELECT id FROM application_operations WHERE application_id=? AND state='working'",
            (app,),
        ).fetchone():
            raise RuntimeError(
                "Wait for the active application operation before a backup proof"
            )
        row = db.execute(
            "SELECT body FROM deployments WHERE application_id=?", (app,)
        ).fetchone()
        deployment = json.loads(row[0])
    finally:
        db.close()
    if deployment["status"] != "live" or not deployment["plan"]["image"]:
        raise RuntimeError("Expected a live image-based deployment")
    deployment_id = str(uuid.UUID(deployment["id"]))
    ipaddress.IPv4Address(deployment["address"])
    proof = str(uuid.uuid4())
    directory = runtime / "backup-proofs" / proof
    directory.mkdir(mode=0o700, parents=True)
    receipt = {
        "proofId": proof,
        "applicationId": app,
        "deploymentId": deployment_id,
        "revision": deployment["revision"],
        "status": "running",
        "phase": "preflight",
        "offHostVerified": False,
        "scheduleConfigured": False,
        "restoreProject": "sg-proof-" + proof,
        "localArtifactsRetained": str(directory),
        "remoteObjectsRetained": False,
        "retentionPolicyConfigured": False,
        "containsLiveCredentials": True,
        "startedAt": time.time(),
        "destination": {"account": account, "bucket": bucket},
    }

    def save():
        path = directory / "receipt.json"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(receipt, indent=2) + "\n")
        temporary.chmod(0o600)
        temporary.replace(path)

    def phase(value):
        receipt["phase"] = value
        save()

    identity = runtime / "deployments" / deployment_id
    ssh = [
        "ssh",
        "-i",
        str(identity / "client"),
        "-o",
        "UserKnownHostsFile=" + str(identity / "known_hosts"),
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "ConnectTimeout=10",
        "root@" + deployment["address"],
    ]
    project = "sg-proof-" + proof
    remote_dir = "/var/tmp/hallvi-proof-" + proof
    remote_script = "/var/tmp/sg-capture-" + proof + ".py"
    restore_compose = directory / "restore-compose.json"
    compose = ["docker", "compose", "-p", project, "-f", str(restore_compose)]
    created = False
    functional_fixture = {}
    os.environ["CLOUDFLARE_ACCOUNT_ID"] = account
    wrangler = ["npx", "--yes", "wrangler@4.130.0", "r2", "object"]
    object_prefix = f"applications/{app}/{proof}"
    receipt["destination"]["objectPrefix"] = object_prefix
    save()
    lock_path = runtime / ("backup-proof-" + app + ".lock")
    with lock_path.open("x") as lock:
        json.dump({"proofId": proof, "pid": os.getpid()}, lock)
    try:
        receipt["sourceHostKey"] = (
            run("ssh-keygen", "-lf", str(identity / "known_hosts")).decode().strip()
        )
        receipt["privateBucketCheck"] = json.loads(
            run(
                "node",
                str(Path(__file__).with_name("check-r2-private.mjs")),
                account,
                bucket,
            )
        )
        # Require images to be installed before any source interruption.
        images = [deployment["plan"]["image"]] + [
            s["image"] for s in deployment["plan"].get("services", [])
        ]
        for image in images:
            platform = (
                run(
                    "docker",
                    "image",
                    "inspect",
                    "--format",
                    "{{.Os}}/{{.Architecture}}",
                    image,
                )
                .decode()
                .strip()
            )
            if platform != "linux/amd64":
                raise RuntimeError("Restore requires the source linux/amd64 image")
        run("docker", "image", "inspect", "alpine:3.20")
        if os.environ.get("SG_GRAFANA_FUNCTIONAL") == "1":
            if not deployment["plan"]["image"].startswith("grafana/grafana@sha256:"):
                raise RuntimeError(
                    "Functional fixtures require the Grafana reference stack"
                )
            run("docker", "image", "inspect", "postgres:16-alpine")
            phase("prepare-functional-fixtures")
            functional_module.setup(
                run, ssh, deployment_id, proof, directory, functional_fixture
            )
        source_compose = f"docker compose -p sg-{deployment_id[:8]} -f /opt/hallvi/{deployment_id}/compose.json"
        ids = run(*ssh, source_compose + " ps -q").decode().split()
        if not ids or not all(re.fullmatch(r"[a-f0-9]{64}", value) for value in ids):
            raise RuntimeError("Source containers unavailable")
        phase("capture-source")
        run(
            *ssh,
            f"umask 077; set -C; cat > {remote_script}",
            input=Path(__file__).with_name("capture-sqlite-stack.py").read_bytes(),
        )
        restart = "ExecStopPost=/usr/bin/docker start " + " ".join(ids)
        args = [
            "systemd-run",
            "--unit=sg-proof-" + proof,
            "--collect",
            "--wait",
            "--pipe",
            "--property=RuntimeMaxSec=180",
            "--property=" + restart,
            "python3",
            remote_script,
            deployment_id,
            proof,
        ]
        output = run(*ssh, shlex.join(args), timeout=210)
        capture = next(
            json.loads(line)
            for line in output.decode().splitlines()
            if line.startswith('{"path":')
        )
        receipt["sourceCapture"] = capture
        receipt["sourceContainers"] = ids
        phase("retrieve-source")
        archive = directory / "stack.tar.gz"
        with archive.open("wb") as target:
            transfer = subprocess.run(
                [*ssh, "cat " + shlex.quote(capture["path"])],
                stdout=target,
                check=False,
                stderr=subprocess.PIPE,
                timeout=180,
            )
        archive.chmod(0o600)
        if (
            transfer.returncode
            or archive.stat().st_size != capture["bytes"]
            or sha(archive) != capture["sha256"]
        ):
            raise RuntimeError("Source archive transfer did not verify")
        receipt["uploadAttempted"] = True
        phase("upload")
        run(
            *wrangler,
            "put",
            bucket + "/" + object_prefix + "/stack.tar.gz",
            "--file",
            str(archive),
            "--remote",
        )
        receipt["uploadedAt"] = time.time()
        receipt["remoteObjectsRetained"] = True
        phase("download-verify")
        downloaded = directory / "downloaded.tar.gz"
        run(
            *wrangler,
            "get",
            bucket + "/" + object_prefix + "/stack.tar.gz",
            "--file",
            str(downloaded),
            "--remote",
        )
        if downloaded.stat().st_size != archive.stat().st_size or sha(
            downloaded
        ) != sha(archive):
            raise RuntimeError("R2 download checksum mismatch")
        receipt["offHostVerified"] = True
        receipt["archiveSha256"] = sha(downloaded)
        receipt["archiveBytes"] = downloaded.stat().st_size
        restored = directory / "inspected"
        safe_extract(downloaded, restored)
        manifest = json.loads((restored / "manifest.json").read_text())
        if manifest["proofId"] != proof or manifest["deploymentId"] != deployment_id:
            raise RuntimeError("Backup identity mismatch")
        receipt["recoveryPointStartedAt"] = manifest["stopStartedAt"]
        for name, expected in manifest["files"].items():
            if sha(restored / name) != expected:
                raise RuntimeError("Restored file inventory mismatch")
        for name, expected in manifest["sqlite"].items():
            if capture_module.sqlite_evidence(restored / "state" / name) != expected:
                raise RuntimeError("Restored SQLite schema or rows differ")
        app_volume = next(
            name
            for name, value in manifest["volumes"].items()
            if value["service"] == "app"
        )
        original_app_db = (
            restored
            / "state"
            / app_volume
            / ("grafana.db" if manifest["kind"] == "grafana" else "kuma.db")
        )
        receipt["sqlite"] = {
            name: {
                "tableCount": len(value["tables"]),
                "rowCount": sum(t["rows"] for t in value["tables"].values()),
            }
            for name, value in manifest["sqlite"].items()
        }
        receipt["verifiedFiles"] = len(manifest["files"])
        receipt["sourcePauseSeconds"] = capture["pauseSeconds"]
        phase("restore-applications")
        definition = json.loads((restored / "configuration/compose.json").read_text())
        definition["networks"] = {"proof": {"internal": True}}
        definition["volumes"] = {name: {} for name in manifest["volumes"]}
        for name, service in definition["services"].items():
            service["platform"] = "linux/amd64"
            service["restart"] = "no"
            service["labels"] = {"sg-backup-proof": proof}
            service["networks"] = ["proof"]
            service.pop("container_name", None)
            service["ports"] = []
            mounts = []
            for volume, meta in manifest["volumes"].items():
                if meta["service"] == name:
                    mounts.append(volume + ":" + meta["target"])
            for target, relative in manifest["bindings"].items():
                if any(
                    target == str(m).split(":")[1] for m in service.get("volumes", [])
                ):
                    mounts.append(
                        str(restored / "configuration" / relative)
                        + ":"
                        + target
                        + ":ro"
                    )
            service["volumes"] = mounts
        restore_compose.write_text(json.dumps(definition, indent=2))
        restore_compose.chmod(0o600)
        created = True
        run(*compose, "create", "--pull", "never")
        for volume in manifest["volumes"]:
            physical = project + "_" + volume
            # A fresh Compose-owned volume, never a source volume.
            meta = json.loads(run("docker", "volume", "inspect", physical))[0]
            if meta["Labels"].get("com.docker.compose.project") != project:
                raise RuntimeError("Restore volume ownership mismatch")
            run(
                "docker",
                "run",
                "--rm",
                "--label",
                "sg-backup-proof=" + proof,
                "--network",
                "none",
                "-v",
                str(downloaded) + ":/source/archive:ro",
                "-v",
                physical + ":/target",
                "alpine:3.20",
                "sh",
                "-ec",
                'mkdir /stage; tar -xzf /source/archive -C /stage "state/$1"; cp -a "/stage/state/$1/." /target/',
                "sh",
                volume,
            )
        run(*compose, "start")
        if functional_fixture:
            functional_module.start_restore_fixture(
                run, functional_fixture, proof, project, directory
            )
        endpoints = {}
        for name in definition["services"]:
            port = (
                9090
                if name == "prometheus"
                else (3000 if manifest["kind"] == "grafana" else 3001)
            )
            endpoints[name] = f"http://{name}:{port}"

        def get(url):
            return run(
                "docker",
                "run",
                "--rm",
                "--label",
                "sg-backup-proof=" + proof,
                "--network",
                project + "_proof",
                "alpine:3.20",
                "wget",
                "-T",
                "3",
                "-qO-",
                url,
                timeout=15,
            )

        for name, endpoint in endpoints.items():
            health = (
                "/-/ready"
                if name == "prometheus"
                else ("/api/health" if manifest["kind"] == "grafana" else "/")
            )
            for attempt in range(90):
                try:
                    body = get(endpoint + health)
                    if (
                        name == "app"
                        and manifest["kind"] == "grafana"
                        and json.loads(body).get("database") != "ok"
                    ):
                        raise RuntimeError("Restored Grafana database unhealthy")
                    break
                except (OSError, RuntimeError, subprocess.SubprocessError, ValueError):
                    if attempt == 89:
                        raise RuntimeError("Restored service did not become healthy")
                    time.sleep(1)
        receipt["healthyServices"] = sorted(endpoints)
        if "prometheus" in endpoints:
            actual = json.loads(
                get(endpoints["prometheus"] + manifest["prometheus"]["query"])
            )
            if (
                actual.get("status") != "success"
                or actual["data"] != manifest["prometheus"]["expected"]
            ):
                raise RuntimeError("Historical Prometheus samples differ after restore")
            receipt["prometheusSamplesVerified"] = sum(
                len(s["values"]) for s in actual["data"]["result"]
            )
        if manifest["kind"] == "grafana":
            env = definition["services"]["app"].get("environment", {})
            if isinstance(env, list):
                env = dict(item.split("=", 1) for item in env)
            auth = base64.b64encode(
                (
                    env["GF_SECURITY_ADMIN_USER"]
                    + ":"
                    + env["GF_SECURITY_ADMIN_PASSWORD"]
                ).encode()
            ).decode()

            def grafana_get(path, body=None, raw=False):
                script = 'IFS= read -r auth; wget -T 15 -qO- --header "$auth" "$1"'
                payload = ("Authorization: Basic " + auth + "\n").encode()
                if body is not None:
                    script = 'IFS= read -r auth; cat > /tmp/body; wget -T 15 -qO- --header "$auth" --header "Content-Type: application/json" --post-file /tmp/body "$1"'
                    payload += json.dumps(body).encode()
                response = run(
                    "docker",
                    "run",
                    "--rm",
                    "--label",
                    "sg-backup-proof=" + proof,
                    "-i",
                    "--network",
                    project + "_proof",
                    "alpine:3.20",
                    "sh",
                    "-ec",
                    script,
                    "sh",
                    "http://app:3000" + path,
                    input=payload,
                )
                return response if raw else json.loads(response)

            source_db = sqlite3.connect(f"file:{original_app_db}?mode=ro", uri=True)
            try:
                expected_sources = source_db.execute(
                    "SELECT uid,name,type,url FROM data_source ORDER BY uid"
                ).fetchall()
            finally:
                source_db.close()
            sources = grafana_get("/api/datasources")
            actual_sources = sorted(
                (d["uid"], d["name"], d["type"], d["url"]) for d in sources
            )
            if actual_sources != expected_sources or not sources:
                raise RuntimeError("Grafana API datasource configuration differs")
            for datasource in sources:
                health = grafana_get(
                    "/api/datasources/uid/" + datasource["uid"] + "/health"
                )
                if health.get("status") != "OK":
                    raise RuntimeError(
                        "Restored Grafana datasource cannot query restored Prometheus"
                    )
            receipt["grafanaDatasourceHealthVerified"] = len(sources)
            receipt["credentialCoverage"] = (
                "Keys and configuration preserved; fixture datasource has no configured password"
            )
            if functional_fixture:
                phase("verify-grafana-features")
                receipt["grafanaFunctionalChecks"] = functional_module.verify(
                    run,
                    functional_fixture,
                    proof,
                    project,
                    restored,
                    grafana_get,
                    manifest,
                )
                browser = functional_module.verify_browser(
                    run, functional_fixture, proof, project, directory, restored, auth
                )
                receipt["grafanaFunctionalChecks"]["dashboard"]["renderedCharts"] = (
                    browser["dashboardCanvases"]
                )
                receipt["grafanaFunctionalChecks"]["dashboard"]["browserRendered"] = (
                    browser["dashboardCanvases"]
                    >= receipt["grafanaFunctionalChecks"]["dashboard"]["panels"]
                )
                receipt["grafanaFunctionalChecks"]["postgresPlugin"] = (
                    functional_module.verify_postgres_plugin(
                        run, proof, project, directory, grafana_get
                    )
                )
                receipt["grafanaFunctionalChecks"]["pluginPagesOpened"] = [
                    page["id"] for page in browser["pages"]
                ]
                for plugin in receipt["grafanaFunctionalChecks"]["plugins"]:
                    page = next(
                        (p for p in browser["pages"] if p["id"] == plugin["id"]), None
                    )
                    if page:
                        plugin.update(
                            {
                                key: page[key]
                                for key in ("behavior", "uiState", "browserErrors")
                            }
                        )
                    if plugin["id"] == "grafana-postgresql-datasource":
                        plugin["behavior"] = "postgresql-query"
                        plugin["uiState"] = "working"
                receipt["credentialCoverage"] = (
                    "Recovered encrypted password queried authenticated Prometheus; missing and wrong credentials rejected"
                )
        # Verify important application records again in the database mounted by
        # the running restored application, not merely the unpacked archive.
        app_id = run(*compose, "ps", "-q", "app").decode().strip()
        meta = next(v for v in manifest["volumes"].values() if v["service"] == "app")
        db_name = "grafana.db" if manifest["kind"] == "grafana" else "kuma.db"
        mounted_db = directory / "booted.db"
        # Quiesce the disposable app for this final inspection only.
        run(*compose, "stop", "--timeout", "30", "app")
        stopped = json.loads(run("docker", "inspect", app_id))[0]["State"]
        if stopped["Running"] or stopped["ExitCode"] != 0:
            raise RuntimeError(
                "Restored application did not stop cleanly for inspection"
            )
        # Refuse a main-file-only inspection when committed WAL data remains.
        run(
            "docker",
            "run",
            "--rm",
            "--label",
            "sg-backup-proof=" + proof,
            "--network",
            "none",
            "-v",
            project + "_" + app_volume + ":/state:ro",
            "alpine:3.20",
            "sh",
            "-ec",
            'test ! -s "/state/$1-wal"',
            "sh",
            db_name,
        )
        receipt["postBootInspection"] = "Clean exit; no nonempty WAL sidecar"
        run(
            "docker",
            "cp",
            app_id + ":" + meta["target"] + "/" + db_name,
            str(mounted_db),
        )
        after_boot = capture_module.sqlite_evidence(mounted_db)
        expected = next(iter(manifest["sqlite"].values()))
        business_tables = (
            ["user", "org", "data_keys"]
            if manifest["kind"] == "grafana"
            else ["user", "monitor", "setting"]
        )
        for table in business_tables:
            if manifest["kind"] == "grafana" and table == "user":
                original_db = original_app_db
                matches = capture_module.table_hash(
                    original_db, table, {"last_seen_at"}
                ) == capture_module.table_hash(mounted_db, table, {"last_seen_at"})
            else:
                matches = after_boot["tables"][table] == expected["tables"][table]
            if not matches:
                raise RuntimeError(
                    "Application boot changed recovered business records: " + table
                )
        receipt["businessTablesVerifiedAfterBoot"] = business_tables
        if manifest["kind"] == "grafana":
            receipt["provisioningNote"] = (
                "All SQLite rows matched before boot. API authentication updates user.last_seen_at. Provisioning updates datasource timestamps and re-encrypts its empty secret payload; datasource semantics and health were checked through the API after boot."
            )
        receipt["status"] = "verified"
        receipt["phase"] = "complete"
    except BaseException as error:
        receipt["status"] = "failed"
        receipt["error"] = (
            str(error) if isinstance(error, RuntimeError) else type(error).__name__
        )
        raise
    finally:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        tasks = []
        if functional_fixture:
            tasks.append(
                (
                    "sourceFixturesRemoved",
                    lambda: functional_module.cleanup(
                        run, ssh, deployment_id, functional_fixture
                    ),
                )
            )
        if created:

            def remove_restore():
                helpers = (
                    run(
                        "docker",
                        "ps",
                        "-aq",
                        "--filter",
                        "label=sg-backup-proof=" + proof,
                    )
                    .decode()
                    .split()
                )
                if helpers:
                    run("docker", "rm", "--force", *helpers)
                run(*compose, "down", "--volumes", "--remove-orphans")

            tasks.append(("restoreResourcesRemoved", remove_restore))
        tasks.append(
            (
                "sourceStagingRemoved",
                lambda: run(
                    *ssh,
                    "rm -rf -- "
                    + shlex.quote(remote_dir)
                    + " "
                    + shlex.quote(remote_script),
                ),
            )
        )
        finish_cleanup(receipt, tasks)
        receipt["remoteObjectsMayExist"] = bool(receipt.get("uploadAttempted"))
        receipt["finishedAt"] = time.time()
        save()
        lock_path.unlink()
        print("Proof receipt:", directory / "receipt.json")
    run(
        *wrangler,
        "put",
        bucket + "/" + object_prefix + "/receipt.json",
        "--file",
        str(directory / "receipt.json"),
        "--remote",
    )
    if any(
        receipt.get(key) is False
        for key in (
            "sourceFixturesRemoved",
            "restoreResourcesRemoved",
            "sourceStagingRemoved",
        )
    ):
        raise RuntimeError(
            "Restore verified; temporary resources need cleanup. See the receipt."
        )
    print(
        "Verified complete state, R2 round trip, isolated application boot, and recovered business data."
    )


if __name__ == "__main__":

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, interrupted)
    try:
        main()
    except BaseException as error:  # noqa: BLE001 - never expose raw credential-bearing errors
        print(
            str(error) if isinstance(error, RuntimeError) else type(error).__name__,
            file=sys.stderr,
        )
        sys.exit(1)
