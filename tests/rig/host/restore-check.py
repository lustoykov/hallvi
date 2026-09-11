"""Independent isolated restore of one Server Guy backup (rig evidence only).

Runs as root inside the rig host. It downloads one archive from the rig's
MinIO, checks every file against the manifest inventory, and brings the
archived Compose configuration up as its own project: no published ports,
internal networks, no controller labels, and fresh volumes filled from the
archive. File volumes are copied from state/; each declared dump is loaded
into its owner by the recorded restore command and must print the
fingerprint captured from the source. An optional check then runs in a
container on the restored network. Private values stay in root-only files
and are never printed. Everything it creates is removed at the end.

  docker cp tests/rig/bookstack sg-rig-host:/root/rig-check/rig
  docker cp <workflow dir> sg-rig-host:/root/rig-check/workflow
  docker exec -i sg-rig-host python3 - <object-key> [<image> <argv>...] \\
    < tests/rig/host/restore-check.py
"""

import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

PROJECT = "rig-restore-check"
ROOT = Path("/root/rig-check")
WORK = ROOT / "restore"


def run(*args, timeout=900, **options):
    return subprocess.run(
        args, capture_output=True, check=True, timeout=timeout, **options
    )


def report(step, **details):
    print(json.dumps({"step": step, **details}), flush=True)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def restore(key, check):
    run(
        "docker", "run", "--rm", "--network", "container:rig-minio",
        "--env-file", "/etc/rig-minio/env", "--volume", f"{WORK}:/out",
        "minio/mc", "--insecure", "cp", f"local/server-guy-backups/{key}",
        "/out/archive.tar.gz",
    )
    archive = WORK / "archive.tar.gz"
    report("download", key=key, bytes=archive.stat().st_size, sha256=digest(archive))
    extracted = WORK / "x"
    with tarfile.open(archive) as bundle:
        bundle.extractall(extracted, filter="tar", numeric_owner=True)
    manifest = json.loads((extracted / "manifest.json").read_text())
    files = {
        str(path.relative_to(extracted)): digest(path)
        for path in extracted.rglob("*")
        if path.is_file() and path != extracted / "manifest.json"
    }
    passed = files == manifest["files"]
    report("archive-inventory", files=len(files), matches=passed)

    model = json.loads((extracted / "configuration/compose.json").read_text())
    root = f"/opt/server-guy/{manifest['deploymentId']}/"
    model["name"] = PROJECT
    for service in model["services"].values():
        service.pop("ports", None)
        service.pop("container_name", None)
        service["labels"] = {
            key: value
            for key, value in (service.get("labels") or {}).items()
            if not key.startswith("server-guy.")
        }
        for mount in service.get("volumes") or []:
            source = mount.get("source", "")
            if mount.get("type") == "bind" and source.startswith(root):
                archived = extracted / "configuration" / source[len(root):]
                if not archived.exists():
                    raise RuntimeError(f"Bound file {mount['target']} is not archived.")
                mount["source"] = str(archived)
    networks = model.setdefault("networks", {"default": {}})
    for name in networks:
        networks[name] = {"name": f"{PROJECT}_{name}", "internal": True}
    for name in model.get("volumes") or {}:
        model["volumes"][name] = {"name": f"{PROJECT}_{name}", "external": True}
        run("docker", "volume", "create", f"{PROJECT}_{name}")
    definition = WORK / "compose.json"
    definition.write_text(json.dumps(model))
    definition.chmod(0o600)
    compose = ["docker", "compose", "-p", PROJECT, "-f", str(definition)]

    for volume in manifest["capture"]["volumes"]:
        image = model["services"][volume["mounts"][0]["service"]]["image"]
        run(
            "docker", "run", "--rm", "--network", "none", "--entrypoint", "cp",
            "--volume", f"{PROJECT}_{volume['name']}:/destination",
            "--volume", f"{extracted / 'state' / volume['name']}:/source:ro",
            image, "-a", "/source/.", "/destination/",
        )
        report("files-restored", volume=volume["name"])
    for dump in manifest["capture"].get("dumps") or []:
        service = dump["service"]
        run(*compose, "up", "--detach", "--wait", "--wait-timeout", "300",
            "--no-deps", "--pull", "never", service)
        payload = (extracted / "database" / f"{dump['volume']}.dump").read_bytes()
        for _ in range(12):
            loaded = subprocess.run(
                [*compose, "exec", "-T", service, *dump["restore"]],
                input=payload, capture_output=True, timeout=900,
            )
            if loaded.returncode == 0:
                break
            time.sleep(5)
        else:
            raise RuntimeError(f"Loading {dump['volume']} failed.")
        fingerprint = run(*compose, "exec", "-T", service, *dump["verify"]).stdout
        matches = (
            fingerprint.decode("utf-8", "replace")
            == manifest["dumps"][dump["volume"]]["fingerprint"]
        )
        passed = passed and matches
        report("dump-restored", volume=dump["volume"], fingerprintMatches=matches)

    started = time.monotonic()
    run(*compose, "up", "--detach", "--wait", "--wait-timeout", "900",
        "--pull", "never", timeout=1000)
    states = [
        json.loads(line)
        for line in run(*compose, "ps", "--all", "--format", "json")
        .stdout.decode().splitlines()
        if line.strip()
    ]
    report(
        "stack-up",
        seconds=round(time.monotonic() - started),
        services={s["Service"]: [s["State"], s["ExitCode"]] for s in states},
    )
    if check:
        result = subprocess.run(
            [
                "docker", "run", "--rm", "--network",
                f"{PROJECT}_{next(iter(networks))}",
                "--volume", f"{ROOT / 'rig'}:/rig:ro",
                "--volume", f"{ROOT / 'workflow'}:/wf",
                "--env", "SG_RIG_WORKFLOW=/wf", *check,
            ],
            capture_output=True, timeout=900,
        )
        print(result.stdout.decode("utf-8", "replace")[-8000:], end="", flush=True)
        report(
            "check",
            exitCode=result.returncode,
            error=result.stderr.decode("utf-8", "replace")[-1500:],
        )
        passed = passed and result.returncode == 0
    return passed


def main():
    shutil.rmtree(WORK, ignore_errors=True)
    WORK.mkdir(parents=True, mode=0o700)
    definition = WORK / "compose.json"
    passed = False
    try:
        passed = restore(sys.argv[1], sys.argv[2:])
    except (subprocess.CalledProcessError, RuntimeError) as error:
        detail = getattr(error, "stderr", None)
        report(
            "failed",
            error=str(error)[:300],
            output=detail.decode("utf-8", "replace")[-1500:] if detail else None,
        )
    finally:
        if definition.exists():
            subprocess.run(
                ["docker", "compose", "-p", PROJECT, "-f", str(definition),
                 "down", "--remove-orphans", "--timeout", "30"],
                capture_output=True,
            )
            for name in json.loads(definition.read_text()).get("volumes") or {}:
                subprocess.run(
                    ["docker", "volume", "rm", "-f", f"{PROJECT}_{name}"],
                    capture_output=True,
                )
        shutil.rmtree(WORK, ignore_errors=True)
        left = subprocess.run(
            ["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={PROJECT}"],
            capture_output=True,
        ).stdout.split()
        report("cleanup", containersLeft=len(left), workRemoved=not WORK.exists())
    report("result", passed=passed)
    sys.exit(0 if passed else 1)


main()
