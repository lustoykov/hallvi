// Rig B: real SSH into the isolated host container.
//
// The product's private access is a real SSH master with a real port forward
// (`ssh -M -f -N -T -L 127.0.0.1:<local>:127.0.0.1:<remote>`), pinned to a
// host key it scanned itself. None of that can be emulated by a shim that
// runs commands with `docker exec`, so the rig runs an actual sshd inside the
// host container and publishes it on loopback. The product then does its own
// host-key verification, its own key authentication and its own forwarding —
// only the address is the rig's fiction.
//
// Test-only: the container's host key and the controller's per-application
// key both live under the ignored rig results; the endpoint is bound to
// 127.0.0.1 and reaches one throwaway container.
//
// Usage: node tests/rig/host/ssh.mjs [container] [port]
//        [--authorize <pubkey path>]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const authorizeIndex = args.indexOf("--authorize");
const authorize =
  authorizeIndex >= 0 ? args.splice(authorizeIndex, 2)[1] : null;
const [container = "sg-rig-host", port = "2222"] = args;
const docker = (...rest) =>
  execFileSync("docker", rest, { encoding: "utf8" }).trim();
const host = (script) =>
  execFileSync("docker", ["exec", "-i", container, "sh", "-c", script], {
    encoding: "utf8",
  }).trim();

// 1. An sshd the product can actually connect to. Root with a key only:
// no password path exists to weaken.
host(`
set -e
if ! command -v sshd >/dev/null 2>&1; then
  apt-get update -qq >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openssh-server >/dev/null 2>&1
fi
mkdir -p /run/sshd /root/.ssh /etc/ssh/sshd_config.d
chmod 700 /root/.ssh
printf 'PermitRootLogin prohibit-password\\nPasswordAuthentication no\\nKbdInteractiveAuthentication no\\nAllowTcpForwarding yes\\nPermitOpen 127.0.0.1:*\\n' > /etc/ssh/sshd_config.d/rig.conf
systemctl enable ssh >/dev/null 2>&1 || true
systemctl restart ssh
`);

// 2. The key the controller generated for this application, as a provider
// would install it from the create request.
if (authorize) {
  const key = readFileSync(authorize, "utf8").trim();
  docker(
    "exec",
    "-i",
    container,
    "sh",
    "-c",
    `set -e
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
grep -qxF -- "$1" /root/.ssh/authorized_keys || printf '%s\\n' "$1" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys`,
    "rig-authorize",
    key,
  );
}

// 3. A loopback-bound endpoint. The host container was started without this
// mapping, and recreating it would destroy whatever is deployed inside, so a
// small forwarder in the same engine publishes it.
const address = docker(
  "inspect",
  "-f",
  "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
  container,
);
const name = `sg-rig-ssh-${port}`;
if (docker("ps", "-aq", "--filter", `name=^${name}$`)) docker("rm", "-f", name);
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
        try: writer.close()
        except Exception: pass
async def handle(reader, writer):
    try:
        up_reader, up_writer = await asyncio.open_connection("${address}", 22)
    except Exception:
        writer.close(); return
    await asyncio.gather(pipe(reader, up_writer), pipe(up_reader, writer))
async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", 22)
    await server.serve_forever()
asyncio.run(main())
`;
docker(
  "run",
  "--detach",
  "--name",
  name,
  "--publish",
  `127.0.0.1:${port}:22`,
  "--entrypoint",
  "python3",
  docker("inspect", "-f", "{{.Config.Image}}", container),
  "-c",
  forwarder,
);
console.log(
  JSON.stringify({ container, endpoint: `127.0.0.1:${port}`, authorize }),
);
