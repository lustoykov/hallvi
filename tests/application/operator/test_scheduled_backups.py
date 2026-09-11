import importlib.util
import io
import json
import os
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import unittest
import uuid
from contextlib import closing, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load("scheduled_backups_runner", "scripts/scheduled-backups/runner.py")

APPLICATION = "11111111-1111-4111-8111-111111111111"
DEPLOYMENT = "22222222-2222-4222-8222-222222222222"
OTHER_APPLICATION = "33333333-3333-4333-8333-333333333333"
PREFIX = f"scheduled/{APPLICATION}/{DEPLOYMENT}/"
SECRET = "s3cret-access-key-value"
APP, WORKER, JOBS, DATABASE = "a" * 64, "b" * 64, "c" * 64, "d" * 64
DUMP = b"PGDMP" + b"captured rows" * 4


def settings(**overrides):
    value = {
        "version": 1,
        "applicationId": APPLICATION,
        "deploymentId": DEPLOYMENT,
        "revision": "rev-9",
        "kind": "sqlite-stack",
        "endpoint": "https://account.r2.cloudflarestorage.com",
        "region": "auto",
        "bucket": "server-guy-backups",
        "prefix": PREFIX,
        "credentialsFile": "/etc/server-guy/credentials.json",
        "keep": 3,
        "schedule": "*-*-* 03:00:00 Europe/Sofia",
        "timezone": "Europe/Sofia",
    }
    value.update(overrides)
    return value


def write_private(path, value, mode=0o600):
    path = Path(path)
    path.write_text(json.dumps(value))
    path.chmod(mode)
    return path


def receipt(index, outcome="succeeded", run_id=None, **overrides):
    run_id = run_id or str(uuid.uuid4())
    value = {
        "version": 1,
        "id": run_id,
        "applicationId": APPLICATION,
        "deploymentId": DEPLOYMENT,
        "revision": "rev-9",
        "kind": "sqlite-stack",
        "startedAt": f"2026-09-0{index}T03:00:00Z",
        "capturedAt": f"2026-09-0{index}T03:00:05Z",
        "finishedAt": f"2026-09-0{index}T03:00:30Z",
        "outcome": outcome,
        "phase": "complete" if outcome == "succeeded" else "upload",
        "bytes": 1024,
        "sha256": "0" * 64,
        "objectKey": PREFIX + run_id + ".tar.gz",
        "sourcePauseSeconds": 4.0,
        "errorCode": None,
        "retention": {"deleted": 0, "failed": False},
        "restore": None,
    }
    value.update(overrides)
    return value


class FakeClient:
    """The slice of the S3 client the runner uses, with recorded effects."""

    def __init__(self, objects=None, upload_error=None, corrupt=False):
        self.objects = dict(objects or {})
        self.upload_error = upload_error
        self.corrupt = corrupt
        self.deleted = []
        self.aborted = []
        self.multipart = []
        self.multipart_error = None
        self.interrupted_upload = False

    def upload_file(self, path, bucket, key):
        if self.upload_error:
            raise self.upload_error
        self.objects[key] = Path(path).read_bytes()

    def download_file(self, bucket, key, path):
        if key not in self.objects:
            raise LookupError("missing object")
        body = self.objects[key]
        Path(path).write_bytes(body[:-1] + b"x" if self.corrupt else body)

    def list_objects_v2(self, Bucket, Prefix, ContinuationToken=None):
        contents = [
            {"Key": key} for key in sorted(self.objects) if key.startswith(Prefix)
        ]
        return {"Contents": contents, "IsTruncated": False}

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)
        self.objects.pop(Key, None)

    def list_multipart_uploads(self, Bucket, Prefix):
        if self.multipart_error:
            raise self.multipart_error
        uploads = [dict(upload) for upload in self.multipart]
        if self.interrupted_upload:
            uploads.append({"Key": Prefix, "UploadId": "u-interrupted"})
        return {"Uploads": uploads}

    def abort_multipart_upload(self, Bucket, Key, UploadId):
        self.aborted.append(Key)


class FakeDocker:
    """Answers the docker calls the runner makes, and records the writes."""

    def __init__(
        self,
        containers=None,
        services=None,
        mounts=None,
        available=True,
        labels=None,
        named=None,
        volumes=None,
        helper=None,
        exec_results=None,
        images=None,
        exit_codes=None,
    ):
        self.containers = dict(containers or {})
        self.services = dict(services or {})
        self.mounts = dict(mounts or {})
        self.available = available
        self.labels = dict(
            labels
            if labels is not None
            else {
                "server-guy.deployment": DEPLOYMENT,
                "server-guy.revision": "rev-9",
            }
        )
        self.named = dict(named or {})
        self.volumes = dict(volumes or {})
        self.helper = helper
        self.exec_results = dict(exec_results or {})
        self.images = dict(images or {})
        self.exit_codes = dict(exit_codes or {})
        # Containers outside this Compose project that may share its volumes.
        self.foreign = set()
        self.refuse_start = False
        self.exec_running = {}
        self.copied = {}
        self.started = []
        self.removed = []
        self.calls = []

    def __call__(self, *args, input=None, timeout=None, stdout=None):
        self.calls.append(args)
        # A command fed on standard input: record what it received.
        if args[:3] == ("docker", "exec", "--interactive"):
            args = ("docker", "exec", *args[3:])
            if not hasattr(self, "stdin"):
                self.stdin = {}
            self.stdin.setdefault(args[3], []).append(input)
        if self.helper and args[0] == sys.executable:
            return self.helper(args[-2], args[-1])
        if not self.available:
            raise subprocess.CalledProcessError(1, args)
        if args[1:2] == ("compose",):
            return " ".join(self.containers).encode()
        if args[:2] == ("docker", "ps") and "--filter" in args:
            volume = args[-1].removeprefix("volume=")
            return "\n".join(
                container
                for container in [*self.containers, *self.foreign]
                if any(m.get("Name") == volume for m in self.mounts.get(container, []))
            ).encode()
        if args[:2] == ("docker", "ps"):
            return "\n".join(
                f"{container} {'running' if running else 'exited'}"
                for container, running in self.containers.items()
            ).encode()
        if args[:3] == ("docker", "volume", "inspect"):
            if args[3] not in self.volumes:
                raise subprocess.CalledProcessError(1, args, stderr=b"No such volume")
            return json.dumps(
                [{"Name": args[3], "Labels": self.volumes[args[3]]}]
            ).encode()
        if args[:4] == ("docker", "volume", "rm", "--force"):
            self.removed.append(args[4])
            self.volumes.pop(args[4], None)
            return b""
        if args[:2] == ("docker", "inspect"):
            requested = list(args[2:])
            if all(value in self.named for value in requested):
                return json.dumps(
                    [
                        {"Id": value, "Config": {"Labels": self.named[value]}}
                        for value in requested
                    ]
                ).encode()
            if any(
                value not in self.containers and value not in self.foreign
                for value in requested
            ):
                raise subprocess.CalledProcessError(1, args, stderr=b"No such object")
            return json.dumps([self.describe(value) for value in requested]).encode()
        if args[:4] == ("docker", "rm", "--force", "--volumes"):
            self.removed.append(args[4])
            self.named.pop(args[4], None)
            return b""
        if args[:2] == ("docker", "start"):
            if self.refuse_start:
                raise subprocess.CalledProcessError(1, args)
            self.started.append(args[2])
            self.containers[args[2]] = True
            return b""
        if args[:2] == ("docker", "stop"):
            for container in args[4:]:
                self.containers[container] = False
            return b""
        # The disposable restore database, owned through its label.
        if args[:3] == ("docker", "image", "inspect"):
            return b"[]"
        if args[:3] == ("docker", "volume", "create"):
            self.volumes[args[-1]] = dict([args[4].split("=", 1)])
            return b""
        if args[:2] == ("docker", "run"):
            label = args[args.index("--label") + 1].split("=", 1)
            self.named[args[args.index("--name") + 1]] = dict([label])
            return b""
        if args[:2] == ("docker", "cp"):
            self.copied[args[3]] = Path(args[2]).read_bytes()
            return b""
        if (
            args[:2] == ("docker", "exec")
            and args[3:4]
            and args[3] in self.exec_results
        ):
            result = self.exec_results[args[3]]
            self.exec_running[args[3]] = sorted(
                container for container, running in self.containers.items() if running
            )
            if stdout is not None:
                Path(stdout).write_bytes(result)
                return b""
            return result
        raise AssertionError(f"unexpected command {args}")

    def describe(self, container):
        return {
            "Id": container,
            "State": {
                "Running": self.containers.get(container, True),
                "ExitCode": self.exit_codes.get(container, 0),
            },
            "Config": {
                "Labels": {
                    "com.docker.compose.service": self.services.get(container, "app"),
                    **self.labels,
                },
                "Image": self.images.get(
                    container, "louislam/uptime-kuma@sha256:" + "a" * 64
                ),
                "Env": [
                    "POSTGRES_USER=serverguy",
                    "POSTGRES_DB=application",
                    "POSTGRES_PASSWORD=" + SECRET,
                ],
            },
            "Mounts": self.mounts.get(container, []),
        }


def archive_capture(payload=b"reference stack bytes"):
    """A capture that produces a real archive without touching a source host."""

    def capture(config, state, run_id, command, staging):
        archive = Path(staging) / "archive.tar.gz"
        archive.write_bytes(payload)
        return {
            "path": archive,
            "bytes": archive.stat().st_size,
            "sha256": runner.sha256(archive),
            "pauseSeconds": 5.25,
            "capturedAt": runner.now(),
        }

    return capture


class ScheduledBackupTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        # Canonical: the runner refuses a config or source path reached through
        # a symlink, and a temporary directory is one on some platforms.
        self.directory = Path(directory.name).resolve()
        self.state_root = self.directory / "state"
        for name, value in {
            "STATE_ROOT": self.state_root,
            "LOCK_ROOT": self.directory / "lock",
            "SOURCE_ROOT": self.directory / "source",
            "HELPER_STAGE_ROOT": self.directory / "helper",
        }.items():
            patcher = patch.object(runner, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def state(self, config=None):
        return runner.State(config or settings())

    def seed(self, state, receipts):
        for value in receipts:
            state.save_receipt(value)

    # Configuration and scope

    def test_config_rejects_another_applications_prefix(self):
        path = write_private(
            self.directory / "config.json",
            settings(prefix=f"scheduled/{OTHER_APPLICATION}/{DEPLOYMENT}/"),
        )
        with self.assertRaises(runner.BackupError) as raised:
            runner.load_config(path)
        self.assertEqual(raised.exception.code, "identity-mismatch")

    def test_config_rejects_unusable_retention_and_identity(self):
        for overrides in (
            {"keep": 0},
            {"keep": -1},
            {"keep": 91},
            {"keep": "7"},
            {"keep": True},
            {"keep": 7.0},
            {"applicationId": "not-a-uuid"},
            {"kind": "mysql"},
            {"endpoint": "http://account.r2.cloudflarestorage.com"},
            {"credentialsFile": "relative/credentials.json"},
            {"version": 2},
        ):
            path = write_private(self.directory / "config.json", settings(**overrides))
            with self.assertRaises(runner.BackupError, msg=overrides) as raised:
                runner.load_config(path)
            self.assertIn(
                raised.exception.code, {"config-invalid", "identity-mismatch"}
            )

    def test_config_rejects_a_readable_file(self):
        path = write_private(self.directory / "config.json", settings(), mode=0o644)
        with self.assertRaises(runner.BackupError) as raised:
            runner.load_config(path)
        self.assertEqual(raised.exception.code, "config-insecure")

    # Retention

    def test_retention_expires_only_this_prefix_and_only_recorded_runs(self):
        old = [receipt(index) for index in (1, 2, 3, 4, 5)]
        keys = [value["objectKey"] for value in old]
        foreign = [
            "proofs/legacy-proof/stack.tar.gz",
            f"scheduled/{OTHER_APPLICATION}/{DEPLOYMENT}/{uuid.uuid4()}.tar.gz",
            PREFIX + "notes.txt",
            PREFIX + "nested/" + str(uuid.uuid4()) + ".tar.gz",
            PREFIX + str(uuid.uuid4()) + ".tar.gz",
        ]
        expired = runner.plan_retention(keys + foreign, old, PREFIX, 3)
        self.assertEqual(expired, sorted([old[0]["objectKey"], old[1]["objectKey"]]))
        for key in foreign:
            self.assertNotIn(key, expired)

    def test_retention_keeps_every_copy_when_no_success_is_recorded(self):
        failures = [receipt(index, outcome="failed") for index in (1, 2, 3)]
        keys = [value["objectKey"] for value in failures]
        self.assertEqual(runner.plan_retention(keys, failures, PREFIX, 3), [])

    def test_retention_never_expires_a_running_run(self):
        history = [receipt(3), receipt(2), receipt(1, outcome="running")]
        keys = [value["objectKey"] for value in history]
        self.assertEqual(
            runner.plan_retention(keys, history, PREFIX, 1), [history[1]["objectKey"]]
        )

    # Runs

    def test_a_verified_round_trip_succeeds_and_expires_the_oldest(self):
        config = settings(keep=2)
        state = self.state(config)
        history = [receipt(index) for index in (1, 2, 3)]
        self.seed(state, history)
        client = FakeClient({value["objectKey"]: b"old" for value in history})
        result = runner.perform_run(
            config,
            state,
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
            command=FakeDocker(),
            capture=archive_capture(),
        )
        self.assertEqual(result["outcome"], "succeeded")
        self.assertEqual(result["phase"], "complete")
        self.assertEqual(result["objectKey"], PREFIX + result["id"] + ".tar.gz")
        self.assertIn(result["objectKey"], client.objects)
        self.assertEqual(result["sourcePauseSeconds"], 5.25)
        self.assertEqual(result["retention"], {"deleted": 2, "failed": False})
        self.assertEqual(
            client.deleted, sorted([history[0]["objectKey"], history[1]["objectKey"]])
        )
        self.assertIn(history[2]["objectKey"], client.objects)
        # Each expired archive is marked on its own receipt, so provenance
        # survives and the metadata may finally be pruned.
        for value in history[:2]:
            self.assertTrue(state.load_receipt(value["id"])["expiredAt"])
        self.assertIsNone(state.load_receipt(history[2]["id"]).get("expiredAt"))
        self.assertIsNone(state.load_receipt(result["id"]).get("expiredAt"))
        self.assertFalse(list(state.staging.iterdir()))
        self.assertFalse(state.cleanup_pending())

    def test_a_failed_upload_preserves_every_earlier_verified_copy(self):
        config = settings()
        state = self.state(config)
        history = [receipt(index) for index in (1, 2, 3)]
        self.seed(state, history)
        denied = type(
            "ClientError", (Exception,), {"__module__": "botocore.exceptions"}
        )
        error = denied(f"An error occurred (AccessDenied) using {SECRET}")
        error.response = {"Error": {"Code": "AccessDenied"}}
        client = FakeClient(
            {value["objectKey"]: b"old" for value in history}, upload_error=error
        )
        client.multipart = [{"Key": "irrelevant", "UploadId": "u-1"}]
        result = runner.perform_run(
            config,
            state,
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
            command=FakeDocker(),
            capture=archive_capture(),
        )
        self.assertEqual(result["outcome"], "failed")
        self.assertEqual(result["phase"], "upload")
        self.assertEqual(result["errorCode"], "credentials-rejected")
        self.assertEqual(client.deleted, [])
        self.assertEqual(client.aborted, [])
        for value in history:
            self.assertIn(value["objectKey"], client.objects)
            self.assertEqual(state.load_receipt(value["id"])["outcome"], "succeeded")
        self.assertNotIn(SECRET, json.dumps(runner.sanitize_receipt(result)))
        self.assertNotIn(SECRET, json.dumps(runner.build_status(config, state)))

    def test_an_interrupted_multipart_upload_is_aborted_for_this_key_only(self):
        config = settings()
        state = self.state(config)
        client = FakeClient(upload_error=RuntimeError("connection reset"))
        client.interrupted_upload = True
        client.multipart = [{"Key": PREFIX + "another-run.tar.gz", "UploadId": "u-2"}]
        result = runner.perform_run(
            config,
            state,
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
            command=FakeDocker(),
            capture=archive_capture(),
        )
        self.assertEqual(result["outcome"], "failed")
        self.assertEqual(result["errorCode"], "unexpected-error")
        self.assertEqual(client.aborted, [PREFIX + result["id"] + ".tar.gz"])
        self.assertEqual(client.deleted, [])
        self.assertFalse(state.cleanup_pending())

    def test_a_failed_multipart_abort_is_recorded_as_pending_cleanup(self):
        config = settings()
        state = self.state(config)
        client = FakeClient(upload_error=RuntimeError("connection reset"))
        client.multipart_error = RuntimeError("list failed")
        runner.perform_run(
            config,
            state,
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
            command=FakeDocker(),
            capture=archive_capture(),
        )
        self.assertTrue(state.cleanup_pending())
        self.assertTrue(runner.build_status(config, state)["cleanupPending"])

    def test_a_download_that_differs_is_not_a_success(self):
        config = settings(keep=1)
        state = self.state(config)
        history = [receipt(1), receipt(2)]
        self.seed(state, history)
        client = FakeClient(
            {value["objectKey"]: b"old" for value in history}, corrupt=True
        )
        result = runner.perform_run(
            config,
            state,
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
            command=FakeDocker(),
            capture=archive_capture(),
        )
        self.assertEqual(result["outcome"], "failed")
        self.assertEqual(result["phase"], "verify")
        self.assertEqual(result["errorCode"], "verify-mismatch")
        self.assertEqual(result["retention"], {"deleted": 0, "failed": False})
        self.assertEqual(client.deleted, [])
        for value in history:
            self.assertIn(value["objectKey"], client.objects)

    def test_a_run_is_recorded_before_the_source_is_touched(self):
        config = settings()
        state = self.state(config)
        seen = {}

        def capture(config, state, run_id, command, staging):
            seen["receipt"] = state.load_receipt(run_id)
            raise runner.BackupError("capture", "source-not-running")

        result = runner.perform_run(
            config,
            state,
            storage_factory=lambda config: runner.Storage(
                FakeClient(), config["bucket"], config["prefix"]
            ),
            command=FakeDocker(),
            capture=capture,
        )
        self.assertEqual(seen["receipt"]["outcome"], "running")
        self.assertEqual(seen["receipt"]["phase"], "capture")
        self.assertEqual(result["outcome"], "failed")
        self.assertEqual(result["errorCode"], "source-not-running")
        self.assertEqual(
            state.load_receipt(result["id"])["errorCode"], "source-not-running"
        )

    # Recovery

    def test_recovery_restarts_only_the_containers_this_run_stopped(self):
        config = settings()
        state = self.state(config)
        mine = ["a" * 64, "b" * 64]
        theirs = "c" * 64
        run_id = str(uuid.uuid4())
        state.save_receipt(receipt(1, outcome="running", run_id=run_id))
        state.save_journal(
            {
                "version": 1,
                "runId": run_id,
                "deploymentId": DEPLOYMENT,
                "stopped": mine,
                "stoppedAt": "2026-09-01T03:00:00Z",
                "stagePath": "/var/tmp/server-guy-proof-" + run_id,
                "complete": False,
            }
        )
        docker = FakeDocker({mine[0]: False, mine[1]: True, theirs: False})
        client = FakeClient()
        client.interrupted_upload = True
        result = runner.perform_recovery(
            config,
            state,
            command=docker,
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
        )
        self.assertEqual(docker.started, [mine[0]])
        self.assertNotIn(theirs, docker.started)
        self.assertFalse(docker.containers[theirs])
        self.assertEqual(
            result["journals"],
            [{"runId": run_id, "stopped": 2, "restarted": 1, "complete": True}],
        )
        interrupted = state.load_receipt(run_id)
        self.assertEqual(interrupted["outcome"], "failed")
        self.assertEqual(interrupted["errorCode"], "interrupted")
        self.assertEqual(client.aborted, [interrupted["objectKey"]])
        self.assertEqual(
            result["interrupted"], [{"runId": run_id, "cleanupComplete": True}]
        )
        self.assertFalse(result["cleanupPending"])

    def test_recovery_is_idempotent_and_tolerates_a_removed_container(self):
        config = settings()
        state = self.state(config)
        present, removed = "a" * 64, "d" * 64
        run_id = str(uuid.uuid4())
        state.save_journal(
            {
                "version": 1,
                "runId": run_id,
                "deploymentId": DEPLOYMENT,
                "stopped": [present, removed],
                "complete": False,
            }
        )
        docker = FakeDocker({present: False})
        runner.perform_recovery(config, state, command=docker)
        self.assertEqual(docker.started, [present])
        again = runner.perform_recovery(config, state, command=docker)
        self.assertEqual(docker.started, [present])
        self.assertTrue(again["journals"][0]["complete"])

    def test_recovery_leaves_the_journal_open_when_docker_cannot_answer(self):
        config = settings()
        state = self.state(config)
        run_id = str(uuid.uuid4())
        state.save_journal(
            {
                "version": 1,
                "runId": run_id,
                "deploymentId": DEPLOYMENT,
                "stopped": ["a" * 64],
                "complete": False,
            }
        )
        silent = FakeDocker({"a" * 64: False}, available=False)
        result = runner.perform_recovery(config, state, command=silent)
        self.assertEqual(silent.started, [])
        self.assertFalse(result["journals"][0]["complete"])
        self.assertTrue(result["cleanupPending"])
        recovered = FakeDocker({"a" * 64: False})
        again = runner.perform_recovery(config, state, command=recovered)
        self.assertEqual(recovered.started, ["a" * 64])
        self.assertTrue(again["journals"][0]["complete"])
        self.assertFalse(again["cleanupPending"])

    def test_recover_refuses_to_run_while_the_lock_is_held(self):
        config = settings()
        path = write_private(self.directory / "config.json", config)
        state = self.state(config)
        stalled = receipt(1, outcome="running", objectKey=None)
        state.save_receipt(stalled)
        state.save_journal(
            {
                "version": 1,
                "kind": "source",
                "runId": stalled["id"],
                "deploymentId": DEPLOYMENT,
                "stopped": [],
                "complete": True,
            }
        )
        held = runner.acquire_lock(DEPLOYMENT)
        self.assertIsNotNone(held)
        errors = io.StringIO()
        with patch.object(runner, "RECOVERY_LOCK_WAIT", 0), redirect_stderr(errors):
            code = runner.main(["runner.py", str(path), "--recover"])
        self.assertEqual(code, 75)
        self.assertEqual(json.loads(errors.getvalue())["errorCode"], "lock-unavailable")
        # The invocation that holds the lock is left entirely alone.
        self.assertEqual(state.load_receipt(stalled["id"])["outcome"], "running")
        os.close(held)
        with redirect_stdout(io.StringIO()):
            code = runner.main(["runner.py", str(path), "--recover"])
        self.assertEqual(code, 0)
        closed = state.load_receipt(stalled["id"])
        self.assertEqual(closed["outcome"], "failed")
        self.assertEqual(closed["errorCode"], "interrupted")

    def test_recovery_closes_an_interrupted_run_that_stopped_nothing(self):
        config = settings(kind="postgres")
        state = self.state(config)
        stalled = receipt(1, outcome="running", kind="postgres")
        state.save_receipt(stalled)
        leftover = state.stage(stalled["id"])
        (leftover / "archive.tar.gz").write_bytes(b"a dump nobody will read")
        client = FakeClient()
        client.interrupted_upload = True
        client.multipart = [{"Key": PREFIX + "another-run.tar.gz", "UploadId": "u-9"}]
        result = runner.perform_recovery(
            config,
            state,
            command=FakeDocker(),
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
        )
        self.assertEqual(result["journals"], [])
        self.assertEqual(
            result["interrupted"], [{"runId": stalled["id"], "cleanupComplete": True}]
        )
        self.assertEqual(client.aborted, [stalled["objectKey"]])
        self.assertFalse(leftover.exists())
        closed = state.load_receipt(stalled["id"])
        self.assertEqual(closed["outcome"], "failed")
        self.assertEqual(closed["errorCode"], "interrupted")
        self.assertFalse(closed["pendingCleanup"])
        self.assertFalse(result["cleanupPending"])

    def test_an_interrupted_upload_stays_pending_when_storage_is_unreachable(self):
        config = settings()
        state = self.state(config)
        stalled = receipt(1, outcome="running")
        state.save_receipt(stalled)

        def unreachable(config):
            raise runner.BackupError("credentials", "credentials-unreadable")

        result = runner.perform_recovery(
            config, state, command=FakeDocker(), storage_factory=unreachable
        )
        self.assertEqual(
            result["interrupted"], [{"runId": stalled["id"], "cleanupComplete": False}]
        )
        self.assertTrue(state.load_receipt(stalled["id"])["pendingCleanup"])
        self.assertTrue(result["cleanupPending"])

    def test_recovery_removes_only_the_restore_resources_it_owns(self):
        config = settings()
        state = self.state(config)
        run_id = str(uuid.uuid4())
        names = runner.restore_names(run_id)
        stored = receipt(5, run_id=run_id, restoreInProgress=True)
        state.save_receipt(stored)
        state.save_journal(
            {
                "version": 1,
                "kind": "restore",
                "runId": run_id,
                "deploymentId": DEPLOYMENT,
                "container": names["container"],
                "volume": names["volume"],
                "scope": "offline-database",
                "startedAt": "2026-09-09T09:00:00Z",
                "complete": False,
            }
        )
        workspace = state.stage(names["stage"])
        (workspace / "archive.tar.gz").write_bytes(b"downloaded")
        other = str(uuid.uuid4())
        docker = FakeDocker(
            named={
                names["container"]: {runner.RESTORE_LABEL: run_id},
                "sg-restore-" + other: {runner.RESTORE_LABEL: other},
            },
            volumes={
                names["volume"]: {runner.RESTORE_LABEL: run_id},
                "sg-22222222_database": {},
            },
        )
        result = runner.perform_recovery(config, state, command=docker)
        self.assertEqual(
            result["restores"], [{"runId": run_id, "removed": 2, "complete": True}]
        )
        self.assertEqual(docker.removed, [names["container"], names["volume"]])
        self.assertIn("sg-restore-" + other, docker.named)
        self.assertIn("sg-22222222_database", docker.volumes)
        self.assertFalse(workspace.exists())
        self.assertEqual(state.journals(), [])
        closed = state.load_receipt(run_id)
        self.assertEqual(closed["outcome"], "succeeded")
        self.assertFalse(closed["restoreInProgress"])
        self.assertEqual(closed["restore"]["outcome"], "failed")
        self.assertEqual(closed["restore"]["errorCode"], "interrupted")
        self.assertTrue(closed["restore"]["cleanupComplete"])
        self.assertFalse(result["cleanupPending"])

    def test_recovery_leaves_a_restore_name_that_belongs_to_another_run(self):
        config = settings()
        state = self.state(config)
        run_id = str(uuid.uuid4())
        names = runner.restore_names(run_id)
        state.save_journal(
            {
                "version": 1,
                "kind": "restore",
                "runId": run_id,
                "deploymentId": DEPLOYMENT,
                "container": names["container"],
                "volume": names["volume"],
                "complete": False,
            }
        )
        # Same name, another owner's label: never ours to remove.
        docker = FakeDocker(
            named={names["container"]: {runner.RESTORE_LABEL: str(uuid.uuid4())}},
            volumes={names["volume"]: {}},
        )
        result = runner.perform_recovery(config, state, command=docker)
        self.assertEqual(
            result["restores"], [{"runId": run_id, "removed": 0, "complete": True}]
        )
        self.assertEqual(docker.removed, [])
        self.assertIn(names["container"], docker.named)
        self.assertIn(names["volume"], docker.volumes)

    def test_cleanup_unknown_is_retried_without_erasing_a_verified_restore(self):
        config = settings(kind="postgres")
        state = self.state(config)
        run_id = str(uuid.uuid4())
        names = runner.restore_names(run_id)
        stored = receipt(
            5,
            run_id=run_id,
            restore={
                "at": "2026-09-09T09:00:00Z",
                "outcome": "verified",
                "cleanupComplete": False,
            },
            pendingCleanup=True,
        )
        state.save_receipt(stored)
        state.save_journal(
            {
                "kind": "restore",
                "runId": run_id,
                "complete": False,
                "scope": "offline-database",
            }
        )
        docker = FakeDocker(
            available=False,
            named={
                names["container"]: {runner.RESTORE_LABEL: run_id},
            },
        )
        first = runner.perform_recovery(
            config,
            state,
            command=docker,
            storage_factory=lambda _: runner.Storage(
                FakeClient(), "server-guy-backups", PREFIX
            ),
        )
        self.assertTrue(first["cleanupPending"])
        self.assertFalse(state.load_receipt(run_id)["restore"]["cleanupComplete"])
        docker.available = True
        second = runner.perform_recovery(
            config,
            state,
            command=docker,
            storage_factory=lambda _: runner.Storage(
                FakeClient(), "server-guy-backups", PREFIX
            ),
        )
        self.assertFalse(second["cleanupPending"])
        final = state.load_receipt(run_id)
        self.assertEqual(final["outcome"], "succeeded")
        self.assertEqual(final["restore"]["outcome"], "verified")
        self.assertTrue(final["restore"]["cleanupComplete"])

    def test_restore_cleanup_does_not_forget_backup_staging_cleanup(self):
        config = settings(kind="postgres")
        state = self.state(config)
        run_id = str(uuid.uuid4())
        state.save_receipt(
            receipt(5, run_id=run_id, pendingCleanup=True, restoreInProgress=True)
        )
        stage = state.stage(run_id)
        (stage / "archive.tar.gz").write_bytes(b"copy still awaiting cleanup")
        state.save_journal(
            {
                "kind": "restore",
                "runId": run_id,
                "complete": False,
                "scope": "offline-database",
            }
        )
        result = runner.perform_recovery(
            config,
            state,
            command=FakeDocker(),
            storage_factory=lambda _: runner.Storage(
                FakeClient(), "server-guy-backups", PREFIX
            ),
        )
        self.assertFalse(result["cleanupPending"])
        self.assertFalse(stage.exists())
        self.assertEqual(state.load_receipt(run_id)["outcome"], "succeeded")
        self.assertEqual(state.load_receipt(run_id)["restore"]["outcome"], "failed")

    def test_a_finished_capture_that_left_a_snapshot_is_visible_and_cleaned(self):
        config = settings()
        state = self.state(config)
        run_id = str(uuid.uuid4())
        stage = runner.helper_stage(run_id)
        (stage / "state").mkdir(parents=True)
        (stage / "state/kuma.db").write_bytes(b"application data")
        canary = self.directory / "not-ours"
        canary.mkdir()
        (canary / "keep").write_text("untouched")
        state.save_journal(
            {
                "version": 1,
                "kind": "source",
                "runId": run_id,
                "deploymentId": DEPLOYMENT,
                "stopped": [],
                "complete": True,
                "stageRemoved": False,
                # A path in the record is never the path that gets deleted.
                "stagePath": str(canary),
            }
        )
        self.assertTrue(state.cleanup_pending())
        result = runner.perform_recovery(config, state, command=FakeDocker())
        self.assertFalse(stage.exists())
        self.assertTrue((canary / "keep").is_file())
        self.assertTrue(state.journals()[0]["stageRemoved"])
        self.assertFalse(result["cleanupPending"])

    def test_recovery_plan_only_covers_recorded_stops(self):
        journal = {"stopped": ["a" * 64, "b" * 64]}
        states = {
            "a" * 64: {"running": False},
            "b" * 64: {"running": True},
            "c" * 64: {"running": False},
        }
        self.assertEqual(runner.recovery_plan(journal, states), ["a" * 64])

    # Archives

    def test_safe_extraction_rejects_hostile_archives(self):
        cases = {
            "escape": ("../escape", tarfile.REGTYPE),
            "absolute": ("/etc/passwd", tarfile.REGTYPE),
            "link": ("state/link", tarfile.SYMTYPE),
            "root": ("secrets/key", tarfile.REGTYPE),
        }
        for name, (member_name, kind) in cases.items():
            path = self.directory / (name + ".tar")
            with tarfile.open(path, "w") as bundle:
                member = tarfile.TarInfo(member_name)
                member.type = kind
                if kind == tarfile.SYMTYPE:
                    member.linkname = "/etc/passwd"
                bundle.addfile(member)
            with self.assertRaises(runner.BackupError, msg=name) as raised:
                runner.safe_extract(path, self.directory / ("out-" + name))
            self.assertEqual(raised.exception.code, "archive-unsafe")
            self.assertFalse((self.directory / ("out-" + name)).exists())

    def test_safe_extraction_accepts_a_capture_archive(self):
        stage = self.directory / "stage"
        (stage / "state").mkdir(parents=True)
        (stage / "manifest.json").write_text("{}")
        (stage / "state/kuma.db").write_bytes(b"database")
        path = self.directory / "stack.tar.gz"
        with tarfile.open(path, "w:gz") as bundle:
            for child in sorted(stage.iterdir()):
                bundle.add(child, arcname=child.name)
        destination = self.directory / "extracted"
        runner.safe_extract(path, destination)
        self.assertEqual((destination / "state/kuma.db").read_bytes(), b"database")

    # Reporting

    def test_wrapped_upload_access_failure_keeps_the_provider_code(self):
        wrapped_type = type(
            "S3UploadFailedError", (Exception,), {"__module__": "boto3.exceptions"}
        )
        inner = Exception("private provider details")
        inner.response = {"Error": {"Code": "ExpiredToken"}}
        wrapped = wrapped_type("private object path")
        wrapped.__cause__ = inner
        self.assertEqual(runner.classify(wrapped, "upload"), "credentials-rejected")

    def test_failures_are_reported_as_bounded_codes(self):
        client_error = type(
            "ClientError", (Exception,), {"__module__": "botocore.exceptions"}
        )
        error = client_error(f"AccessDenied for {SECRET}")
        error.response = {"Error": {"Code": "AccessDenied"}}
        self.assertEqual(runner.classify(error, "upload"), "credentials-rejected")
        unknown = client_error("Unmapped storage failure")
        unknown.response = {"Error": {"Code": "SomethingNew"}}
        self.assertEqual(runner.classify(unknown, "upload"), "storage-error")
        self.assertEqual(
            runner.classify(subprocess.TimeoutExpired("docker", 1), "capture"),
            "capture-timeout",
        )
        self.assertEqual(
            runner.classify(RuntimeError(f"failed with {SECRET}"), "capture"),
            "unexpected-error",
        )
        self.assertEqual(
            runner.classify(runner.BackupError("capture", "source-missing"), "capture"),
            "source-missing",
        )

    def test_a_sanitized_receipt_drops_anything_unexpected(self):
        value = receipt(1)
        value.update(
            {
                "pendingCleanup": True,
                "archivePath": "/var/lib/server-guy/backups/stack.tar.gz",
                "sourceAddress": "10.0.0.4",
                "credentials": {"accessKeyId": SECRET},
                "errorCode": "raw boto3 failure text",
                "phase": "made-up",
                "restore": {
                    "at": "2026-09-05T09:00:00Z",
                    "recoveryPointAt": "2026-09-05T03:00:02Z",
                    "outcome": "verified",
                    "scope": "offline-database-and-files",
                    "checks": ["file-inventory", "container-logs"],
                    "measurements": {"files": 128, "rows": 20551, "hostPath": "/opt"},
                    "cleanupComplete": True,
                    "errorCode": "raw text",
                },
            }
        )
        sanitized = runner.sanitize_receipt(value)
        self.assertNotIn("pendingCleanup", sanitized)
        self.assertNotIn("archivePath", sanitized)
        self.assertNotIn("sourceAddress", sanitized)
        self.assertNotIn("credentials", sanitized)
        self.assertNotIn(SECRET, json.dumps(sanitized))
        self.assertEqual(sanitized["errorCode"], None)
        self.assertEqual(sanitized["phase"], "complete")
        self.assertEqual(sanitized["restore"]["checks"], ["file-inventory"])
        self.assertEqual(
            sanitized["restore"]["measurements"], {"files": 128, "rows": 20551}
        )
        self.assertIsNone(sanitized["restore"]["errorCode"])

    def test_status_reports_a_bounded_sanitized_history(self):
        config = settings()
        state = self.state(config)
        for index in range(35):
            value = receipt(1, run_id=str(uuid.uuid4()))
            value["startedAt"] = f"2026-09-09T03:{index:02d}:00Z"
            value["pendingCleanup"] = False
            state.save_receipt(value)
        status = runner.build_status(config, state)
        self.assertEqual(status["version"], 1)
        self.assertEqual(status["applicationId"], APPLICATION)
        self.assertEqual(len(status["runs"]), 30)
        self.assertEqual(status["runs"][0]["startedAt"], "2026-09-09T03:34:00Z")
        self.assertFalse(status["cleanupPending"])
        self.assertEqual(
            set(status),
            {"version", "applicationId", "deploymentId", "runs", "cleanupPending"},
        )

    # Offline restore

    def sqlite_stack_archive(self, run_id):
        """A capture archive shaped exactly like the proven helper's output."""
        stage = self.directory / ("capture-" + run_id[:8])
        (stage / "state/app").mkdir(parents=True)
        (stage / "configuration").mkdir(parents=True)
        (stage / "configuration/compose.json").write_text(json.dumps({"services": {}}))
        database = stage / "state/app/kuma.db"
        connection = sqlite3.connect(database)
        with connection:
            connection.execute(
                "CREATE TABLE monitor (id INTEGER PRIMARY KEY, name TEXT)"
            )
            connection.executemany(
                "INSERT INTO monitor VALUES (?, ?)",
                [(1, "api"), (2, "site"), (3, "queue")],
            )
        connection.close()
        manifest = {
            "deploymentId": DEPLOYMENT,
            "proofId": run_id,
            "kind": "kuma",
            "stopStartedAt": 1789000000.0,
            "sqlite": {"app/kuma.db": runner.helper_module().sqlite_evidence(database)},
        }
        manifest["files"] = {
            str(path.relative_to(stage)): runner.sha256(path)
            for path in sorted(stage.rglob("*"))
            if path.is_file()
        }
        (stage / "manifest.json").write_text(json.dumps(manifest))
        archive = self.directory / (run_id + ".tar.gz")
        with tarfile.open(archive, "w:gz") as bundle:
            for child in sorted(stage.iterdir()):
                bundle.add(child, arcname=child.name)
        return archive

    def restorable(self, state, client, run_id=None):
        run_id = run_id or str(uuid.uuid4())
        archive = self.sqlite_stack_archive(run_id)
        value = receipt(
            5,
            run_id=run_id,
            bytes=archive.stat().st_size,
            sha256=runner.sha256(archive),
        )
        state.save_receipt(value)
        client.objects[value["objectKey"]] = archive.read_bytes()
        return value

    def test_test_restore_verifies_the_database_offline_and_cleans_up(self):
        config = settings()
        state = self.state(config)
        client = FakeClient()
        stored = self.restorable(state, client)
        result = runner.perform_test_restore(
            config,
            state,
            stored["id"],
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
        )
        restore = result["restore"]
        self.assertEqual(restore["outcome"], "verified")
        self.assertIsNone(restore["errorCode"])
        self.assertEqual(restore["scope"], "offline-database-and-files")
        self.assertEqual(restore["recoveryPointAt"], "2026-09-10T00:26:40Z")
        self.assertEqual(
            restore["checks"],
            [
                "archive-hash",
                "archive-structure",
                "backup-identity",
                "file-inventory",
                "database-integrity",
                "database-schema",
                "database-rows",
            ],
        )
        self.assertEqual(restore["measurements"], {"files": 2, "tables": 1, "rows": 3})
        self.assertTrue(restore["cleanupComplete"])
        self.assertEqual(
            state.load_receipt(stored["id"])["restore"]["outcome"], "verified"
        )
        self.assertFalse(state.cleanup_pending())
        self.assertEqual(client.deleted, [])

    def test_test_restore_fails_on_a_changed_archive_and_still_cleans_up(self):
        config = settings()
        state = self.state(config)
        client = FakeClient(corrupt=True)
        stored = self.restorable(state, client)
        result = runner.perform_test_restore(
            config,
            state,
            stored["id"],
            storage_factory=lambda config: runner.Storage(
                client, config["bucket"], config["prefix"]
            ),
        )
        self.assertEqual(result["restore"]["outcome"], "failed")
        self.assertEqual(result["restore"]["errorCode"], "verify-mismatch")
        self.assertEqual(result["restore"]["checks"], [])
        self.assertTrue(result["restore"]["cleanupComplete"])
        self.assertEqual(result["outcome"], "succeeded")

    def test_test_restore_refuses_a_run_that_never_reached_storage(self):
        config = settings()
        state = self.state(config)
        failed = receipt(2, outcome="failed", objectKey=None)
        state.save_receipt(failed)
        for run_id, expected in (
            (failed["id"], "run-not-restorable"),
            (str(uuid.uuid4()), "run-not-found"),
            ("../../etc/passwd", "run-not-found"),
        ):
            with self.assertRaises(runner.BackupError, msg=run_id) as raised:
                runner.perform_test_restore(config, state, run_id)
            self.assertEqual(raised.exception.code, expected)

    # Local metadata

    def test_pruning_keeps_a_receipt_while_its_archive_may_still_exist(self):
        state = self.state()
        older = [receipt(index, outcome="failed") for index in (1, 2, 3)]
        self.seed(state, older)
        with patch.object(runner, "RECEIPT_LIMIT", 1):
            state.prune()
        # Each one still names an object nobody has confirmed is gone.
        self.assertEqual(len(state.history()), 3)
        runner.mark_expired(state, older[0]["id"])
        with patch.object(runner, "RECEIPT_LIMIT", 1):
            state.prune()
        self.assertEqual(
            {value["id"] for value in state.history()},
            {older[1]["id"], older[2]["id"]},
        )

    def test_retention_notices_an_archive_that_is_no_longer_in_the_bucket(self):
        config = settings(keep=5)
        state = self.state(config)
        vanished, present = receipt(1), receipt(2)
        self.seed(state, [vanished, present])
        # Only one of the two archives is actually there any more.
        client = FakeClient({present["objectKey"]: b"still here"})
        storage = runner.Storage(client, config["bucket"], config["prefix"])
        result = runner.apply_retention(config, state, storage)
        self.assertEqual(result, {"deleted": 0, "failed": False})
        self.assertEqual(client.deleted, [])
        self.assertTrue(state.load_receipt(vanished["id"])["expiredAt"])
        self.assertIsNone(state.load_receipt(present["id"]).get("expiredAt"))
        # Status must not offer a copy that does not exist as the live one.
        status = runner.build_status(config, state)
        live = next(
            run
            for run in status["runs"]
            if run["outcome"] == "succeeded" and not run["expiredAt"]
        )
        self.assertEqual(live["id"], present["id"])

    def test_status_keeps_the_last_archive_and_restore_through_a_failure_streak(self):
        config = settings()
        state = self.state(config)
        proven = receipt(1, run_id=str(uuid.uuid4()))
        proven["restore"] = {
            "at": "2026-09-01T09:00:00Z",
            "recoveryPointAt": "2026-09-01T03:00:02Z",
            "outcome": "verified",
            "scope": "offline-database-and-files",
            "checks": ["archive-hash"],
            "measurements": {"files": 12},
            "cleanupComplete": True,
            "errorCode": None,
        }
        proven["expiredAt"] = "2026-09-05T03:00:00Z"
        state.save_receipt(proven)
        live = receipt(2, run_id=str(uuid.uuid4()))
        state.save_receipt(live)
        for index in range(40):
            failure = receipt(
                9, outcome="failed", run_id=str(uuid.uuid4()), objectKey=None
            )
            failure["startedAt"] = f"2026-09-09T03:{index:02d}:00Z"
            failure["errorCode"] = "credentials-rejected"
            state.save_receipt(failure)
        status = runner.build_status(config, state)
        identifiers = [run["id"] for run in status["runs"]]
        self.assertEqual(len(identifiers), 30)
        # Forty failures later, both answers are still on the page.
        self.assertIn(live["id"], identifiers)
        self.assertIn(proven["id"], identifiers)
        started = [run["startedAt"] for run in status["runs"]]
        self.assertEqual(started, sorted(started, reverse=True))
        restored = next(run for run in status["runs"] if run["id"] == proven["id"])
        self.assertEqual(restored["restore"]["outcome"], "verified")
        self.assertEqual(restored["expiredAt"], "2026-09-05T03:00:00Z")

    def test_local_metadata_stays_bounded_without_losing_open_work(self):
        config = settings()
        state = self.state(config)
        history = []
        for index in range(6):
            value = receipt(1, run_id=str(uuid.uuid4()))
            value["startedAt"] = f"2026-09-09T03:{index:02d}:00Z"
            # Expired: retention already removed the archive, so the receipt is
            # the only thing left and it may go.
            value["expiredAt"] = "2026-09-09T04:00:00Z"
            state.save_receipt(value)
            state.save_journal(
                {
                    "version": 1,
                    "runId": value["id"],
                    "deploymentId": DEPLOYMENT,
                    "stopped": ["a" * 64],
                    "complete": True,
                }
            )
            history.append(value)
        stalled = receipt(1, outcome="running", run_id=str(uuid.uuid4()))
        stalled["startedAt"] = "2026-09-08T03:00:00Z"
        state.save_receipt(stalled)
        state.save_journal(
            {
                "version": 1,
                "runId": stalled["id"],
                "deploymentId": DEPLOYMENT,
                "stopped": ["b" * 64],
                "complete": False,
            }
        )
        with patch.object(runner, "RECEIPT_LIMIT", 3):
            state.prune()
        kept = {value["id"] for value in state.history()}
        self.assertEqual(kept, {value["id"] for value in history[3:]} | {stalled["id"]})
        self.assertEqual(
            {journal["runId"] for journal in state.journals()},
            {value["id"] for value in history[3:]} | {stalled["id"]},
        )
        self.assertTrue(state.cleanup_pending())

    # Capture

    def source_stack(self, services=None):
        source = self.directory / "source" / DEPLOYMENT
        source.mkdir(parents=True, exist_ok=True)
        (source / "compose.json").write_text(
            json.dumps(
                {
                    "services": services
                    or {"app": {"image": "louislam/uptime-kuma@sha256:" + "a" * 64}}
                }
            )
        )
        return source

    def fake_helper(self, quiesced, pause=9.5):
        """Stand in for the capture helper: a real archive, a real manifest."""

        def helper(deployment_id, proof_id):
            output = runner.helper_stage(proof_id)
            stage = output / "snapshot"
            (stage / "state/app").mkdir(parents=True)
            (stage / "state/app/kuma.db").write_bytes(b"quiesced database")
            manifest = {
                "deploymentId": deployment_id,
                "proofId": proof_id,
                "kind": "kuma",
                "stopStartedAt": quiesced,
                "capturedAt": quiesced + pause,
            }
            (stage / "manifest.json").write_text(json.dumps(manifest))
            archive = output / "stack.tar.gz"
            with tarfile.open(archive, "w:gz") as bundle:
                for child in sorted(stage.iterdir()):
                    bundle.add(child, arcname=child.name)
            return json.dumps(
                {
                    "path": str(archive),
                    "bytes": archive.stat().st_size,
                    "sha256": runner.sha256(archive),
                    "pauseSeconds": pause,
                }
            ).encode()

        return helper

    def test_sqlite_capture_dates_the_backup_at_the_quiesced_moment(self):
        config = settings()
        state = self.state(config)
        self.source_stack()
        run_id = str(uuid.uuid4())
        quiesced = 1757000000.0
        docker = FakeDocker({"a" * 64: True}, helper=self.fake_helper(quiesced))
        staging = state.stage(run_id)
        result = runner.capture_sqlite_stack(config, state, run_id, docker, staging)
        # Not when compression finished: when the data stopped changing.
        self.assertEqual(result["capturedAt"], quiesced)
        self.assertLess(result["capturedAt"], runner.now())
        self.assertEqual(result["pauseSeconds"], 9.5)
        self.assertTrue((staging / "archive.tar.gz").is_file())
        self.assertFalse(runner.helper_stage(run_id).exists())
        journal = state.journals()[0]
        self.assertEqual(journal["stopped"], ["a" * 64])
        self.assertTrue(journal["complete"])
        self.assertTrue(journal["stageRemoved"])
        # Mid-run the archive is still staged, which is exactly what pending
        # cleanup means until the run itself finishes.
        self.assertTrue(state.cleanup_pending())

    def test_capture_refuses_a_source_that_has_moved_on(self):
        config = settings()
        state = self.state(config)
        self.source_stack()
        run_id = str(uuid.uuid4())
        for labels in (
            {"server-guy.deployment": DEPLOYMENT, "server-guy.revision": "rev-10"},
            {
                "server-guy.deployment": str(uuid.uuid4()),
                "server-guy.revision": "rev-9",
            },
            {},
        ):
            docker = FakeDocker({"a" * 64: True}, labels=labels)
            with self.assertRaises(runner.BackupError, msg=labels) as raised:
                runner.capture_sqlite_stack(
                    config, state, run_id, docker, state.stage(run_id)
                )
            self.assertEqual(raised.exception.code, "source-identity-mismatch")
            # Refused before the journal exists, so nothing was ever stopped.
            self.assertEqual(state.journals(), [])
            self.assertEqual(
                [call[:2] for call in docker.calls].count(("docker", "stop")), 0
            )

    def test_postgres_capture_dates_the_snapshot_before_the_dump_finishes(self):
        config = settings(kind="postgres")
        state = self.state(config)
        self.source_stack(
            {
                "app": {"image": "sg-todo:latest"},
                "postgres": {"image": "postgres:16-alpine"},
            }
        )
        app, database = "a" * 64, "b" * 64
        docker = FakeDocker(
            containers={app: True, database: True},
            services={app: "app", database: "postgres"},
            exec_results={"psql": b"160004\n", "pg_dump": b"PGDMP" + bytes(64)},
        )
        run_id = str(uuid.uuid4())
        before = runner.now()
        result = runner.capture_postgres(
            config, state, run_id, docker, state.stage(run_id)
        )
        self.assertEqual(result["pauseSeconds"], 0.0)
        self.assertGreaterEqual(result["capturedAt"], before)
        self.assertLessEqual(result["capturedAt"], runner.now())
        manifest = runner.archive_manifest(result["path"])
        self.assertEqual(manifest["recoveryPointAt"], runner.iso(result["capturedAt"]))
        self.assertEqual(manifest["postgres"]["majorVersion"], 16)
        self.assertNotIn(SECRET, json.dumps(manifest))
        # A dump pauses nothing, so there is nothing to recover.
        self.assertEqual(state.journals(), [])

    # Source scope

    def test_postgres_capture_refuses_a_stack_it_would_under_protect(self):
        config = settings(kind="postgres")
        state = self.state(config)
        source = self.directory / "source" / DEPLOYMENT
        source.mkdir(parents=True)
        (source / "compose.json").write_text(
            json.dumps(
                {
                    "services": {
                        "app": {"image": "sg-todo:latest"},
                        "postgres": {"image": "postgres:16-alpine"},
                    }
                }
            )
        )
        app, database = "a" * 64, "b" * 64
        docker = FakeDocker(
            containers={app: True, database: True},
            services={app: "app", database: "postgres"},
            mounts={
                app: [
                    {"Type": "volume", "Name": "sg-uploads", "Destination": "/uploads"}
                ]
            },
        )
        with self.assertRaises(runner.BackupError) as raised:
            runner.capture_postgres(
                config, state, str(uuid.uuid4()), docker, self.directory
            )
        self.assertEqual(raised.exception.code, "source-unsupported")

    # Generic stack capture

    def generic_stack(self):
        """App and a read-only worker share SQLite; jobs only uses PostgreSQL."""
        source = self.source_stack(
            {
                "app": {"image": "sg-app:rev-9"},
                "worker": {"image": "sg-app:rev-9"},
                "jobs": {"image": "example/jobs:1"},
                "postgres": {"image": "postgres:16"},
            }
        )
        (source / "configs").mkdir(exist_ok=True)
        (source / "configs/app-settings").write_text("mode = production")
        volumes = Path(tempfile.mkdtemp(dir=self.directory))
        state, uploads = volumes / "state", volumes / "uploads"
        (state / "db").mkdir(parents=True)
        (state / "blobs").mkdir()
        (state / "blobs/avatar.png").write_bytes(b"\x89PNG avatar")
        uploads.mkdir()
        (uploads / "report.pdf").write_bytes(b"%PDF quarterly report")
        # An open writer that never checkpoints: every row lives only in the
        # WAL, as after a writer that was killed rather than closed.
        writer = sqlite3.connect(state / "db/app.sqlite")
        self.addCleanup(writer.close)
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        with writer:
            writer.execute("CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT)")
            writer.executemany(
                "INSERT INTO note VALUES (?, ?)", [(1, "first"), (2, "second")]
            )
        project = runner.compose_project(DEPLOYMENT)

        def volume(name, path, target, rw=True):
            return {
                "Type": "volume",
                "Name": f"{project}_{name}",
                "Source": str(path),
                "Destination": target,
                "RW": rw,
            }

        docker = FakeDocker(
            containers={APP: True, WORKER: True, JOBS: True, DATABASE: True},
            services={APP: "app", WORKER: "worker", JOBS: "jobs", DATABASE: "postgres"},
            images={
                APP: "sg-app:rev-9",
                WORKER: "sg-app:rev-9",
                JOBS: "example/jobs:1",
                DATABASE: "postgres:16",
            },
            mounts={
                APP: [
                    volume("state", state, "/srv/state"),
                    volume("uploads", uploads, "/uploads"),
                    {
                        "Type": "bind",
                        "Source": str(source / "configs/app-settings"),
                        "Destination": "/etc/app/settings.toml",
                        "RW": False,
                    },
                ],
                WORKER: [volume("state", state, "/mnt/state", rw=False)],
                DATABASE: [volume("database", volumes, "/var/lib/postgresql/data")],
            },
            exec_results={"psql": b"160004\n", "pg_dump": DUMP},
        )
        # The shape backupCapturePlan records when the app needs jobs: each
        # dependent before what it needs, not the order Compose lists them in.
        capture = {
            "version": 1,
            "pauseServices": ["worker", "app", "jobs"],
            "postgres": "postgres",
            "volumes": [
                {
                    "name": "state",
                    "kind": "database",
                    "sqlite": "db/app.sqlite",
                    "mounts": [
                        {"service": "app", "target": "/srv/state", "readOnly": False},
                        {"service": "worker", "target": "/mnt/state", "readOnly": True},
                    ],
                },
                {
                    "name": "uploads",
                    "kind": "files",
                    "sqlite": None,
                    "mounts": [
                        {"service": "app", "target": "/uploads", "readOnly": False}
                    ],
                },
            ],
        }
        path = write_private(
            self.directory / "config.json",
            settings(
                kind="stack",
                capture=capture,
                composeSha256=runner.sha256(source / "compose.json"),
            ),
        )
        # Through the real loader, which decides what the run may see.
        return runner.load_config(path), docker

    def storage(self, client):
        return lambda config: runner.Storage(client, config["bucket"], config["prefix"])

    def test_stack_capture_quiesces_every_application_service_around_one_recovery_point(
        self,
    ):
        config, docker = self.generic_stack()
        state = self.state(config)
        wal = Path(docker.mounts[APP][0]["Source"]) / "db/app.sqlite-wal"
        self.assertGreater(wal.stat().st_size, 0)
        # Exiting on SIGTERM (143) is a clean stop; a SIGKILL (137) or any
        # other exit code is not.
        docker.exit_codes[JOBS] = 143
        client = FakeClient()
        result = runner.perform_run(
            config, state, storage_factory=self.storage(client), command=docker
        )
        self.assertEqual(result["outcome"], "succeeded", result["errorCode"])
        stops = [call[2:] for call in docker.calls if call[:2] == ("docker", "stop")]
        # One container per call in the recorded order (a multi-ID stop is
        # parallel). Includes the client that mounts nothing; never the managed
        # database, which alone is still running when it is dumped.
        self.assertEqual(stops, [("--time", "120", c) for c in (WORKER, APP, JOBS)])
        self.assertEqual(docker.exec_running["pg_dump"], [DATABASE])
        # Restarted in reverse: each dependency is running before its dependents.
        self.assertEqual(docker.started, [JOBS, APP, WORKER])
        self.assertTrue(all(docker.containers.values()))
        self.assertTrue(state.journals()[0]["complete"])
        archive = self.directory / "stack.tar.gz"
        archive.write_bytes(client.objects[result["objectKey"]])
        extracted = self.directory / "extracted"
        runner.safe_extract(archive, extracted)
        # One copy of the shared volume, however many services mount it.
        self.assertEqual(
            sorted(path.name for path in (extracted / "state").iterdir()),
            ["state", "uploads"],
        )
        data = extracted / "state/state"
        self.assertEqual([p.name for p in (data / "db").iterdir()], ["app.sqlite"])
        with closing(sqlite3.connect(data / "db/app.sqlite")) as copy:
            self.assertEqual(copy.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(
                copy.execute("SELECT body FROM note ORDER BY id").fetchall(),
                [("first",), ("second",)],
            )
        self.assertEqual((data / "blobs/avatar.png").read_bytes(), b"\x89PNG avatar")
        self.assertEqual(
            (extracted / "state/uploads/report.pdf").read_bytes(),
            b"%PDF quarterly report",
        )
        self.assertEqual((extracted / "database/dump.pgc").read_bytes(), DUMP)
        self.assertEqual(
            (extracted / "configuration/configs/app-settings").read_text(),
            "mode = production",
        )
        manifest = json.loads((extracted / "manifest.json").read_text())
        self.assertEqual(manifest["recoveryPointAt"], result["capturedAt"])
        self.assertEqual(
            manifest["stoppedServices"], {"app": 0, "worker": 0, "jobs": 143}
        )
        self.assertNotIn(SECRET, json.dumps(manifest))

    def test_a_mixed_archive_restores_its_files_sqlite_and_captured_dump(self):
        config, docker = self.generic_stack()
        state = self.state(config)
        client = FakeClient()
        stored = runner.perform_run(
            config, state, storage_factory=self.storage(client), command=docker
        )
        restorer = FakeDocker(
            exec_results={"pg_isready": b"", "pg_restore": b"", "psql": b"2|7\n"}
        )
        restore = runner.perform_test_restore(
            config,
            state,
            stored["id"],
            storage_factory=self.storage(client),
            command=restorer,
        )["restore"]
        self.assertEqual(restore["outcome"], "verified", restore["errorCode"])
        self.assertEqual(restore["recoveryPointAt"], stored["capturedAt"])
        for check in (
            "file-inventory",
            "database-integrity",
            "database-rows",
            "database-restored",
        ):
            self.assertIn(check, restore["checks"])
        names = runner.restore_names(stored["id"])
        # PostgreSQL restores the dump captured with these files, not any dump.
        self.assertEqual(restorer.copied[names["container"] + ":/tmp/dump.pgc"], DUMP)
        self.assertEqual(restorer.removed, [names["container"], names["volume"]])
        self.assertTrue(restore["cleanupComplete"])

    def test_a_file_captured_database_restores_by_file_hashes_alone(self):
        """A broker whose clean shutdown leaves all its state in files."""
        source = self.source_stack(
            {"app": {"image": "sg-app:rev-9"}, "queue": {"image": "example/queue:1"}}
        )
        data = Path(tempfile.mkdtemp(dir=self.directory))
        (data / "segments").mkdir()
        (data / "segments/000001.log").write_bytes(b"queued job 1")
        docker = FakeDocker(
            containers={APP: True, JOBS: True},
            services={APP: "app", JOBS: "queue"},
            images={APP: "sg-app:rev-9", JOBS: "example/queue:1"},
            mounts={
                JOBS: [
                    {
                        "Type": "volume",
                        "Name": runner.compose_project(DEPLOYMENT) + "_queue",
                        "Source": str(data),
                        "Destination": "/data",
                        "RW": True,
                    }
                ]
            },
        )
        capture = {
            "version": 1,
            "pauseServices": ["app", "queue"],
            "postgres": None,
            "volumes": [
                {
                    "name": "queue",
                    "kind": "database",
                    "sqlite": None,
                    "capture": "quiesced-files",
                    "mounts": [
                        {"service": "queue", "target": "/data", "readOnly": False}
                    ],
                }
            ],
        }
        config = runner.load_config(
            write_private(
                self.directory / "config.json",
                settings(
                    kind="stack",
                    capture=capture,
                    composeSha256=runner.sha256(source / "compose.json"),
                ),
            )
        )
        state = self.state(config)
        client = FakeClient()
        stored = runner.perform_run(
            config, state, storage_factory=self.storage(client), command=docker
        )
        self.assertEqual(stored["outcome"], "succeeded", stored["errorCode"])
        archive = self.directory / "queue.tar.gz"
        archive.write_bytes(client.objects[stored["objectKey"]])
        # Named for what ran: neither the SQLite backup API nor a PostgreSQL dump.
        method = runner.archive_manifest(archive)["method"]
        self.assertNotRegex(method, "SQLite|PostgreSQL")
        restorer = FakeDocker()
        restore = runner.perform_test_restore(
            config,
            state,
            stored["id"],
            storage_factory=self.storage(client),
            command=restorer,
        )["restore"]
        self.assertEqual(restore["outcome"], "verified", restore["errorCode"])
        # The segment and the recorded Compose definition, each hash-checked.
        self.assertIn("file-inventory", restore["checks"])
        self.assertEqual(restore["measurements"]["files"], 2)
        # Hashes prove the files, not database semantics: no database check
        # is claimed and no disposable database is started.
        self.assertEqual([c for c in restore["checks"] if c.startswith("database")], [])
        self.assertNotIn(("docker", "run"), [call[:2] for call in restorer.calls])

    def test_a_legacy_postgres_archive_still_restores(self):
        config = settings(kind="postgres")
        state = self.state(config)
        self.source_stack(
            {
                "app": {"image": "sg-todo:latest"},
                "postgres": {"image": "postgres:16-alpine"},
            }
        )
        docker = FakeDocker(
            containers={APP: True, DATABASE: True},
            services={APP: "app", DATABASE: "postgres"},
            exec_results={"psql": b"160004\n", "pg_dump": DUMP},
        )
        client = FakeClient()
        stored = runner.perform_run(
            config, state, storage_factory=self.storage(client), command=docker
        )
        restorer = FakeDocker(
            exec_results={"pg_isready": b"", "pg_restore": b"", "psql": b"1|3\n"}
        )
        restore = runner.perform_test_restore(
            config,
            state,
            stored["id"],
            storage_factory=self.storage(client),
            command=restorer,
        )["restore"]
        self.assertEqual(restore["outcome"], "verified", restore["errorCode"])
        self.assertEqual(restore["scope"], "offline-database")
        self.assertIn("database-restored", restore["checks"])
        self.assertEqual(len(restorer.removed), 2)

    def test_stack_capture_refuses_an_unrecorded_or_changed_source(self):
        project = runner.compose_project(DEPLOYMENT)
        compose = self.directory / "source" / DEPLOYMENT / "compose.json"

        def unrecorded_volume(docker, config):
            docker.mounts[JOBS] = [
                {
                    "Type": "volume",
                    "Name": "f" * 64,
                    "Source": str(self.directory),
                    "Destination": "/cache",
                    "RW": True,
                }
            ]

        def writable_reader(docker, config):
            docker.mounts[WORKER][0]["RW"] = True

        def outside_writer(docker, config):
            docker.foreign.add("e" * 64)
            docker.mounts["e" * 64] = [
                {"Type": "volume", "Name": project + "_uploads", "RW": True}
            ]

        def rebuilt_image(docker, config):
            docker.images[JOBS] = "example/jobs:2"

        def unrecorded_service(docker, config):
            services = json.loads(compose.read_text())["services"]
            services["cache"] = {"image": "valkey/valkey:8"}
            compose.write_text(json.dumps({"services": services}))
            config["composeSha256"] = runner.sha256(compose)

        def edited_compose(docker, config):
            compose.write_text(compose.read_text().replace("jobs:1", "jobs:2"))

        def linked_file(docker, config):
            uploads = Path(docker.mounts[APP][1]["Source"])
            (uploads / "escape").symlink_to("/etc/passwd")

        cases = {
            "unrecorded volume": (unrecorded_volume, "source-unsupported"),
            "writable reader": (writable_reader, "source-unsupported"),
            "outside writer": (outside_writer, "source-unsupported"),
            "unrecorded service": (unrecorded_service, "source-unsupported"),
            "rebuilt image": (rebuilt_image, "source-identity-mismatch"),
            "edited compose": (edited_compose, "source-identity-mismatch"),
            "linked file": (linked_file, "source-unsupported"),
        }
        for name, (change, code) in cases.items():
            with self.subTest(name):
                config, docker = self.generic_stack()
                state = self.state(config)
                change(docker, config)
                run_id = str(uuid.uuid4())
                with self.assertRaises(runner.BackupError) as raised:
                    runner.capture_stack(
                        config, state, run_id, docker, state.stage(run_id)
                    )
                self.assertEqual(raised.exception.code, code)
                self.assertNotIn(("docker", "stop"), [c[:2] for c in docker.calls])
                self.assertEqual(state.journals(), [])

    def test_stack_capture_restarts_what_it_paused_after_a_failure_or_a_crash(self):
        def bad_dump(docker):
            docker.exec_results["pg_dump"] = b"not a dump"

        def killed_after_grace_period(docker):
            # SIGKILL: files may be mid-write, so there is no recovery point.
            docker.exit_codes[WORKER] = 137

        client = FakeClient()
        for change, code in (
            (bad_dump, "capture-failed"),
            (killed_after_grace_period, "source-stop-failed"),
        ):
            with self.subTest(code):
                config, docker = self.generic_stack()
                state = self.state(config)
                change(docker)
                failed = runner.perform_run(
                    config, state, storage_factory=self.storage(client), command=docker
                )
                self.assertEqual(failed["errorCode"], code)
                # Dependencies first, as after a successful capture.
                self.assertEqual(docker.started, [JOBS, APP, WORKER])
                self.assertTrue(all(docker.containers.values()))
                self.assertEqual(client.objects, {})
        # The daemon refuses the restart: the journal stays open, and recovery
        # later starts exactly the paused services.
        config, docker = self.generic_stack()
        docker.refuse_start = True
        crashed = runner.perform_run(
            config, state, storage_factory=self.storage(client), command=docker
        )
        self.assertEqual(crashed["errorCode"], "source-restart-failed")
        self.assertFalse(any(docker.containers[c] for c in (APP, WORKER, JOBS)))
        self.assertTrue(state.cleanup_pending())
        docker.refuse_start = False
        result = runner.perform_recovery(config, state, command=docker)
        self.assertEqual(docker.started, [JOBS, APP, WORKER])
        self.assertTrue(all(docker.containers.values()))
        self.assertFalse(result["cleanupPending"])

    # Declared owner dumps

    def dump_stack(self):
        """A web service writes files and a database it does not own; the
        owner dumps it with its recorded commands; a migration job has
        finished. No service is called app or postgres."""
        image = "mariadb:11.4@sha256:" + "e" * 64
        source = self.source_stack(
            {
                "web": {"image": "example/shelf:2"},
                "db": {
                    "image": image,
                    "environment": {
                        "MARIADB_ROOT_PASSWORD": SECRET,
                        "MARIADB_DATABASE": "shelf",
                    },
                },
                "migrate": {"image": "example/shelf:2"},
            }
        )
        files = Path(tempfile.mkdtemp(dir=self.directory))
        (files / "attachment.bin").write_bytes(b"attached bytes")
        project = runner.compose_project(DEPLOYMENT)
        docker = FakeDocker(
            containers={APP: True, DATABASE: True},
            services={APP: "web", DATABASE: "db"},
            images={APP: "example/shelf:2", DATABASE: image},
            mounts={
                APP: [
                    {
                        "Type": "volume",
                        "Name": f"{project}_files",
                        "Source": str(files),
                        "Destination": "/srv/files",
                        "RW": True,
                    }
                ],
                DATABASE: [
                    {
                        "Type": "volume",
                        "Name": f"{project}_data",
                        "Source": "/var/lib/docker/volumes/data",
                        "Destination": "/var/lib/mysql",
                        "RW": True,
                    }
                ],
            },
            exec_results={
                "mariadb-dump": b"-- dump of shelf\nINSERT 42;\n",
                "mariadb-fingerprint": b"pages 3 sha 9f\n",
            },
        )
        capture = {
            "version": 1,
            "pauseServices": ["web"],
            "postgres": None,
            "volumes": [
                {
                    "name": "files",
                    "kind": "files",
                    "sqlite": None,
                    "mounts": [
                        {"service": "web", "target": "/srv/files", "readOnly": False},
                        {"service": "migrate", "target": "/srv/files", "readOnly": False},
                    ],
                }
            ],
            "dumps": [
                {
                    "volume": "data",
                    "service": "db",
                    "target": "/var/lib/mysql",
                    "dump": ["mariadb-dump", "--all-databases"],
                    "restore": ["mariadb", "--batch"],
                    "verify": ["mariadb-fingerprint"],
                }
            ],
            "oneShot": ["migrate"],
        }
        path = write_private(
            self.directory / "config.json",
            settings(
                kind="stack",
                capture=capture,
                composeSha256=runner.sha256(source / "compose.json"),
            ),
        )
        return runner.load_config(path), docker

    def test_a_declared_owner_dumps_while_its_writers_are_stopped(self):
        config, docker = self.dump_stack()
        state = self.state(config)
        client = FakeClient()
        result = runner.perform_run(
            config, state, storage_factory=self.storage(client), command=docker
        )
        self.assertEqual(result["outcome"], "succeeded", result["errorCode"])
        # Only the writer stops; the owner keeps running to dump and verify.
        stops = [call[4] for call in docker.calls if call[:2] == ("docker", "stop")]
        self.assertEqual(stops, [APP])
        self.assertEqual(docker.exec_running["mariadb-dump"], [DATABASE])
        self.assertEqual(docker.exec_running["mariadb-fingerprint"], [DATABASE])
        self.assertEqual(docker.started, [APP])
        archive = self.directory / "dump.tar.gz"
        archive.write_bytes(client.objects[result["objectKey"]])
        extracted = self.directory / "dump-extracted"
        runner.safe_extract(archive, extracted)
        self.assertEqual(
            (extracted / "database/data.dump").read_bytes(),
            b"-- dump of shelf\nINSERT 42;\n",
        )
        self.assertEqual(
            (extracted / "state/files/attachment.bin").read_bytes(), b"attached bytes"
        )
        manifest = json.loads((extracted / "manifest.json").read_text())
        self.assertEqual(manifest["dumps"]["data"]["service"], "db")
        self.assertEqual(manifest["dumps"]["data"]["fingerprint"], "pages 3 sha 9f\n")
        self.assertNotIn(SECRET, json.dumps(manifest))

    def test_a_declared_dump_restores_into_a_fresh_instance_and_must_match_its_fingerprint(
        self,
    ):
        config, docker = self.dump_stack()
        state = self.state(config)
        client = FakeClient()
        stored = runner.perform_run(
            config, state, storage_factory=self.storage(client), command=docker
        )
        names = runner.restore_names(stored["id"])

        def restore(fingerprint):
            restorer = FakeDocker(
                exec_results={"mariadb": b"", "mariadb-fingerprint": fingerprint}
            )
            result = runner.perform_test_restore(
                config,
                state,
                stored["id"],
                storage_factory=self.storage(client),
                command=restorer,
            )["restore"]
            return result, restorer

        verified, restorer = restore(b"pages 3 sha 9f\n")
        self.assertEqual(verified["outcome"], "verified", verified["errorCode"])
        for check in ("file-inventory", "database-restored", "database-content"):
            self.assertIn(check, verified["checks"])
        # The dump captured with these files was loaded on standard input.
        self.assertEqual(
            restorer.stdin["mariadb"], [b"-- dump of shelf\nINSERT 42;\n"]
        )
        run = next(call for call in restorer.calls if call[:2] == ("docker", "run"))
        self.assertIn("--env-file", run)
        self.assertEqual(run[run.index("--network") + 1], "none")
        # Private values reach the instance through a file, never an argument.
        self.assertNotIn(SECRET, json.dumps(restorer.calls))
        self.assertEqual(restorer.removed, [names["container"], names["volume"]])
        self.assertTrue(verified["cleanupComplete"])
        changed, _ = restore(b"pages 2 sha 01\n")
        self.assertEqual(changed["outcome"], "failed")
        self.assertEqual(changed["errorCode"], "database-check-failed")
        self.assertTrue(changed["cleanupComplete"])

    def test_state_directories_are_private(self):
        state = self.state()
        for path in (state.root, state.runs, state.recovery, state.staging):
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o700)


if __name__ == "__main__":
    unittest.main()
