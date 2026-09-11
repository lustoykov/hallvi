"""Host-side scheduled backup engine for one Server Guy deployment.

Installed by the controller next to capture_sqlite_stack.py and driven by a
systemd timer. One process per run, guarded by the deployment lock the
controller also takes for deploy and recreate. See CONTRACT.md for the exact
receipt, status and error contract the controller integrates against.

    python3 runner.py <config-path>                  one scheduled run
    python3 runner.py <config-path> --recover        ExecStopPost recovery
    python3 runner.py <config-path> --status         sanitized JSON snapshot
    python3 runner.py <config-path> --test-restore <run-id>

Receipts and stdout never carry credentials, configuration, host paths,
addresses or application data. Failures are a bounded phase and error code.
"""

import fcntl
import hashlib
import json
import os
import re
import shutil
import sqlite3
from contextlib import closing
import subprocess
import sys
import tarfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

VERSION = 1
HISTORY_LIMIT = 30
RECEIPT_LIMIT = 100
MAX_DELETIONS = 50
MAX_LISTED = 1000
COMMAND_TIMEOUT = 120
CAPTURE_TIMEOUT = 900
RESTORE_TIMEOUT = 600
RECOVERY_LOCK_WAIT = 15

STATE_ROOT = Path(
    os.environ.get("SERVER_GUY_BACKUP_ROOT", "/var/lib/server-guy/backups")
)
LOCK_ROOT = Path(os.environ.get("SERVER_GUY_LOCK_DIR", "/run/lock"))
SOURCE_ROOT = Path(os.environ.get("SERVER_GUY_SOURCE_ROOT", "/opt/server-guy"))
# Where the capture helper stages its snapshot. The helper hardcodes /var/tmp,
# so this only ever moves for the tests.
HELPER_STAGE_ROOT = Path(os.environ.get("SERVER_GUY_HELPER_STAGE_ROOT", "/var/tmp"))

RESTORE_LABEL = "sg-scheduled-restore"

PHASES = (
    "config",
    "lock",
    "credentials",
    "capture",
    "upload",
    "verify",
    "retention",
    "complete",
)

ERROR_CODES = {
    "config-unreadable",
    "config-invalid",
    "config-insecure",
    "identity-mismatch",
    "lock-unavailable",
    "credentials-unreadable",
    "credentials-insecure",
    "credentials-invalid",
    "credentials-rejected",
    "source-missing",
    "source-unsupported",
    "source-not-running",
    "source-identity-mismatch",
    "helper-missing",
    "capture-failed",
    "capture-timeout",
    "source-restart-failed",
    "source-stop-failed",
    "unsafe-path",
    "upload-failed",
    "upload-timeout",
    "storage-denied",
    "storage-missing-bucket",
    "storage-missing-object",
    "storage-unavailable",
    "storage-error",
    "download-failed",
    "download-timeout",
    "verify-mismatch",
    "run-not-found",
    "run-not-restorable",
    "archive-unsafe",
    "manifest-mismatch",
    "database-check-failed",
    "restore-image-unavailable",
    "restore-failed",
    "restore-timeout",
    "interrupted",
    "unexpected-error",
}

CHECK_LABELS = {
    "archive-hash",
    "archive-structure",
    "backup-identity",
    "file-inventory",
    "database-integrity",
    "database-schema",
    "database-rows",
    "database-restored",
    "database-tables",
    "database-empty",
}

# Bounded translation of storage failures. The SDK's own text never leaves the
# process, so an expired key reads as a credential failure and nothing else.
STORAGE_CODES = {
    "AccessDenied": "credentials-rejected",
    "InvalidAccessKeyId": "credentials-rejected",
    "SignatureDoesNotMatch": "credentials-rejected",
    "ExpiredToken": "credentials-rejected",
    "TokenRefreshRequired": "credentials-rejected",
    "NoSuchBucket": "storage-missing-bucket",
    "NoSuchKey": "storage-missing-object",
    "RequestTimeout": "storage-unavailable",
    "RequestTimeTooSkewed": "storage-unavailable",
    "SlowDown": "storage-unavailable",
    "ServiceUnavailable": "storage-unavailable",
    "InternalError": "storage-unavailable",
}

TIMEOUT_CODES = {
    "capture": "capture-timeout",
    "upload": "upload-timeout",
    "verify": "download-timeout",
    "restore": "restore-timeout",
}

ARCHIVE_ROOTS = {"manifest.json", "state", "configuration", "database"}


class BackupError(Exception):
    """A failure already reduced to a phase and a bounded code."""

    def __init__(self, phase, code):
        super().__init__(code)
        self.phase = phase
        self.code = code


def classify(error, phase):
    """Reduce any exception to a bounded code, never to its text."""
    if isinstance(error, BackupError):
        return error.code
    if isinstance(error, subprocess.TimeoutExpired):
        return TIMEOUT_CODES.get(phase, "unexpected-error")
    if type(error).__module__.split(".")[0] in {
        "boto3",
        "botocore",
        "s3transfer",
        "urllib3",
    }:
        response = getattr(error, "response", None)
        code = (
            response.get("Error", {}).get("Code")
            if isinstance(response, dict)
            else None
        )
        if code in STORAGE_CODES:
            return STORAGE_CODES[code]
        # boto3's upload_file wraps ClientError in S3UploadFailedError.
        # Read only bounded provider codes from its exception chain.
        inner = error
        for _ in range(3):
            inner = inner.__cause__ or inner.__context__
            if inner is None:
                break
            response = getattr(inner, "response", None)
            code = (
                response.get("Error", {}).get("Code")
                if isinstance(response, dict)
                else None
            )
            if code in STORAGE_CODES:
                return STORAGE_CODES[code]
        return "storage-error"
    return "unexpected-error"


def now():
    return time.time()


def iso(epoch):
    stamp = datetime.fromtimestamp(epoch, tz=timezone.utc)
    return stamp.isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value, mode=0o600):
    """Atomic and durable: readers see the old or the new receipt, never half."""
    temporary = Path(path).with_name(Path(path).name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    directory = os.open(Path(path).parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def read_private_json(path, phase, unreadable, insecure):
    path = Path(path)
    if not path.is_absolute() or str(path) != os.path.realpath(path):
        raise BackupError(phase, insecure)
    try:
        status = path.lstat()
    except OSError as error:
        raise BackupError(phase, unreadable) from error
    if status.st_mode & 0o077:
        raise BackupError(phase, insecure)
    if status.st_uid not in (0, os.geteuid()):
        raise BackupError(phase, insecure)
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as error:
        raise BackupError(phase, unreadable) from error


def remove_tree(path):
    """True when the directory is gone, so callers can record leftovers."""
    try:
        shutil.rmtree(path, ignore_errors=False)
    except FileNotFoundError:
        return True
    except OSError:
        return False
    return True


def run_command(*args, input=None, timeout=COMMAND_TIMEOUT, stdout=None):
    """Default command runner. Injected in tests, never given a shell."""
    if stdout is None:
        return subprocess.check_output(
            args, input=input, stderr=subprocess.PIPE, timeout=timeout
        )
    with Path(stdout).open("wb") as target:
        subprocess.run(
            args,
            input=input,
            stdout=target,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=True,
        )
    return b""


UUID_PATTERN = re.compile(r"^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$")
REVISION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
BUCKET_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
REGION_PATTERN = re.compile(r"^(auto|[a-z0-9-]{2,32})$")
ENDPOINT_PATTERN = re.compile(r"^https://[a-z0-9.-]{3,255}(:[0-9]{2,5})?/?$")
SCHEDULE_PATTERN = re.compile(r"^[A-Za-z0-9 :*,./~+-]{1,128}$")
TIMEZONE_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+_-]+)*$")
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]{0,62}$")
CONTAINER_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def identifier(value):
    return isinstance(value, str) and bool(UUID_PATTERN.match(value))


def load_config(path):
    """Validate everything the run depends on before it can touch anything."""
    config = read_private_json(path, "config", "config-unreadable", "config-insecure")
    if not isinstance(config, dict) or config.get("version") != VERSION:
        raise BackupError("config", "config-invalid")
    application = config.get("applicationId")
    deployment = config.get("deploymentId")
    if not identifier(application) or not identifier(deployment):
        raise BackupError("config", "config-invalid")
    keep = config.get("keep")
    if isinstance(keep, bool) or not isinstance(keep, int) or not 1 <= keep <= 90:
        raise BackupError("config", "config-invalid")
    checks = (
        (
            config.get("kind"),
            lambda value: value in {"sqlite-stack", "postgres", "stack"},
        ),
        (config.get("revision"), REVISION_PATTERN.match),
        (config.get("bucket"), BUCKET_PATTERN.match),
        (config.get("region"), REGION_PATTERN.match),
        (config.get("endpoint"), ENDPOINT_PATTERN.match),
        (config.get("schedule"), SCHEDULE_PATTERN.match),
        (config.get("timezone"), TIMEZONE_PATTERN.match),
    )
    for value, accepts in checks:
        if not isinstance(value, str) or not accepts(value):
            raise BackupError("config", "config-invalid")
    credentials = config.get("credentialsFile")
    if not isinstance(credentials, str) or not credentials.startswith("/"):
        raise BackupError("config", "config-invalid")
    prefix = config.get("prefix")
    if not isinstance(prefix, str):
        raise BackupError("config", "config-invalid")
    # The one prefix this deployment owns. Anything else is another
    # application's data and this process must not read or expire it.
    if prefix != f"scheduled/{application}/{deployment}/":
        raise BackupError("config", "identity-mismatch")
    return {
        "version": VERSION,
        "applicationId": application,
        "deploymentId": deployment,
        "revision": config["revision"],
        "kind": config["kind"],
        "endpoint": config["endpoint"].rstrip("/"),
        "region": config["region"],
        "bucket": config["bucket"],
        "prefix": prefix,
        "credentialsFile": credentials,
        "keep": keep,
        "schedule": config["schedule"],
        "timezone": config["timezone"],
        **(
            {
                "capture": config.get("capture"),
                "composeSha256": config.get("composeSha256"),
            }
            if config["kind"] == "stack"
            else {}
        ),
    }


def helper_stage(run_id):
    """Where the capture helper stages this run, derived and never read back.

    Recovery deletes this path, so it is always generated from the run id
    rather than taken from a record that could name anything at all.
    """
    return HELPER_STAGE_ROOT / ("server-guy-proof-" + run_id)


def restore_names(run_id):
    """The disposable resources one restore may own, all derived from its id."""
    return {
        "container": "sg-restore-" + run_id,
        "volume": "sg-restore-" + run_id + "-data",
        "stage": "restore-" + run_id,
    }


class State:
    """Durable per-deployment metadata: receipts, recovery journals, staging."""

    def __init__(self, config):
        self.applicationId = config["applicationId"]
        self.deploymentId = config["deploymentId"]
        self.root = STATE_ROOT / self.deploymentId
        self.runs = self.root / "runs"
        self.recovery = self.root / "recovery"
        self.staging = self.root / "staging"
        for path in (STATE_ROOT, self.root, self.runs, self.recovery, self.staging):
            path.mkdir(parents=True, exist_ok=True)
            os.chmod(path, 0o700)

    def receipt_path(self, run_id):
        if not identifier(run_id):
            raise BackupError("restore", "run-not-found")
        return self.runs / (run_id + ".json")

    def save_receipt(self, receipt):
        write_json(self.receipt_path(receipt["id"]), receipt)

    def load_receipt(self, run_id):
        path = self.receipt_path(run_id)
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError):
            return None

    def history(self):
        receipts = []
        for path in sorted(self.runs.glob("*.json")):
            try:
                receipt = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            if isinstance(receipt, dict) and identifier(receipt.get("id", "")):
                receipts.append(receipt)
        receipts.sort(key=lambda receipt: receipt.get("startedAt") or "", reverse=True)
        return receipts

    def journals(self):
        journals = []
        for path in sorted(self.recovery.glob("*.json")):
            try:
                journal = json.loads(path.read_text())
            except (OSError, ValueError):
                continue
            if isinstance(journal, dict) and identifier(journal.get("runId", "")):
                journal.setdefault("kind", "source")
                journals.append(journal)
        return journals

    def journal_path(self, journal):
        if not identifier(journal.get("runId", "")):
            raise BackupError("restore", "run-not-found")
        prefix = "restore-" if journal.get("kind") == "restore" else ""
        return self.recovery / (prefix + journal["runId"] + ".json")

    def save_journal(self, journal):
        write_json(self.journal_path(journal), journal)

    def drop_journal(self, journal):
        self.journal_path(journal).unlink(missing_ok=True)

    def stage(self, run_id):
        directory = self.staging / run_id
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(directory, 0o700)
        return directory

    def cleanup_pending(self):
        if any(self.staging.iterdir()):
            return True
        for journal in self.journals():
            if not journal.get("complete"):
                return True
            # A finished capture can still have left the helper's snapshot
            # behind, and that snapshot holds application data.
            if journal["kind"] == "source" and helper_stage(journal["runId"]).exists():
                return True
        return any(
            receipt.get("pendingCleanup") or receipt.get("outcome") == "running"
            for receipt in self.history()
        )

    def prune(self):
        """Bounded local metadata that never forgets a live archive.

        A receipt is the only record of which object belongs to this
        deployment, so it outlives the cap until retention has confirmed the
        object is gone. A settled journal goes when its run's receipt goes.
        """
        open_journals = {
            journal["runId"]
            for journal in self.journals()
            if not journal.get("complete")
        }
        kept = set()
        for index, receipt in enumerate(self.history()):
            expendable = (
                index >= RECEIPT_LIMIT
                and receipt.get("outcome") != "running"
                and not receipt.get("pendingCleanup")
                and receipt["id"] not in open_journals
                # Either it never reached storage, or its object is known gone.
                and (not receipt.get("objectKey") or receipt.get("expiredAt"))
            )
            if expendable:
                self.receipt_path(receipt["id"]).unlink(missing_ok=True)
                continue
            kept.add(receipt["id"])
        for journal in self.journals():
            if journal.get("complete") and journal["runId"] not in kept:
                self.drop_journal(journal)


def acquire_lock(deployment_id, wait=0):
    """The deployment lock the controller shares for deploy and recreate."""
    LOCK_ROOT.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(
        LOCK_ROOT / ("server-guy-" + deployment_id + ".lock"),
        os.O_CREAT | os.O_RDWR,
        0o600,
    )
    deadline = now() + wait
    while True:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return descriptor
        except OSError:
            if now() >= deadline:
                os.close(descriptor)
                return None
            time.sleep(0.5)


class Storage:
    """Bounded object storage access, scoped to one managed prefix."""

    def __init__(self, client, bucket, prefix):
        self.client = client
        self.bucket = bucket
        self.prefix = prefix

    def key_for(self, run_id):
        return self.prefix + run_id + ".tar.gz"

    def upload(self, path, key):
        if not key.startswith(self.prefix):
            raise BackupError("upload", "identity-mismatch")
        self.client.upload_file(str(path), self.bucket, key)

    def download(self, key, path):
        if not key.startswith(self.prefix):
            raise BackupError("verify", "identity-mismatch")
        self.client.download_file(self.bucket, key, str(path))
        os.chmod(path, 0o600)

    def list_prefix(self):
        """Keys under the managed prefix, and whether the listing ran out.

        A truncated listing is not evidence that anything is missing, so the
        caller is told rather than left to assume.
        """
        keys = []
        truncated = False
        arguments = {"Bucket": self.bucket, "Prefix": self.prefix}
        while True:
            page = self.client.list_objects_v2(**arguments)
            for entry in page.get("Contents", []):
                key = entry.get("Key")
                if isinstance(key, str) and key.startswith(self.prefix):
                    keys.append(key)
            token = page.get("NextContinuationToken")
            if not page.get("IsTruncated") or not token:
                break
            if len(keys) >= MAX_LISTED:
                truncated = True
                break
            arguments["ContinuationToken"] = token
        return keys, truncated

    def list_keys(self):
        return self.list_prefix()[0]

    def delete(self, key):
        if not key.startswith(self.prefix):
            raise BackupError("retention", "identity-mismatch")
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def abort_multipart(self, key):
        """Abandon only this key's parts. Never sweep the bucket."""
        if not key.startswith(self.prefix):
            return False
        try:
            page = self.client.list_multipart_uploads(Bucket=self.bucket, Prefix=key)
            for upload in page.get("Uploads", []):
                if upload.get("Key") != key:
                    continue
                self.client.abort_multipart_upload(
                    Bucket=self.bucket, Key=key, UploadId=upload["UploadId"]
                )
        except Exception:  # noqa: BLE001 - an abandoned abort is recorded, never raised
            return False
        return True


def make_storage(config):
    """Read credentials once and build a client with bounded transfers."""
    credentials = read_private_json(
        config["credentialsFile"],
        "credentials",
        "credentials-unreadable",
        "credentials-insecure",
    )
    if not isinstance(credentials, dict):
        raise BackupError("credentials", "credentials-invalid")
    key = credentials.get("accessKeyId")
    secret = credentials.get("secretAccessKey")
    if not isinstance(key, str) or not isinstance(secret, str) or not key or not secret:
        raise BackupError("credentials", "credentials-invalid")
    try:
        import boto3
        from botocore.config import Config
    except ImportError as error:
        # The installer owns the virtualenv; say so as a storage failure
        # rather than as an unexplained one.
        raise BackupError("credentials", "storage-unavailable") from error

    client = boto3.client(
        "s3",
        endpoint_url=config["endpoint"],
        region_name=config["region"],
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        config=Config(
            connect_timeout=15,
            read_timeout=120,
            retries={"max_attempts": 3, "mode": "standard"},
            s3={"addressing_style": "path"},
        ),
    )
    return Storage(client, config["bucket"], config["prefix"])


def verify_copy(path, expected_bytes, expected_sha256):
    """A round trip only counts when both length and digest match."""
    path = Path(path)
    if not path.is_file() or path.stat().st_size != expected_bytes:
        raise BackupError("verify", "verify-mismatch")
    if sha256(path) != expected_sha256:
        raise BackupError("verify", "verify-mismatch")


def safe_extract(archive, destination):
    with tarfile.open(archive) as bundle:
        for member in bundle.getmembers():
            path = Path(member.name)
            if path.is_absolute() or ".." in path.parts:
                raise BackupError("restore", "archive-unsafe")
            if not (member.isfile() or member.isdir()):
                raise BackupError("restore", "archive-unsafe")
            if path.parts[0] not in ARCHIVE_ROOTS:
                raise BackupError("restore", "archive-unsafe")
        bundle.extractall(destination, filter="data")


def archive_manifest(archive):
    """Read just the manifest out of a capture archive, nothing else."""
    try:
        with tarfile.open(archive) as bundle:
            member = bundle.getmember("manifest.json")
            if not member.isfile():
                raise BackupError("capture", "capture-failed")
            with bundle.extractfile(member) as stream:
                return json.loads(stream.read().decode())
    except (KeyError, OSError, ValueError, tarfile.TarError) as error:
        raise BackupError("capture", "capture-failed") from error


def source_definition(config, phase="capture"):
    root = SOURCE_ROOT / config["deploymentId"]
    if str(root) != os.path.realpath(root):
        raise BackupError(phase, "unsafe-path")
    compose = root / "compose.json"
    if compose.is_symlink() or not compose.is_file():
        raise BackupError(phase, "source-missing")
    try:
        definition = json.loads(compose.read_text())
    except (OSError, ValueError) as error:
        raise BackupError(phase, "source-missing") from error
    services = definition.get("services")
    if not isinstance(services, dict) or not services:
        raise BackupError(phase, "source-unsupported")
    return root, definition


def compose_project(deployment_id):
    return "sg-" + deployment_id[:8]


def source_containers(command, root, config):
    output = command(
        "docker",
        "compose",
        "-p",
        compose_project(config["deploymentId"]),
        "-f",
        str(root / "compose.json"),
        "ps",
        "-q",
    )
    ids = output.decode().split()
    if not ids or not all(CONTAINER_PATTERN.match(value) for value in ids):
        raise BackupError("capture", "source-not-running")
    return ids


def running_containers(command, ids):
    """Map recorded ids to running, distinguishing gone from daemon trouble.

    `docker inspect` exits non-zero both for a container that no longer exists
    and for a daemon that cannot be reached, and recovery must not read the
    second as the first. A single `ps` succeeds whenever the daemon answers.
    """
    if not ids:
        return {}
    wanted = set(ids)
    states = {}
    for line in (
        command("docker", "ps", "--all", "--no-trunc", "--format", "{{.ID}} {{.State}}")
        .decode()
        .splitlines()
    ):
        parts = line.split()
        if len(parts) == 2 and parts[0] in wanted:
            states[parts[0]] = {"running": parts[1] == "running"}
    return states


def container_states(command, ids):
    """Inspected detail for the source containers a capture is about to touch."""
    if not ids:
        return {}
    try:
        containers = json.loads(command("docker", "inspect", *ids))
    except (subprocess.CalledProcessError, ValueError) as error:
        # Compose listed them a moment ago, so a source that cannot be
        # inspected is a source this run must not try to capture.
        raise BackupError("capture", "source-not-running") from error
    return {
        container["Id"]: {
            "running": bool(container["State"]["Running"]),
            "labels": container["Config"]["Labels"] or {},
            "service": container["Config"]["Labels"].get("com.docker.compose.service"),
            "image": container["Config"]["Image"],
            "environment": container["Config"].get("Env") or [],
            "mounts": container.get("Mounts") or [],
        }
        for container in containers
    }


def verify_source_identity(config, states, definition=None):
    """The running application must be the deployment this config protects.

    Without this a redeploy would be captured and then filed under the old
    revision, so it is checked before the source is touched at all. Every
    running container the controller labeled must carry this deployment and
    revision, whatever its service is called. With the host's Compose
    definition, whose hash the caller has matched, the labeled services are
    exactly those it labels; state owners run unlabeled so a release never
    recreates them, and the hash alone binds a stack that runs only them.
    """
    if definition is not None:
        expected = {
            name
            for name, service in definition["services"].items()
            if "server-guy.revision" in (service.get("labels") or {})
        }
        labeled = [value for value in states.values() if value["service"] in expected]
    else:
        labeled = [
            value
            for value in states.values()
            if {"server-guy.deployment", "server-guy.revision"} & set(value["labels"])
        ]
        # Running containers the controller never labeled are not this one.
        if not labeled:
            raise BackupError("capture", "source-identity-mismatch")
    for value in labeled:
        if (
            value["labels"].get("server-guy.deployment") != config["deploymentId"]
            or value["labels"].get("server-guy.revision") != config["revision"]
        ):
            raise BackupError("capture", "source-identity-mismatch")


HELPER_MODULE = []


def helper_path():
    """The installed copy, or the repository source when run from a checkout."""
    installed = Path(__file__).with_name("capture_sqlite_stack.py")
    if installed.is_file():
        return installed
    source = (
        Path(__file__).resolve().parents[1] / "backup-proof/capture-sqlite-stack.py"
    )
    if source.is_file():
        return source
    raise BackupError("capture", "helper-missing")


def helper_module():
    if not HELPER_MODULE:
        import importlib.util

        specification = importlib.util.spec_from_file_location(
            "capture_sqlite_stack_helper", helper_path()
        )
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        HELPER_MODULE.append(module)
    return HELPER_MODULE[0]


def capture_sqlite_stack(config, state, run_id, command, staging):
    """Delegate to the proven quiesced helper, owning the recovery journal."""
    root, definition = source_definition(config)
    services = definition["services"]
    if set(services) not in [{"app"}, {"app", "prometheus"}]:
        raise BackupError("capture", "source-unsupported")
    ids = source_containers(command, root, config)
    states = container_states(command, ids)
    if len(states) != len(services) or not all(
        value["running"] for value in states.values()
    ):
        raise BackupError("capture", "source-not-running")
    verify_source_identity(config, states)
    helper = helper_path()
    output = helper_stage(run_id)
    journal = {
        "version": VERSION,
        "kind": "source",
        "runId": run_id,
        "deploymentId": config["deploymentId"],
        "stopped": ids,
        "stoppedAt": iso(now()),
        "complete": False,
        "stageRemoved": False,
    }
    # Durable before the source is touched: a SIGKILL here still leaves
    # --recover enough to restart exactly these containers and clear the
    # snapshot the helper stages outside this directory.
    state.save_journal(journal)
    try:
        printed = command(
            sys.executable,
            str(helper),
            config["deploymentId"],
            run_id,
            timeout=CAPTURE_TIMEOUT,
        )
        result = next(
            json.loads(line)
            for line in printed.decode().splitlines()
            if line.startswith('{"path":')
        )
    except (subprocess.CalledProcessError, StopIteration, ValueError) as error:
        raise BackupError("capture", "capture-failed") from error
    finally:
        restore_source(command, state, journal)
    archive = staging / "archive.tar.gz"
    try:
        shutil.move(result["path"], archive)
    except OSError as error:
        raise BackupError("capture", "capture-failed") from error
    finally:
        journal["stageRemoved"] = remove_tree(output)
        state.save_journal(journal)
    os.chmod(archive, 0o600)
    measured = archive.stat().st_size
    digest = sha256(archive)
    if measured != result.get("bytes") or digest != result.get("sha256"):
        raise BackupError("capture", "capture-failed")
    manifest = archive_manifest(archive)
    # The recovery point is when the source stopped changing, not when
    # compression happened to finish.
    quiesced = manifest.get("stopStartedAt")
    if not isinstance(quiesced, (int, float)):
        raise BackupError("capture", "capture-failed")
    return {
        "path": archive,
        "bytes": measured,
        "sha256": digest,
        "pauseSeconds": float(result.get("pauseSeconds") or 0.0),
        "capturedAt": float(quiesced),
    }


def recovery_plan(journal, states):
    """Only containers this run stopped, that still exist, and are stopped.

    A container an operator had already stopped was never recorded, so it is
    never started here.
    """
    return [
        container
        for container in journal.get("stopped", [])
        if container in states and not states[container]["running"]
    ]


def restart_recorded(command, journal):
    """Start what this run stopped. Idempotent, and safe to repeat."""
    ids = journal.get("stopped", [])
    restarted = 0
    for container in reversed(recovery_plan(journal, running_containers(command, ids))):
        try:
            command("docker", "start", container)
            restarted += 1
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    states = running_containers(command, ids)
    journal["complete"] = all(value["running"] for value in states.values())
    return restarted, journal["complete"]


def restore_source(command, state, journal):
    """The source must be serving again before anything leaves the host."""
    try:
        running = restart_recorded(command, journal)[1]
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        journal["complete"] = False
        state.save_journal(journal)
        raise BackupError("capture", "source-restart-failed") from error
    journal["restartedAt"] = iso(now())
    state.save_journal(journal)
    if not running:
        raise BackupError("capture", "source-restart-failed")


def source_environment(values, name):
    for entry in values:
        if isinstance(entry, str) and entry.startswith(name + "="):
            return entry[len(name) + 1 :]
    return None


def capture_postgres(config, state, run_id, command, staging):
    """pg_dump inside the running database container. No pause, no writes."""
    root, definition = source_definition(config)
    services = definition["services"]
    database_services = [
        name
        for name, service in services.items()
        if isinstance(service.get("image"), str)
        and re.match(r"^postgres[:@]", service["image"])
    ]
    if len(database_services) != 1:
        raise BackupError("capture", "source-unsupported")
    service_name = database_services[0]
    ids = source_containers(command, root, config)
    states = container_states(command, ids)
    database = next(
        (
            (container, value)
            for container, value in states.items()
            if value["service"] == service_name
        ),
        None,
    )
    if database is None or not database[1]["running"]:
        raise BackupError("capture", "source-not-running")
    verify_source_identity(config, states)
    container, meta = database
    # A dump protects the database and nothing else. Refuse rather than
    # silently leave an application's own volume unprotected.
    for value in states.values():
        if value["service"] == service_name:
            continue
        if any(mount.get("Type") == "volume" for mount in value["mounts"]):
            raise BackupError("capture", "source-unsupported")
    user = source_environment(meta["environment"], "POSTGRES_USER")
    name = source_environment(meta["environment"], "POSTGRES_DB")
    if not IDENTIFIER_PATTERN.match(user or "") or not IDENTIFIER_PATTERN.match(
        name or ""
    ):
        raise BackupError("capture", "source-unsupported")
    try:
        version = int(
            command(
                "docker",
                "exec",
                container,
                "psql",
                "-U",
                user,
                "-d",
                name,
                "-tAqc",
                "SHOW server_version_num",
            )
            .decode()
            .strip()
        )
    except (subprocess.CalledProcessError, ValueError) as error:
        raise BackupError("capture", "source-not-running") from error
    stage = staging / "snapshot"
    (stage / "database").mkdir(mode=0o700, parents=True)
    (stage / "configuration").mkdir(mode=0o700, parents=True)
    # pg_dump reads a snapshot taken as it starts, so the recovery point is
    # here and not wherever the dump happens to finish.
    quiesced = now()
    manifest = {
        "version": VERSION,
        "applicationId": config["applicationId"],
        "deploymentId": config["deploymentId"],
        "runId": run_id,
        "revision": config["revision"],
        "kind": "postgres",
        "method": "pg_dump custom format from the running database container",
        "recoveryPointAt": iso(quiesced),
        "postgres": {
            "service": service_name,
            "image": meta["image"],
            "majorVersion": version // 10000,
            "user": user,
            "database": name,
        },
        "bindings": {},
    }
    dump = stage / "database/dump.pgc"
    try:
        command(
            "docker",
            "exec",
            container,
            "pg_dump",
            "-U",
            user,
            "-d",
            name,
            "--format=custom",
            "--no-owner",
            "--no-acl",
            stdout=dump,
            timeout=CAPTURE_TIMEOUT,
        )
    except subprocess.CalledProcessError as error:
        raise BackupError("capture", "capture-failed") from error
    os.chmod(dump, 0o600)
    with dump.open("rb") as stream:
        if stream.read(5) != b"PGDMP":
            raise BackupError("capture", "capture-failed")
    shutil.copy2(root / "compose.json", stage / "configuration/compose.json")
    for value in states.values():
        for mount in value["mounts"]:
            if mount.get("Type") != "bind":
                continue
            path = Path(mount["Source"])
            if not path.is_relative_to(root) or path.is_symlink() or not path.is_file():
                raise BackupError("capture", "source-unsupported")
            relative = str(path.relative_to(root))
            target = stage / "configuration" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            manifest["bindings"][mount["Destination"]] = relative
    manifest["files"] = {
        str(path.relative_to(stage)): sha256(path)
        for path in sorted(stage.rglob("*"))
        if path.is_file()
    }
    (stage / "manifest.json").write_text(json.dumps(manifest, indent=2))
    archive = staging / "archive.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for child in sorted(stage.iterdir()):
            bundle.add(child, arcname=child.name)
    os.chmod(archive, 0o600)
    remove_tree(stage)
    return {
        "path": archive,
        "bytes": archive.stat().st_size,
        "sha256": sha256(archive),
        "pauseSeconds": 0.0,
        "capturedAt": quiesced,
    }


def capture_stack(config, state, run_id, command, staging):
    """One quiesced recovery point for recorded volumes and managed PostgreSQL."""
    root, definition = source_definition(config)
    plan = config.get("capture") or {}
    if config.get("composeSha256") != sha256(root / "compose.json"):
        raise BackupError("capture", "source-identity-mismatch")
    pause_services = plan.get("pauseServices")
    volumes = plan.get("volumes")
    postgres = plan.get("postgres")
    dumps = plan.get("dumps") or []
    one_shot = plan.get("oneShot") or []
    service_name = r"[a-z0-9][a-z0-9_.-]{0,62}"
    if (
        plan.get("version") != 1
        or not isinstance(pause_services, list)
        or not isinstance(volumes, list)
        or not isinstance(dumps, list)
        or not isinstance(one_shot, list)
        or (postgres is not None and not re.fullmatch(service_name, str(postgres)))
    ):
        raise BackupError("capture", "source-unsupported")
    for dump in dumps:
        if (
            not isinstance(dump, dict)
            or not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", str(dump.get("volume")))
            or not re.fullmatch(service_name, str(dump.get("service")))
            or not isinstance(dump.get("target"), str)
            or not all(
                isinstance(dump.get(step), list)
                and dump[step]
                and all(isinstance(part, str) and part for part in dump[step])
                for step in ("dump", "restore", "verify")
            )
        ):
            raise BackupError("capture", "source-unsupported")
    # Owners with a dump keep running to dump; finished one-shots stay stopped.
    running_services = (
        set(pause_services)
        | ({postgres} if postgres else set())
        | {dump["service"] for dump in dumps}
    )
    if (
        set(definition["services"]) != running_services | set(one_shot)
        or not pause_services
    ):
        raise BackupError("capture", "source-unsupported")
    ids = source_containers(command, root, config)
    states = container_states(command, ids)
    if (
        {v["service"] for v in states.values()} != running_services
        or len(states) != len(running_services)
        or not all(v["running"] for v in states.values())
    ):
        raise BackupError("capture", "source-not-running")
    verify_source_identity(config, states, definition)
    consumers = {v["service"]: (container, v) for container, v in states.items()}
    project = compose_project(config["deploymentId"])
    # A dumped volume is captured through its owner, never copied as files.
    dumped = {project + "_" + dump["volume"] for dump in dumps}
    postgres_volume = project + "_" + (plan.get("postgresVolume") or "database")
    expected_mounts = {}
    sources = {}
    for volume in volumes:
        name = volume.get("name", "")
        sqlite = volume.get("sqlite")
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", name) or name in sources:
            raise BackupError("capture", "source-unsupported")
        if sqlite is not None and (
            not isinstance(sqlite, str)
            or not sqlite
            or Path(sqlite).is_absolute()
            or ".." in Path(sqlite).parts
        ):
            raise BackupError("capture", "source-unsupported")
        if volume.get("kind") not in {"files", "database"} or (
            volume["kind"] == "database"
            and not sqlite
            and volume.get("capture") != "quiesced-files"
        ):
            raise BackupError("capture", "source-unsupported")
        for mount in volume.get("mounts", []):
            service = mount.get("service")
            # A finished one-shot service is stopped and mounts nothing live.
            if service in one_shot:
                continue
            if service not in pause_services:
                raise BackupError("capture", "source-unsupported")
            key = (service, mount.get("target"))
            if key in expected_mounts:
                raise BackupError("capture", "source-unsupported")
            expected_mounts[key] = (name, bool(mount.get("readOnly")))
        sources[name] = None
    bindings = {}
    seen = set()
    for service, (_, meta) in consumers.items():
        if meta["image"] != definition["services"][service].get("image"):
            raise BackupError("capture", "source-identity-mismatch")
        for mount in meta["mounts"]:
            if mount["Type"] == "volume":
                if mount["Name"] in dumped:
                    continue
                if service == postgres:
                    if mount["Name"] != postgres_volume:
                        raise BackupError("capture", "source-unsupported")
                    continue
                key = (service, mount["Destination"])
                wanted = expected_mounts.get(key)
                if (
                    not wanted
                    or mount["Name"]
                    != compose_project(config["deploymentId"]) + "_" + wanted[0]
                    or bool(mount.get("RW")) == wanted[1]
                ):
                    raise BackupError("capture", "source-unsupported")
                seen.add(key)
                source = Path(mount["Source"])
                if sources[wanted[0]] not in {None, source}:
                    raise BackupError("capture", "source-unsupported")
                sources[wanted[0]] = source
            elif mount["Type"] == "bind":
                path = Path(mount["Source"])
                if (
                    mount.get("RW")
                    or not path.is_relative_to(root)
                    or path.is_symlink()
                    or not path.is_file()
                ):
                    raise BackupError("capture", "source-unsupported")
                bindings[str(path.relative_to(root))] = path
            else:
                raise BackupError("capture", "source-unsupported")
    if seen != set(expected_mounts) or any(
        source is None for source in sources.values()
    ):
        raise BackupError("capture", "source-unsupported")
    module = helper_module()
    # Inventory before following paths; reject links and unsupported special files.
    for source in sources.values():
        if source.is_symlink() or not source.is_dir():
            raise BackupError("capture", "source-unsupported")
        try:
            module.inventory(source)
        except RuntimeError as error:
            raise BackupError("capture", "source-unsupported") from error
    # A service outside this application must not keep writing a captured volume.
    for name in sources:
        full_name = compose_project(config["deploymentId"]) + "_" + name
        attached = (
            command(
                "docker",
                "ps",
                "--quiet",
                "--no-trunc",
                "--filter",
                "volume=" + full_name,
            )
            .decode()
            .split()
        )
        foreign = [container for container in attached if container not in states]
        for other in (
            json.loads(command("docker", "inspect", *foreign)) if foreign else []
        ):
            if any(
                m.get("Name") == full_name and m.get("RW")
                for m in other.get("Mounts", [])
            ):
                raise BackupError("capture", "source-unsupported")
    paused = [consumers[name][0] for name in pause_services]
    journal = {
        "version": VERSION,
        "kind": "source",
        "runId": run_id,
        "deploymentId": config["deploymentId"],
        "stopped": paused,
        "stoppedAt": iso(now()),
        "complete": False,
        "stageRemoved": True,
    }
    state.save_journal(journal)
    stage = staging / "snapshot"
    (stage / "configuration").mkdir(parents=True, mode=0o700)
    manifest = {
        "version": VERSION,
        "kind": "stack",
        "deploymentId": config["deploymentId"],
        "runId": run_id,
        "revision": config["revision"],
        "capture": plan,
        "sqlite": {},
        "method": ", ".join(
            ["quiesced application services and volume files"]
            + (["SQLite backup API"] if any(v.get("sqlite") for v in volumes) else [])
            + (["managed PostgreSQL dump"] if postgres else [])
            + (["declared owner dumps"] if dumps else [])
        ),
    }
    started = now()
    try:
        try:
            # Stop dependents before dependencies so workers can finish with
            # their broker/database still available. The journal covers all.
            for container in paused:
                command("docker", "stop", "--time", "120", container, timeout=150)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            raise BackupError("capture", "capture-failed") from error
        stopped = json.loads(command("docker", "inspect", *paused))
        if any(
            c["State"]["Running"] or c["State"]["ExitCode"] not in {0, 143}
            for c in stopped
        ):
            raise BackupError("capture", "source-stop-failed")
        manifest["stoppedServices"] = {
            c["Config"]["Labels"]["com.docker.compose.service"]: c["State"]["ExitCode"]
            for c in stopped
        }
        quiesced = now()
        manifest["recoveryPointAt"] = iso(quiesced)
        shutil.copy2(root / "compose.json", stage / "configuration/compose.json")
        for relative, source in bindings.items():
            target = stage / "configuration" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        for volume in volumes:
            source = sources[volume["name"]]
            module.inventory(source)
            target = stage / "state" / volume["name"]
            sqlite = volume.get("sqlite")
            excluded = (
                {
                    source / (sqlite + suffix)
                    for suffix in ("", "-wal", "-shm", "-journal")
                }
                if sqlite
                else set()
            )
            shutil.copytree(
                source,
                target,
                ignore=lambda directory, names: [
                    name for name in names if Path(directory) / name in excluded
                ],
            )
            if sqlite:
                original = source / sqlite
                expected = module.sqlite_evidence(original)
                with (
                    closing(
                        sqlite3.connect(f"file:{original}?mode=ro", uri=True)
                    ) as reader,
                    closing(sqlite3.connect(target / sqlite)) as writer,
                ):
                    reader.backup(writer, pages=256)
                    writer.execute("PRAGMA journal_mode=DELETE")
                shutil.copystat(original, target / sqlite)
                if module.sqlite_evidence(target / sqlite) != expected:
                    raise BackupError("capture", "capture-failed")
                manifest["sqlite"][volume["name"] + "/" + sqlite] = expected
            for path in [source, *source.rglob("*")]:
                dest = target / path.relative_to(source)
                if dest.exists():
                    stat = path.stat()
                    os.chown(dest, stat.st_uid, stat.st_gid)
        if postgres:
            container, meta = consumers[postgres]
            manifest["postgres"] = capture_postgres_database(
                container, meta, stage, command
            )
        # Owners dump while every writer is stopped: one recovery point.
        for dump in dumps:
            container, meta = consumers[dump["service"]]
            manifest.setdefault("dumps", {})[dump["volume"]] = (
                capture_declared_dump(container, meta, dump, stage, command)
            )
    finally:
        restore_source(command, state, journal)
    pause = now() - started
    manifest["files"] = module.inventory(stage)
    (stage / "manifest.json").write_text(json.dumps(manifest, indent=2))
    archive = staging / "archive.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for child in sorted(stage.iterdir()):
            bundle.add(child, arcname=child.name)
    os.chmod(archive, 0o600)
    remove_tree(stage)
    return {
        "path": archive,
        "bytes": archive.stat().st_size,
        "sha256": sha256(archive),
        "pauseSeconds": pause,
        "capturedAt": quiesced,
    }


def capture_postgres_database(container, meta, stage, command):
    try:
        user = source_environment(meta["environment"], "POSTGRES_USER")
        name = source_environment(meta["environment"], "POSTGRES_DB")
        if not IDENTIFIER_PATTERN.match(user or "") or not IDENTIFIER_PATTERN.match(
            name or ""
        ):
            raise BackupError("capture", "source-unsupported")
        version = int(
            command(
                "docker",
                "exec",
                container,
                "psql",
                "-U",
                user,
                "-d",
                name,
                "-tAqc",
                "SHOW server_version_num",
            )
            .decode()
            .strip()
        )
        (stage / "database").mkdir(parents=True, exist_ok=True, mode=0o700)
        dump = stage / "database/dump.pgc"
        command(
            "docker",
            "exec",
            container,
            "pg_dump",
            "-U",
            user,
            "-d",
            name,
            "--format=custom",
            "--no-owner",
            "--no-acl",
            stdout=dump,
            timeout=CAPTURE_TIMEOUT,
        )
        os.chmod(dump, 0o600)
        with dump.open("rb") as stream:
            if stream.read(5) != b"PGDMP":
                raise BackupError("capture", "capture-failed")
        return {
            "service": meta["service"],
            "image": meta["image"],
            "majorVersion": version // 10000,
            "user": user,
            "database": name,
        }
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        ValueError,
    ) as error:
        raise BackupError("capture", "capture-failed") from error


def capture_declared_dump(container, meta, dump, stage, command):
    """An owner's own dump and content fingerprint, taken during the pause.

    Both are commands from the recorded plan, run in the owner's container
    with its environment; nothing here passes through a shell.
    """
    (stage / "database").mkdir(parents=True, exist_ok=True, mode=0o700)
    target = stage / "database" / (dump["volume"] + ".dump")
    try:
        command(
            "docker",
            "exec",
            container,
            *dump["dump"],
            stdout=target,
            timeout=CAPTURE_TIMEOUT,
        )
        os.chmod(target, 0o600)
        fingerprint = command(
            "docker", "exec", container, *dump["verify"], timeout=COMMAND_TIMEOUT
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise BackupError("capture", "capture-failed") from error
    if not target.stat().st_size or len(fingerprint) > 64 * 1024:
        raise BackupError("capture", "capture-failed")
    return {
        "service": meta["service"],
        "image": meta["image"],
        "target": dump["target"],
        "bytes": target.stat().st_size,
        "sha256": sha256(target),
        "fingerprint": fingerprint.decode("utf-8", "replace"),
    }


def verify_declared_dump_restore(
    extracted, manifest, declared, restore, run_id, command, names
):
    """Load an owner's dump into a fresh instance and compare its content.

    The instance runs the recorded image with the owner's environment from
    the archived configuration, on its own labeled volume and no network.
    The restore passes only when the owner's verify command prints exactly
    what it printed from the source at capture: a loaded dump, not a copied
    file, is what proves the database can recover.
    """
    captured = (manifest.get("dumps") or {}).get(declared.get("volume"))
    dump = extracted / "database" / (str(declared.get("volume")) + ".dump")
    if (
        not isinstance(captured, dict)
        or not isinstance(captured.get("image"), str)
        or not isinstance(captured.get("target"), str)
        or not isinstance(captured.get("fingerprint"), str)
        or not dump.is_file()
        or sha256(dump) != captured.get("sha256")
    ):
        raise BackupError("restore", "manifest-mismatch")
    try:
        definition = json.loads((extracted / "configuration/compose.json").read_text())
        service = definition["services"][declared["service"]]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise BackupError("restore", "manifest-mismatch") from error
    try:
        command("docker", "image", "inspect", captured["image"])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise BackupError("restore", "restore-image-unavailable") from error
    # Private values stay off command lines: the owner's environment goes
    # through a private file in this restore's own workspace.
    environment = extracted.parent / "owner.env"
    environment.write_text(
        "".join(
            f"{key}={value}\n"
            for key, value in (service.get("environment") or {}).items()
            if value is not None and "\n" not in str(value)
        )
    )
    os.chmod(environment, 0o600)
    entrypoint = service.get("entrypoint")
    arguments = service.get("command")
    entrypoint = entrypoint if isinstance(entrypoint, list) else []
    arguments = arguments if isinstance(arguments, list) else []
    name, volume = names["container"], names["volume"]
    command(
        "docker", "volume", "create", "--label", RESTORE_LABEL + "=" + run_id, volume
    )
    command(
        "docker",
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        "none",
        "--label",
        RESTORE_LABEL + "=" + run_id,
        "--memory",
        "1g",
        "--cpus",
        "1",
        "--env-file",
        str(environment),
        "--volume",
        volume + ":" + captured["target"],
        *(["--entrypoint", entrypoint[0]] if entrypoint else []),
        captured["image"],
        *entrypoint[1:],
        *arguments,
    )
    payload = dump.read_bytes()
    deadline = now() + RESTORE_TIMEOUT
    while True:
        try:
            command(
                "docker",
                "exec",
                "--interactive",
                name,
                *declared["restore"],
                input=payload,
                timeout=RESTORE_TIMEOUT,
            )
            break
        except subprocess.TimeoutExpired as error:
            raise BackupError("restore", "restore-timeout") from error
        except subprocess.CalledProcessError as error:
            # A fresh server refuses connections while it initializes; a
            # partial load is still caught by the fingerprint below.
            if now() >= deadline:
                raise BackupError("restore", "restore-failed") from error
            time.sleep(2)
    restore["checks"].append("database-restored")
    try:
        fingerprint = command(
            "docker", "exec", name, *declared["verify"], timeout=COMMAND_TIMEOUT
        ).decode("utf-8", "replace")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise BackupError("restore", "database-check-failed") from error
    if fingerprint != captured["fingerprint"]:
        raise BackupError("restore", "database-check-failed")
    restore["checks"].append("database-content")
    restore["measurements"]["databases"] = (
        restore["measurements"].get("databases", 0) + 1
    )


CAPTURES = {
    "sqlite-stack": capture_sqlite_stack,
    "postgres": capture_postgres,
    "stack": capture_stack,
}


def plan_retention(keys, receipts, prefix, keep):
    """Objects this deployment may expire. Everything else is untouchable.

    Only keys inside the managed prefix, only this deployment's own naming, only
    runs recorded locally, never a running run, and never the newest `keep`
    verified successes. An empty keep set expires nothing at all.
    """
    pattern = re.compile(
        re.escape(prefix) + r"[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.tar\.gz"
    )
    successes = sorted(
        (
            receipt
            for receipt in receipts
            if receipt.get("outcome") == "succeeded"
            and receipt.get("objectKey")
            and not receipt.get("expiredAt")
        ),
        key=lambda receipt: receipt.get("startedAt") or "",
        reverse=True,
    )
    retained = {receipt["objectKey"] for receipt in successes[:keep]}
    if not retained:
        return []
    known = {receipt["objectKey"] for receipt in receipts if receipt.get("objectKey")}
    running = {
        receipt["objectKey"]
        for receipt in receipts
        if receipt.get("outcome") == "running" and receipt.get("objectKey")
    }
    expired = []
    for key in sorted(set(keys)):
        if not key.startswith(prefix) or not pattern.fullmatch(key):
            continue
        if key in retained or key in running or key not in known:
            continue
        expired.append(key)
    return expired[:MAX_DELETIONS]


def mark_expired(state, run_id):
    """The archive is gone, so its receipt says so and may finally be pruned."""
    receipt = state.load_receipt(run_id) if run_id else None
    if receipt and not receipt.get("expiredAt"):
        receipt["expiredAt"] = iso(now())
        state.save_receipt(receipt)


def reconcile_expired(state, keys):
    """An archive that is no longer in the bucket is gone, however it went.

    Saying so keeps status from reporting a copy that does not exist, and lets
    the receipt be pruned once it is only paperwork.
    """
    listed = set(keys)
    for receipt in state.history():
        if (
            receipt.get("objectKey")
            and receipt.get("outcome") != "running"
            and not receipt.get("expiredAt")
            and receipt["objectKey"] not in listed
        ):
            mark_expired(state, receipt["id"])


def apply_retention(config, state, storage):
    """Expiry failures are recorded next to a successful backup, not as one."""
    deleted = 0
    try:
        keys, truncated = storage.list_prefix()
        if not truncated:
            reconcile_expired(state, keys)
        history = state.history()
        owners = {
            receipt["objectKey"]: receipt["id"]
            for receipt in history
            if receipt.get("objectKey")
        }
        expired = plan_retention(keys, history, config["prefix"], config["keep"])
        for key in expired:
            storage.delete(key)
            deleted += 1
            mark_expired(state, owners.get(key))
    except Exception:  # noqa: BLE001 - expiry never turns a verified backup into a failure
        return {"deleted": deleted, "failed": True}
    return {"deleted": deleted, "failed": False}


def new_receipt(config, run_id, started):
    return {
        "version": VERSION,
        "id": run_id,
        "applicationId": config["applicationId"],
        "deploymentId": config["deploymentId"],
        "revision": config["revision"],
        "kind": config["kind"],
        "startedAt": iso(started),
        "capturedAt": None,
        "finishedAt": None,
        "outcome": "running",
        "phase": "capture",
        "bytes": None,
        "sha256": None,
        "objectKey": None,
        "sourcePauseSeconds": None,
        "errorCode": None,
        "retention": {"deleted": 0, "failed": False},
        "restore": None,
    }


def perform_run(
    config, state, storage_factory=make_storage, command=run_command, capture=None
):
    run_id = str(uuid.uuid4())
    receipt = new_receipt(config, run_id, now())
    # Durable before any effect: a run that dies mid-capture is still a run.
    state.save_receipt(receipt)
    staging = state.stage(run_id)
    try:
        receipt["phase"] = "credentials"
        state.save_receipt(receipt)
        storage = storage_factory(config)
        receipt["phase"] = "capture"
        state.save_receipt(receipt)
        captured = (capture or CAPTURES[config["kind"]])(
            config, state, run_id, command, staging
        )
        receipt["capturedAt"] = iso(captured["capturedAt"])
        receipt["sourcePauseSeconds"] = round(float(captured["pauseSeconds"]), 3)
        receipt["bytes"] = captured["bytes"]
        receipt["sha256"] = captured["sha256"]
        receipt["phase"] = "upload"
        receipt["objectKey"] = storage.key_for(run_id)
        state.save_receipt(receipt)
        try:
            storage.upload(captured["path"], receipt["objectKey"])
        except Exception:
            if not storage.abort_multipart(receipt["objectKey"]):
                receipt["pendingCleanup"] = True
            raise
        receipt["phase"] = "verify"
        state.save_receipt(receipt)
        downloaded = staging / "verify.tar.gz"
        try:
            storage.download(receipt["objectKey"], downloaded)
        except BackupError:
            raise
        except Exception as error:
            raise BackupError("verify", classify(error, "verify")) from error
        verify_copy(downloaded, receipt["bytes"], receipt["sha256"])
        # Verified off host. Only now may anything be expired.
        receipt["outcome"] = "succeeded"
        receipt["phase"] = "retention"
        state.save_receipt(receipt)
        receipt["retention"] = apply_retention(config, state, storage)
        receipt["phase"] = "complete"
    except Exception as error:  # noqa: BLE001 - every failure becomes a bounded code
        receipt["outcome"] = "failed"
        receipt["phase"] = getattr(error, "phase", receipt["phase"])
        receipt["errorCode"] = classify(error, receipt["phase"])
    finally:
        if not remove_tree(staging):
            receipt["pendingCleanup"] = True
        receipt["finishedAt"] = iso(now())
        state.save_receipt(receipt)
        try:
            state.prune()
        except OSError:
            pass
    return receipt


def recover_source(state, journal, command):
    """Restart what this capture stopped and clear the snapshot it staged."""
    if not journal.get("complete"):
        try:
            journal["restarted"] = restart_recorded(command, journal)[0]
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            # The daemon did not answer, so nothing is known and nothing is
            # concluded. The journal stays open for the next attempt.
            journal["complete"] = False
        journal["restartedAt"] = iso(now())
    stage = helper_stage(journal["runId"])
    journal["stageRemoved"] = remove_tree(stage) if stage.exists() else True
    state.save_journal(journal)
    return {
        "runId": journal["runId"],
        "stopped": len(journal.get("stopped", [])),
        "restarted": int(journal.get("restarted") or 0),
        "complete": bool(journal.get("complete")),
    }


def remove_owned(command, kind, name, run_id):
    """Remove one disposable resource, and only when it says it is ours.

    True when it was removed, False when nothing of ours is there, and None
    when removal failed and the leftover is still owed.
    """
    inspect = ("docker", "inspect", name)
    if kind == "volume":
        inspect = ("docker", "volume", "inspect", name)
    try:
        described = json.loads(command(*inspect))
    except subprocess.CalledProcessError as error:
        detail = error.stderr or b""
        if isinstance(detail, bytes):
            detail = detail.decode(errors="replace")
        # Only an explicit absence is a clean result. An unavailable daemon
        # leaves ownership unknown and must keep the cleanup journal open.
        if "no such" in detail.lower():
            return False
        return None
    except (subprocess.TimeoutExpired, ValueError):
        return None
    if not described:
        return False
    entry = described[0]
    labels = (entry.get("Config") or entry).get("Labels") or {}
    if labels.get(RESTORE_LABEL) != run_id:
        return False
    remove = ("docker", "rm", "--force", "--volumes", name)
    if kind == "volume":
        remove = ("docker", "volume", "rm", "--force", name)
    try:
        command(*remove)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None
    return True


def recover_restore(state, journal, command):
    """Drop the disposable resources an interrupted restore recorded."""
    run_id = journal["runId"]
    # Generated, never read from the record: recovery deletes these.
    names = restore_names(run_id)
    removed = 0
    cleaned = True
    for kind in ("container", "volume"):
        outcome = remove_owned(command, kind, names[kind], run_id)
        if outcome is None:
            cleaned = False
        elif outcome:
            removed += 1
    if not remove_tree(state.staging / names["stage"]):
        cleaned = False
    journal["removed"] = removed
    journal["complete"] = cleaned
    journal["recoveredAt"] = iso(now())
    receipt = state.load_receipt(run_id)
    if receipt and receipt.get("restoreInProgress"):
        receipt["restoreInProgress"] = False
        receipt["restore"] = {
            "at": journal.get("startedAt") or iso(now()),
            "recoveryPointAt": None,
            "outcome": "failed",
            "scope": journal.get("scope"),
            "checks": [],
            "measurements": {},
            "cleanupComplete": cleaned,
            "errorCode": "interrupted",
        }
        if not cleaned:
            receipt["pendingCleanup"] = True
        state.save_receipt(receipt)
    if receipt and receipt.get("restore"):
        receipt["restore"]["cleanupComplete"] = cleaned
        if not cleaned:
            receipt["pendingCleanup"] = True
        state.save_receipt(receipt)
    if cleaned:
        state.drop_journal(journal)
    else:
        state.save_journal(journal)
    return {"runId": run_id, "removed": removed, "complete": cleaned}


def recover_run(state, receipt, storage):
    """Close a run that never finished, and clear what it left behind."""
    cleaned = remove_tree(state.staging / receipt["id"])
    if receipt.get("objectKey"):
        # A killed upload can leave parts billing away. Abandon this key's
        # parts and nothing else.
        cleaned = (
            bool(storage and storage.abort_multipart(receipt["objectKey"])) and cleaned
        )
    if receipt.get("outcome") == "running":
        receipt["outcome"] = "failed"
        receipt["errorCode"] = "interrupted"
        receipt["finishedAt"] = iso(now())
    if any(
        journal["runId"] == receipt["id"] and not journal.get("complete")
        for journal in state.journals()
    ):
        cleaned = False
    if receipt.get("restore") and not receipt["restore"].get("cleanupComplete"):
        cleaned = False
    receipt["pendingCleanup"] = not cleaned
    state.save_receipt(receipt)
    return {"runId": receipt["id"], "cleanupComplete": cleaned}


def perform_recovery(config, state, command=run_command, storage_factory=make_storage):
    journals = []
    restores = []
    for journal in state.journals():
        if journal["kind"] == "restore":
            restores.append(recover_restore(state, journal, command))
        else:
            journals.append(recover_source(state, journal, command))
    # Not every interrupted run stopped a container: a PostgreSQL capture or a
    # killed upload leaves only a receipt, and it still owns cleanup.
    unfinished = [
        receipt
        for receipt in state.history()
        if receipt.get("outcome") == "running" or receipt.get("pendingCleanup")
    ]
    storage = None
    if any(receipt.get("objectKey") for receipt in unfinished):
        try:
            storage = storage_factory(config)
        except Exception:  # noqa: BLE001 - unreachable storage stays pending, not fatal
            storage = None
    interrupted = [recover_run(state, receipt, storage) for receipt in unfinished]
    return {
        "version": VERSION,
        "applicationId": config["applicationId"],
        "deploymentId": config["deploymentId"],
        "journals": journals,
        "restores": restores,
        "interrupted": interrupted,
        "cleanupPending": state.cleanup_pending(),
    }


RECEIPT_FIELDS = (
    "version",
    "id",
    "applicationId",
    "deploymentId",
    "revision",
    "kind",
    "startedAt",
    "capturedAt",
    "finishedAt",
    "outcome",
    "phase",
    "bytes",
    "sha256",
    "objectKey",
    "sourcePauseSeconds",
    "errorCode",
    "expiredAt",
)


def sanitize_restore(restore):
    if not isinstance(restore, dict):
        return None
    measurements = restore.get("measurements")
    outcome = restore.get("outcome")
    code = restore.get("errorCode")
    return {
        "at": restore.get("at"),
        "recoveryPointAt": restore.get("recoveryPointAt"),
        "outcome": outcome if outcome in {"verified", "failed"} else "failed",
        "scope": restore.get("scope"),
        "checks": [
            check for check in restore.get("checks") or [] if check in CHECK_LABELS
        ],
        "measurements": {
            name: int(value)
            for name, value in (measurements or {}).items()
            if name in {"files", "tables", "rows"} and isinstance(value, int)
        },
        "cleanupComplete": bool(restore.get("cleanupComplete")),
        "errorCode": code if code in ERROR_CODES else None,
    }


def sanitize_receipt(receipt):
    """A whitelist, so nothing an inner layer records can leak outward."""
    result = {name: receipt.get(name) for name in RECEIPT_FIELDS}
    if result["outcome"] not in {"running", "succeeded", "failed"}:
        result["outcome"] = "failed"
    if result["phase"] not in PHASES:
        result["phase"] = "complete" if result["outcome"] == "succeeded" else "config"
    if result["errorCode"] not in ERROR_CODES:
        result["errorCode"] = (
            None if result["outcome"] != "failed" else "unexpected-error"
        )
    retention = receipt.get("retention") or {}
    result["retention"] = {
        "deleted": int(retention.get("deleted") or 0),
        "failed": bool(retention.get("failed")),
    }
    result["restoreInProgress"] = bool(receipt.get("restoreInProgress"))
    result["restore"] = sanitize_restore(receipt.get("restore"))
    return result


def status_runs(receipts):
    """The newest runs, bounded, still carrying the evidence policy needs.

    A long failure streak must not push the last archive that actually exists
    or the last verified restore out of the window: those two answer "are we
    protected" and "has it ever been proven".
    """
    live = next(
        (
            receipt
            for receipt in receipts
            if receipt.get("outcome") == "succeeded"
            and receipt.get("objectKey")
            and not receipt.get("expiredAt")
        ),
        None,
    )
    restored = next(
        (
            receipt
            for receipt in receipts
            if (receipt.get("restore") or {}).get("outcome") == "verified"
        ),
        None,
    )
    chosen = {receipt["id"]: receipt for receipt in (live, restored) if receipt}
    for receipt in receipts:
        if len(chosen) >= HISTORY_LIMIT:
            break
        chosen.setdefault(receipt["id"], receipt)
    return sorted(
        chosen.values(),
        key=lambda receipt: receipt.get("startedAt") or "",
        reverse=True,
    )


def build_status(config, state):
    return {
        "version": VERSION,
        "applicationId": config["applicationId"],
        "deploymentId": config["deploymentId"],
        "runs": [sanitize_receipt(receipt) for receipt in status_runs(state.history())],
        "cleanupPending": state.cleanup_pending(),
    }


def verify_sqlite_restore(extracted, manifest, restore, require_database=True):
    """Offline: every captured file and the database itself, against capture."""
    module = helper_module()
    files = manifest.get("files") or {}
    if not files:
        raise BackupError("restore", "manifest-mismatch")
    for name, expected in files.items():
        candidate = extracted / name
        if (
            Path(name).is_absolute()
            or ".." in Path(name).parts
            or not candidate.is_file()
        ):
            raise BackupError("restore", "manifest-mismatch")
        if sha256(candidate) != expected:
            raise BackupError("restore", "database-check-failed")
    restore["checks"].append("file-inventory")
    restore["measurements"]["files"] = len(files)
    databases = manifest.get("sqlite") or {}
    if not databases:
        if require_database:
            raise BackupError("restore", "manifest-mismatch")
        return
    tables = 0
    rows = 0
    for name, expected in databases.items():
        path = extracted / "state" / name
        if Path(name).is_absolute() or ".." in Path(name).parts or not path.is_file():
            raise BackupError("restore", "manifest-mismatch")
        try:
            # Runs integrity_check and foreign_key_check on the restored copy.
            evidence = module.sqlite_evidence(path)
        except Exception as error:
            raise BackupError("restore", "database-check-failed") from error
        if evidence.get("schemaSha256") != expected.get("schemaSha256"):
            raise BackupError("restore", "database-check-failed")
        if evidence.get("tables") != expected.get("tables"):
            raise BackupError("restore", "database-check-failed")
        tables += len(evidence.get("tables") or {})
        rows += sum(table["rows"] for table in evidence.get("tables", {}).values())
    restore["checks"].extend(["database-integrity", "database-schema", "database-rows"])
    restore["measurements"]["tables"] = (
        restore["measurements"].get("tables", 0) + tables
    )
    restore["measurements"]["rows"] = restore["measurements"].get("rows", 0) + rows


POSTGRES_COUNT_SQL = (
    "SELECT count(*), coalesce(sum(rows), 0) FROM (SELECT (xpath('/row/c/text()', "
    "query_to_xml(format('SELECT count(*) AS c FROM %I.%I', schemaname, tablename), "
    "false, true, '')))[1]::text::bigint AS rows FROM pg_tables WHERE schemaname NOT IN "
    "('pg_catalog', 'information_schema')) counted"
)
POSTGRES_SCHEMA_SQL = (
    "SELECT count(*) FROM pg_class WHERE relnamespace NOT IN "
    "('pg_catalog'::regnamespace, 'information_schema'::regnamespace)"
)


def verify_postgres_restore(extracted, manifest, restore, run_id, command, names):
    """Restore into a disposable container on its own volume and no network."""
    details = manifest.get("postgres") or {}
    image = details.get("image")
    user = details.get("user")
    database = details.get("database")
    major = details.get("majorVersion")
    if (
        not isinstance(image, str)
        or not IDENTIFIER_PATTERN.match(user or "")
        or not IDENTIFIER_PATTERN.match(database or "")
        or not isinstance(major, int)
    ):
        raise BackupError("restore", "manifest-mismatch")
    dump = extracted / "database/dump.pgc"
    if not dump.is_file():
        raise BackupError("restore", "manifest-mismatch")
    try:
        command("docker", "image", "inspect", image)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise BackupError("restore", "restore-image-unavailable") from error
    name = names["container"]
    volume = names["volume"]
    data = "/var/lib/postgresql" if major >= 18 else "/var/lib/postgresql/data"
    command(
        "docker",
        "volume",
        "create",
        "--label",
        RESTORE_LABEL + "=" + run_id,
        volume,
    )
    command(
        "docker",
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        "none",
        "--label",
        RESTORE_LABEL + "=" + run_id,
        "--memory",
        "512m",
        "--cpus",
        "1",
        "--env",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "--env",
        "POSTGRES_USER=" + user,
        "--env",
        "POSTGRES_DB=" + database,
        "--volume",
        volume + ":" + data,
        image,
    )
    deadline = now() + 120
    while True:
        try:
            command("docker", "exec", name, "pg_isready", "-U", user, "-d", database)
            break
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            if now() >= deadline:
                raise BackupError("restore", "restore-failed") from error
            time.sleep(1)
    command("docker", "cp", str(dump), name + ":/tmp/dump.pgc")
    try:
        command(
            "docker",
            "exec",
            name,
            "pg_restore",
            "--exit-on-error",
            "--no-owner",
            "--no-acl",
            "-U",
            user,
            "-d",
            database,
            "/tmp/dump.pgc",
            timeout=RESTORE_TIMEOUT,
        )
    except subprocess.CalledProcessError as error:
        raise BackupError("restore", "restore-failed") from error
    restore["checks"].append("database-restored")
    measured = (
        command(
            "docker",
            "exec",
            name,
            "psql",
            "-U",
            user,
            "-d",
            database,
            "-tAqc",
            POSTGRES_COUNT_SQL,
        )
        .decode()
        .strip()
        .split("|")
    )
    tables, rows = int(measured[0]), int(measured[1])
    restore["measurements"]["tables"] = (
        restore["measurements"].get("tables", 0) + tables
    )
    restore["measurements"]["rows"] = restore["measurements"].get("rows", 0) + rows
    if tables:
        restore["checks"].append("database-tables")
        return
    objects = int(
        command(
            "docker",
            "exec",
            name,
            "psql",
            "-U",
            user,
            "-d",
            database,
            "-tAqc",
            POSTGRES_SCHEMA_SQL,
        )
        .decode()
        .strip()
    )
    if not objects:
        raise BackupError("restore", "database-check-failed")
    restore["checks"].append("database-empty")


def perform_test_restore(
    config, state, run_id, storage_factory=make_storage, command=run_command
):
    """Fetch the recorded archive again and restore it somewhere disposable."""
    receipt = state.load_receipt(run_id)
    if receipt is None:
        raise BackupError("restore", "run-not-found")
    if receipt.get("outcome") != "succeeded" or not receipt.get("objectKey"):
        raise BackupError("restore", "run-not-restorable")
    restore = {
        "at": iso(now()),
        "recoveryPointAt": None,
        "outcome": "failed",
        "scope": (
            "offline-database-and-files"
            if receipt.get("kind") in {"sqlite-stack", "stack"}
            else "offline-database"
        ),
        "checks": [],
        "measurements": {},
        "cleanupComplete": False,
        "errorCode": None,
    }
    names = restore_names(run_id)
    journal = {
        "version": VERSION,
        "kind": "restore",
        "runId": run_id,
        "deploymentId": config["deploymentId"],
        "container": names["container"],
        "volume": names["volume"],
        "scope": restore["scope"],
        "startedAt": restore["at"],
        "complete": False,
    }
    # Durable before a container, a volume or even a directory exists, so a
    # SIGKILL from here on leaves --recover something exact to clean up.
    state.save_journal(journal)
    receipt["restoreInProgress"] = True
    state.save_receipt(receipt)
    workspace = state.stage(names["stage"])
    try:
        storage = storage_factory(config)
        archive = workspace / "archive.tar.gz"
        try:
            storage.download(receipt["objectKey"], archive)
        except BackupError:
            raise
        except Exception as error:
            raise BackupError("restore", "download-failed") from error
        try:
            verify_copy(archive, receipt["bytes"], receipt["sha256"])
        except BackupError as error:
            raise BackupError("restore", "verify-mismatch") from error
        restore["checks"].append("archive-hash")
        extracted = workspace / "extracted"
        safe_extract(archive, extracted)
        restore["checks"].append("archive-structure")
        try:
            manifest = json.loads((extracted / "manifest.json").read_text())
        except (OSError, ValueError) as error:
            raise BackupError("restore", "manifest-mismatch") from error
        identity = manifest.get("runId") or manifest.get("proofId")
        if manifest.get("deploymentId") != config["deploymentId"] or identity != run_id:
            raise BackupError("restore", "manifest-mismatch")
        restore["checks"].append("backup-identity")
        if receipt["kind"] == "stack":
            if manifest.get("kind") != "stack" or not manifest.get("capture"):
                raise BackupError("restore", "manifest-mismatch")
            expected_sqlite = {
                v["name"] + "/" + v["sqlite"]
                for v in manifest["capture"].get("volumes", [])
                if v.get("sqlite")
            }
            if expected_sqlite != set(manifest.get("sqlite", {})):
                raise BackupError("restore", "manifest-mismatch")
            restore["recoveryPointAt"] = manifest.get("recoveryPointAt")
            verify_sqlite_restore(extracted, manifest, restore, require_database=False)
            if manifest["capture"].get("postgres"):
                verify_postgres_restore(
                    extracted, manifest, restore, run_id, command, names
                )
            for index, declared in enumerate(manifest["capture"].get("dumps") or []):
                # One disposable instance at a time under the recorded names,
                # so recovery always knows exactly what to remove.
                if index or manifest["capture"].get("postgres"):
                    for kind in ("container", "volume"):
                        if remove_owned(command, kind, names[kind], run_id) is None:
                            raise BackupError("restore", "restore-failed")
                verify_declared_dump_restore(
                    extracted, manifest, declared, restore, run_id, command, names
                )
        elif receipt["kind"] == "sqlite-stack":
            restore["recoveryPointAt"] = iso(float(manifest["stopStartedAt"]))
            verify_sqlite_restore(extracted, manifest, restore)
        else:
            restore["recoveryPointAt"] = manifest.get("recoveryPointAt")
            verify_postgres_restore(
                extracted, manifest, restore, run_id, command, names
            )
        restore["outcome"] = "verified"
    except Exception as error:  # noqa: BLE001 - every failure becomes a bounded code
        restore["errorCode"] = classify(error, "restore")
    finally:
        # Cleanup is reported, not conflated with the restore verdict.
        cleaned = True
        # Inspect even after a create command failed: it may have created a
        # resource before its response was lost. Names and labels both match.
        if receipt["kind"] in {"postgres", "stack"}:
            for kind in ("container", "volume"):
                if remove_owned(command, kind, names[kind], run_id) is None:
                    cleaned = False
        restore["cleanupComplete"] = remove_tree(workspace) and cleaned
        receipt["restore"] = restore
        receipt["restoreInProgress"] = False
        if not restore["cleanupComplete"]:
            receipt["pendingCleanup"] = True
        state.save_receipt(receipt)
        journal["complete"] = restore["cleanupComplete"]
        if journal["complete"]:
            state.drop_journal(journal)
        else:
            state.save_journal(journal)
    return receipt


def report(value, stream=None):
    print(json.dumps(value, sort_keys=True), file=stream or sys.stdout)


def main(argv):
    arguments = argv[1:]
    if not arguments or arguments[0].startswith("-"):
        report(
            {"version": VERSION, "outcome": "failed", "errorCode": "config-invalid"},
            sys.stderr,
        )
        return 1
    try:
        config = load_config(arguments[0])
    except BackupError as error:
        report(
            {
                "version": VERSION,
                "outcome": "failed",
                "phase": error.phase,
                "errorCode": error.code,
            },
            sys.stderr,
        )
        return 1
    rest = arguments[1:]
    state = State(config)
    if rest[:1] == ["--status"] and len(rest) == 1:
        report(build_status(config, state))
        return 0
    if rest[:1] == ["--recover"] and len(rest) == 1:
        # Recovery restarts containers and closes runs, so it needs the same
        # lock as everything else. It waits briefly, because systemd starts it
        # as the run that held the lock is exiting, but it never proceeds
        # without it: the holder may be a live deploy or a live backup.
        descriptor = acquire_lock(config["deploymentId"], wait=RECOVERY_LOCK_WAIT)
        if descriptor is None:
            report({"version": VERSION, "errorCode": "lock-unavailable"}, sys.stderr)
            return 75
        try:
            report(perform_recovery(config, state))
        finally:
            os.close(descriptor)
        return 0
    if rest[:1] == ["--test-restore"] and len(rest) == 2:
        descriptor = acquire_lock(config["deploymentId"])
        if descriptor is None:
            report({"version": VERSION, "errorCode": "lock-unavailable"}, sys.stderr)
            return 75
        try:
            receipt = perform_test_restore(config, state, rest[1])
        except BackupError as error:
            report(
                {"version": VERSION, "phase": error.phase, "errorCode": error.code},
                sys.stderr,
            )
            return 1
        finally:
            os.close(descriptor)
        report(sanitize_receipt(receipt))
        return 0 if receipt["restore"]["outcome"] == "verified" else 1
    if rest:
        report(
            {"version": VERSION, "outcome": "failed", "errorCode": "config-invalid"},
            sys.stderr,
        )
        return 1
    descriptor = acquire_lock(config["deploymentId"])
    if descriptor is None:
        # No run happened, so no run is recorded.
        report({"version": VERSION, "errorCode": "lock-unavailable"}, sys.stderr)
        return 75
    try:
        receipt = perform_run(config, state)
    finally:
        os.close(descriptor)
    report(sanitize_receipt(receipt))
    return 0 if receipt["outcome"] == "succeeded" else 1


def guarded(argv):
    """A traceback would print host paths, so nothing escapes uncaught."""
    try:
        return main(argv)
    except Exception as error:  # noqa: BLE001 - a traceback is the leak this prevents
        report(
            {
                "version": VERSION,
                "outcome": "failed",
                "errorCode": classify(error, "config"),
            },
            sys.stderr,
        )
        return 1


if __name__ == "__main__":
    sys.exit(guarded(sys.argv))
