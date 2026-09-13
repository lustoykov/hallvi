"""The web process. HTTP on 8000; orders in PostgreSQL, queued through Redis."""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

import psycopg
import redis

DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]
CURRENCY = os.environ.get("SHOP_CURRENCY", "EUR")
ADMIN_PASSWORD = os.environ["SHOP_ADMIN_PASSWORD"]
RECEIPTS_DIR = os.environ.get("RECEIPTS_DIR", "/var/lib/shop/receipts")

SCHEMA = """
create table if not exists orders (
  id serial primary key,
  item text not null,
  cents integer,
  placed_at timestamptz not null default now()
)
"""


def setup():
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute(SCHEMA)
    os.makedirs(RECEIPTS_DIR, exist_ok=True)


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True})
        if self.path == "/orders":
            with psycopg.connect(DATABASE_URL) as connection:
                rows = connection.execute(
                    "select id, item, cents from orders order by id desc limit 50"
                ).fetchall()
            return self.reply(
                200,
                {
                    "currency": CURRENCY,
                    "orders": [
                        {"id": row[0], "item": row[1], "cents": row[2]} for row in rows
                    ],
                },
            )
        if self.path.startswith("/receipts/"):
            name = os.path.basename(self.path.removeprefix("/receipts/"))
            path = os.path.join(RECEIPTS_DIR, f"{name}.txt")
            if not os.path.exists(path):
                return self.reply(404, {"error": "no receipt"})
            with open(path, encoding="utf8") as handle:
                return self.reply(200, {"receipt": handle.read()})
        if self.path == "/admin/summary":
            if self.headers.get("X-Admin-Password") != ADMIN_PASSWORD:
                return self.reply(401, {"error": "wrong password"})
            with psycopg.connect(DATABASE_URL) as connection:
                total = connection.execute(
                    "select count(*), coalesce(sum(cents), 0) from orders"
                ).fetchone()
            return self.reply(
                200, {"orders": total[0], "cents": total[1], "currency": CURRENCY}
            )
        return self.reply(404, {"error": "no such path"})

    def do_POST(self):
        if self.path != "/orders":
            return self.reply(404, {"error": "no such path"})
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        item = str(body.get("item", "")).strip()
        if not item:
            return self.reply(400, {"error": "item is required"})
        with psycopg.connect(DATABASE_URL) as connection:
            row = connection.execute(
                "insert into orders (item) values (%s) returning id", (item,)
            ).fetchone()
            connection.commit()
        redis.from_url(REDIS_URL).rpush("orders", row[0])
        return self.reply(201, {"id": row[0], "item": item})

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    setup()
    print("shop web listening on 8000", flush=True)
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
