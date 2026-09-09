import importlib.util
import io
import json
import shutil
import sqlite3
import tarfile
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture = load("capture", "scripts/backup-proof/capture-sqlite-stack.py")
proof = load("proof", "scripts/backup-proof/prove-sqlite-stack.py")
functional = load("functional", "scripts/backup-proof/grafana-functional.py")


class BackupProofTest(unittest.TestCase):
    def test_cleanup_failure_preserves_restore_and_attempts_remaining_cleanup(self):
        receipt = {"status": "verified", "phase": "complete", "offHostVerified": True}
        calls = []

        def failed_source():
            calls.append("source")
            raise RuntimeError("Source unavailable during fixture deletion")

        def failed_local():
            calls.append("local")
            raise OSError("Docker unavailable")

        proof.finish_cleanup(
            receipt,
            [
                ("sourceFixturesRemoved", failed_source),
                ("restoreResourcesRemoved", failed_local),
                ("sourceStagingRemoved", lambda: calls.append("staging")),
            ],
        )
        self.assertEqual(calls, ["source", "local", "staging"])
        self.assertEqual(receipt["status"], "verified")
        self.assertFalse(receipt["sourceFixturesRemoved"])
        self.assertFalse(receipt["restoreResourcesRemoved"])
        self.assertTrue(receipt["sourceStagingRemoved"])

    def test_functional_verification_rejects_missing_dashboard_data_and_open_auth(self):
        dashboard = {"panels": [{"targets": [{"refId": "A"}]}] * 2}
        fixture = {"uid": "fixture", "dashboard": dashboard, "image": "fixture-image"}
        with tempfile.TemporaryDirectory() as directory:

            def request(path, body=None, raw=False):
                if path.startswith("/api/dashboards/"):
                    return {"dashboard": dashboard}
                if path == "/api/ds/query":
                    return {
                        "results": {
                            "A": {"frames": [{"data": {"values": [[1], [42]]}}]}
                        }
                    }
                return {
                    "secureJsonFields": {"basicAuthPassword": True},
                    "url": "http://fixture",
                }

            args = (
                fixture,
                "proof",
                "project",
                Path(directory),
                request,
                {"startedAt": 1000},
            )
            with self.assertRaisesRegex(RuntimeError, "reject invalid credentials"):
                functional.verify(lambda *a: b"[200, 200]", *args)
            with self.assertRaisesRegex(RuntimeError, "dashboard differs"):
                functional.verify(
                    lambda *a: b"[401, 401]",
                    *args[:4],
                    lambda *a, **k: {"dashboard": {}},
                    args[-1],
                )

            def empty_query(path, body=None, raw=False):
                if path == "/api/ds/query":
                    return {
                        "results": {"A": {"frames": [{"data": {"values": [[], []]}}]}}
                    }
                return request(path, body, raw)

            with self.assertRaisesRegex(RuntimeError, "empty frames"):
                functional.verify(
                    lambda *a: b"[401, 401]", *args[:4], empty_query, args[-1]
                )

    def test_functional_verification_rejects_changed_plugin_code(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plugin = root / "state/data/plugins/test"
            plugin.mkdir(parents=True)
            (plugin / "plugin.json").write_text(
                json.dumps({"id": "test", "name": "Test", "info": {"version": "1"}})
            )
            (plugin / "module.js").write_bytes(b"original module")
            dashboard = {"panels": [{"targets": [{"refId": "A"}]}] * 2}

            def request(path, body=None, raw=False):
                if raw:
                    return b"corrupted module"
                if path.startswith("/api/plugins/"):
                    return {"id": "test", "info": {"version": "1"}}
                if path.startswith("/api/dashboards/"):
                    return {"dashboard": dashboard}
                if path == "/api/ds/query":
                    return {
                        "results": {
                            "A": {"frames": [{"data": {"values": [[1], [42]]}}]}
                        }
                    }
                return {
                    "secureJsonFields": {"basicAuthPassword": True},
                    "url": "http://fixture",
                }

            with self.assertRaisesRegex(RuntimeError, "frontend module differs"):
                functional.verify(
                    lambda *a: b"[401, 401]",
                    {"uid": "fixture", "dashboard": dashboard, "image": "fixture"},
                    "proof",
                    "project",
                    root,
                    request,
                    {"startedAt": 1000},
                )

    def test_sqlite_backup_recovers_committed_wal_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = sqlite3.connect(root / "source.db")
            try:
                source.execute("PRAGMA journal_mode=WAL")
                source.execute(
                    "CREATE TABLE monitor(id INTEGER PRIMARY KEY, name TEXT)"
                )
                source.execute("INSERT INTO monitor VALUES (1,'persisted monitor')")
                source.commit()
                shutil.copyfile(root / "source.db", root / "blind-copy.db")
                target = sqlite3.connect(root / "backup.db")
                source.backup(target)
                target.close()
                expected = capture.sqlite_evidence(root / "source.db")
                self.assertEqual(capture.sqlite_evidence(root / "backup.db"), expected)
                self.assertNotEqual(
                    capture.sqlite_evidence(root / "blind-copy.db"), expected
                )
                source.execute("UPDATE monitor SET name='later change'")
                source.commit()
                self.assertNotEqual(
                    capture.sqlite_evidence(root / "source.db"), expected
                )
                self.assertEqual(capture.sqlite_evidence(root / "backup.db"), expected)
            finally:
                source.close()

    def test_sqlite_corruption_and_foreign_key_damage_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.db"
            with closing(sqlite3.connect(path)) as db:
                db.executescript(
                    "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id REFERENCES parent(id)); INSERT INTO child VALUES(999);"
                )
            with self.assertRaisesRegex(RuntimeError, "foreign-key"):
                capture.sqlite_evidence(path)
            path.write_bytes(b"invalid database")
            with self.assertRaises(sqlite3.DatabaseError):
                capture.sqlite_evidence(path)

    def test_business_comparison_ignores_only_observed_login_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.db"
            with closing(sqlite3.connect(path)) as db:
                db.executescript(
                    "CREATE TABLE user(login TEXT,password TEXT,last_seen_at TEXT); INSERT INTO user VALUES('admin','hash','before');"
                )
                original = capture.table_hash(path, "user", {"last_seen_at"})
                db.execute("UPDATE user SET last_seen_at='after'")
                db.commit()
                self.assertEqual(
                    capture.table_hash(path, "user", {"last_seen_at"}), original
                )
                db.execute("UPDATE user SET password='different'")
                db.commit()
                self.assertNotEqual(
                    capture.table_hash(path, "user", {"last_seen_at"}), original
                )

    def test_archive_traversal_and_symlinks_are_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, link in [("../outside", False), ("state/link", True)]:
                archive = root / "test.tar.gz"
                with tarfile.open(archive, "w:gz") as bundle:
                    entry = tarfile.TarInfo(name)
                    if link:
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = "../../outside"
                    else:
                        entry.size = 1
                    bundle.addfile(entry, None if link else io.BytesIO(b"x"))
                with self.assertRaisesRegex(RuntimeError, "Unsafe"):
                    proof.safe_extract(archive, root / "restored")
                self.assertFalse((root / "outside").exists())

    def test_source_inventory_never_follows_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "link").symlink_to("/etc/passwd")
            with self.assertRaisesRegex(RuntimeError, "link"):
                capture.inventory(root)

    def test_source_restarts_if_copy_fails_after_stop(self):
        deployment = "11111111-1111-4111-8111-111111111111"
        proof_id = "22222222-2222-4222-8222-222222222222"
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            source = temp / "sources" / deployment
            source.mkdir(parents=True)
            volume = temp / "volume"
            volume.mkdir()
            (volume / "data").write_text("state")
            image = "louislam/uptime-kuma@sha256:" + "a" * 64
            (source / "compose.json").write_text(
                json.dumps({"services": {"app": {"image": image}}})
            )
            state = {"Running": True, "ExitCode": 0}
            calls = []

            def command(*args):
                calls.append(args)
                if args[:2] == ("docker", "compose"):
                    return ("a" * 64).encode()
                if args[:2] == ("docker", "inspect"):
                    return json.dumps(
                        [
                            {
                                "State": dict(state),
                                "Config": {
                                    "Image": image,
                                    "Labels": {"com.docker.compose.service": "app"},
                                },
                                "Mounts": [
                                    {
                                        "Type": "volume",
                                        "Name": "sg-11111111_data",
                                        "Source": str(volume),
                                        "Destination": "/app/data",
                                    }
                                ],
                            }
                        ]
                    ).encode()
                if args[:2] == ("docker", "stop"):
                    state["Running"] = False
                if args[:2] == ("docker", "start"):
                    state["Running"] = True
                return b""

            def path(value):
                if value == "/opt/server-guy":
                    return temp / "sources"
                if value == "/var/tmp":
                    return temp
                return Path(value)

            with (
                patch.object(capture, "Path", side_effect=path),
                patch.object(capture, "command", side_effect=command),
                patch.object(
                    capture.shutil, "copytree", side_effect=RuntimeError("copy failed")
                ),
                self.assertRaisesRegex(RuntimeError, "copy failed"),
            ):
                capture.capture(deployment, proof_id)
            self.assertTrue(state["Running"])
            self.assertTrue(any(call[:2] == ("docker", "stop") for call in calls))
            self.assertEqual(calls[-2][:2], ("docker", "start"))


if __name__ == "__main__":
    unittest.main()
