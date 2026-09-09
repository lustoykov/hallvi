"""Private, disposable HTTP fixture. Never logs headers, passwords or bodies."""

import base64
import hmac
import json
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

with open(sys.argv[1]) as config_file:
    config = json.load(config_file)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def forward(self):
        if config.get("password"):
            expected = (
                "Basic "
                + base64.b64encode(("proof:" + config["password"]).encode()).decode()
            )
            if not hmac.compare_digest(self.headers.get("Authorization", ""), expected):
                self.send_response(401)
                self.send_header("WWW-Authenticate", 'Basic realm="Restore proof"')
                self.end_headers()
                return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower()
            not in {"host", "connection", "content-length", "accept-encoding"}
            and not (config.get("password") and key.lower() == "authorization")
        }
        request = urllib.request.Request(
            config["upstream"] + self.path,
            data=body if body else None,
            method=self.command,
            headers=headers,
        )
        try:
            response = urllib.request.urlopen(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        except (OSError, urllib.error.URLError):
            self.send_error(502, "Fixture upstream unavailable")
            return
        with response:
            data = response.read()
            self.send_response(response.status)
            for key, value in response.headers.items():
                if key.lower() not in {
                    "transfer-encoding",
                    "connection",
                    "content-length",
                    "content-encoding",
                }:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    do_GET = do_POST = do_PUT = do_DELETE = forward


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
