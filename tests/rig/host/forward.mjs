// Publish local port 80 to a rig host published on another port, so the
// address the provider stand-in records (127.0.0.1) reaches that host. One
// host at a time owns the address: stop the first host's container first.
// macOS denies low ports to the CLI, so the forward is a small container from
// the rig host image, which Docker Desktop publishes on 127.0.0.1:80.
// Usage: node tests/rig/host/forward.mjs <target-port> [stop]
import { execFileSync } from "node:child_process";

const [target = "8082", stop] = process.argv.slice(2);
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
if (docker("ps", "-aq", "--filter", "name=^sg-rig-forward$"))
  docker("rm", "-f", "sg-rig-forward");
if (stop === "stop") process.exit(0);
const forwarder = `
import asyncio
async def pipe(reader, writer):
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except Exception:
        pass
    finally:
        writer.close()
async def handle(reader, writer):
    try:
        up_reader, up_writer = await asyncio.open_connection("host.docker.internal", ${Number(target)})
    except Exception:
        writer.close()
        return
    await asyncio.gather(pipe(reader, up_writer), pipe(up_reader, writer))
async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", 80)
    await server.serve_forever()
asyncio.run(main())
`;
docker(
  "run",
  "--detach",
  "--name",
  "sg-rig-forward",
  "--publish",
  "127.0.0.1:80:80",
  "--entrypoint",
  "python3",
  "sg-rig-host:2",
  "-c",
  forwarder,
);
console.log(`forwarding 127.0.0.1:80 -> 127.0.0.1:${target} (sg-rig-forward)`);
