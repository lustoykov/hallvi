import hashlib
import hmac
import json
import os
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pg8000.native

VERSION = Path(__file__).with_name("version.txt").read_text().strip()
SECRET = os.environ.get("APP_SECRET", "")
if not SECRET:
    raise SystemExit("APP_SECRET is required: it signs note digests.")
URL = urllib.parse.urlparse(os.environ["DATABASE_URL"])


def connect():
    for _ in range(60):
        try:
            return pg8000.native.Connection(
                user=urllib.parse.unquote(URL.username or ""),
                password=urllib.parse.unquote(URL.password or ""),
                host=URL.hostname,
                port=URL.port or 5432,
                database=URL.path.lstrip("/"),
            )
        except Exception:
            time.sleep(1)
    raise SystemExit("PostgreSQL is unreachable at DATABASE_URL.")


setup = connect()
setup.run("CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, body TEXT NOT NULL)")
setup.run("ALTER TABLE notes ADD COLUMN IF NOT EXISTS words INTEGER")
setup.close()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"healthy": True})
        if self.path == "/version":
            return self.reply(200, {"version": VERSION})
        if self.path == "/notes":
            connection = connect()
            rows = connection.run("SELECT id, body, words FROM notes ORDER BY id")
            connection.close()
            notes = [{"id": row[0], "body": row[1], "words": row[2]} for row in rows]
            digest = hmac.new(
                SECRET.encode(), json.dumps(notes, separators=(",", ":")).encode(), hashlib.sha256
            ).hexdigest()
            return self.reply(200, {"notes": notes, "digest": digest})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/notes":
            return self.reply(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}").get("body", "").strip()
        if not body:
            return self.reply(400, {"error": "body is required"})
        connection = connect()
        row = connection.run(
            "INSERT INTO notes (body) VALUES (:body) RETURNING id", body=body
        )
        connection.close()
        self.reply(201, {"id": row[0][0], "body": body})

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
