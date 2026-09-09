// Scripts Server Guy runs inside its own sibling containers. They are part of
// the trusted runner boundary: the proxy enforces the dependency network
// policy and the probe produces the health and behavior evidence, so neither
// the model nor repository code can author what they print.

/** An allowlisting CONNECT proxy: the only path out of the internal network
 * during dependency installation. Everything else is refused with 403. */
export const PROXY_SCRIPT = String.raw`
import asyncio, os, sys
ALLOWED = set(filter(None, os.environ.get("ALLOWED_HOSTS", "").split(",")))
PORT = int(os.environ.get("PROXY_PORT", "3128"))

async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass

async def handle(reader, writer):
    try:
        line = await asyncio.wait_for(reader.readline(), 15)
        parts = line.decode("latin-1").split()
        while True:
            header = await asyncio.wait_for(reader.readline(), 15)
            if header in (b"\r\n", b"\n", b""):
                break
        if len(parts) < 2 or parts[0] != "CONNECT":
            writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n")
            await writer.drain(); writer.close(); return
        host, _, port = parts[1].rpartition(":")
        if host not in ALLOWED or port != "443":
            sys.stdout.write("refused %s:%s\n" % (host, port)); sys.stdout.flush()
            writer.write(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
            await writer.drain(); writer.close(); return
        upstream_reader, upstream_writer = await asyncio.wait_for(asyncio.open_connection(host, 443), 20)
        sys.stdout.write("allowed %s:443\n" % host); sys.stdout.flush()
        writer.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
        await writer.drain()
        await asyncio.gather(pipe(reader, upstream_writer), pipe(upstream_reader, writer))
    except Exception as error:
        sys.stdout.write("error %s\n" % type(error).__name__); sys.stdout.flush()
        try:
            writer.close()
        except Exception:
            pass

async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT)
    sys.stdout.write("proxy ready\n"); sys.stdout.flush()
    async with server:
        await server.serve_forever()

asyncio.run(main())
`;

/** Waits for the health path, then runs the accepted behavior steps, printing
 * one JSON line per observation. The plan arrives in PROBE_PLAN. */
export const PROBE_SCRIPT = String.raw`
import json, os, sys, time, urllib.request, urllib.error
plan = json.loads(os.environ["PROBE_PLAN"])
base = plan["baseUrl"]

def emit(record):
    sys.stdout.write(json.dumps(record) + "\n"); sys.stdout.flush()

def request(method, path, body=None, timeout=10):
    data = body.encode("utf-8") if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read(200000).decode("utf-8", "replace"), None
    except urllib.error.HTTPError as error:
        try:
            text = error.read(200000).decode("utf-8", "replace")
        except Exception:
            text = ""
        return error.code, text, None
    except Exception as error:
        return None, "", "%s: %s" % (type(error).__name__, error)

deadline = time.monotonic() + float(plan.get("healthTimeout", 90))
status, text, error = None, "", None
attempts = 0
while time.monotonic() < deadline:
    attempts += 1
    status, text, error = request("GET", plan["healthPath"], timeout=3)
    if status == 200:
        break
    time.sleep(0.5)
emit({"phase": "health", "status": status, "attempts": attempts, "error": error, "body": text[:1000]})
if status != 200:
    emit({"phase": "done", "healthy": False})
    sys.exit(0)
for step in plan.get("steps", []):
    status, text, error = request(step["method"], step["path"], step.get("body"), timeout=15)
    missing = [needle for needle in step.get("expectBodyIncludes", []) if needle not in text]
    passed = status == step["expectStatus"] and not missing and error is None
    detail = error or ("status %s, expected %s" % (status, step["expectStatus"]) if status != step["expectStatus"] else ("body lacks %s" % ", ".join(json.dumps(item) for item in missing) if missing else "ok"))
    emit({"phase": "step", "name": step["name"], "request": "%s %s" % (step["method"], step["path"]), "status": status, "passed": passed, "detail": detail, "body": text[:4000]})
emit({"phase": "done", "healthy": True})
`;
