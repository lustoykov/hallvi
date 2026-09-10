import json
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DB = "/data/application.sqlite"
with sqlite3.connect(DB) as connection:
    connection.execute("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, value TEXT)")


class Handler(BaseHTTPRequestHandler):
    def reply(self, value):
        payload = json.dumps(value).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            return self.reply({"healthy": True})
        if self.path == "/version":
            return self.reply({"version": Path("version.txt").read_text().strip()})
        if self.path == "/result":
            result = Path("/results/job.txt")
            return self.reply({"result": result.read_text() if result.exists() else "pending"})
        with sqlite3.connect(DB) as connection:
            row = connection.execute("SELECT value FROM settings WHERE id = 1").fetchone()
        return self.reply({"value": row[0] if row else None})

    def do_POST(self):
        value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        with sqlite3.connect(DB) as connection:
            connection.execute("INSERT OR REPLACE INTO settings VALUES (1, ?)", (value["value"],))
        Path("/documents/job.txt").write_text(value["value"])
        self.reply(value)


HTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
