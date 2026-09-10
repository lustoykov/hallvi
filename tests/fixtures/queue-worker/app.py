"""Synthetic deployment fixture. Web enqueues; only the worker writes results."""
import json
import os
import socket
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def redis(*args):
    with socket.create_connection((os.environ["QUEUE_HOST"], 6379), timeout=3) as sock:
        stream = sock.makefile("rb")

        def execute(*values):
            parts = [str(v).encode() for v in values]
            sock.sendall(b"*%d\r\n" % len(parts) + b"".join(b"$%d\r\n" % len(p) + p + b"\r\n" for p in parts))
            prefix = stream.read(1)
            line = stream.readline().rstrip(b"\r\n")
            if prefix == b"-":
                raise RuntimeError("Queue request failed")
            if prefix == b"$":
                size = int(line)
                if size < 0:
                    return None
                value = stream.read(size)
                stream.read(2)
                return value.decode()
            return line.decode()

        execute("AUTH", os.environ["QUEUE_PASSWORD"])
        return execute(*args)


class Web(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/jobs":
            return self.reply(404, {})
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        job_id = str(uuid.uuid4())
        redis("SET", "job:" + job_id, data["message"])
        redis("RPUSH", "jobs", job_id)
        self.reply(201, {"id": job_id, "message": data["message"]})

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"queue": redis("PING")})
        if self.path == "/":
            return self.reply(200, {"application": "Background job fixture"})
        job_id = self.path.removeprefix("/jobs/")
        result = redis("GET", "result:" + job_id)
        self.reply(200 if result else 202, {"result": result})

    def do_DELETE(self):
        job_id = self.path.removeprefix("/jobs/")
        redis("LREM", "jobs", 0, job_id)
        redis("DEL", "job:" + job_id, "result:" + job_id)
        self.reply(200, {"deleted": True})


def worker():
    while True:
        redis("SET", "worker-alive", "yes", "EX", 10)
        job_id = redis("LPOP", "jobs")
        if job_id:
            message = redis("GET", "job:" + job_id)
            if message:
                redis("SET", "result:" + job_id, "processed:" + message)
        time.sleep(0.2)


if __name__ == "__main__":
    if sys.argv[1] == "worker":
        worker()
    elif sys.argv[1] == "ready":
        assert redis("GET", "worker-alive") == "yes"
    else:
        ThreadingHTTPServer(("0.0.0.0", 8080), Web).serve_forever()
