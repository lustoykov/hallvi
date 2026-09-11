// Rig B: start the Linux host container and the S3-compatible storage its
// backups upload to. Idempotent. MinIO comes from its own registry (Quay);
// Docker Hub no longer serves its latest tag. The host publishes HTTP on 127.0.0.1:80, so
// Rig A's containers must not hold that port. MinIO runs inside the host's
// own dockerd as https://s3.rig.amazonaws.com (the product's S3 endpoint
// rule), with a rig CA that only the host's server-guy-* units trust through
// a systemd drop-in: the stand-in for a public certificate authority. Test
// credentials stay under ignored tests/results/rig/<container>/.
// Usage: node tests/rig/host/start.mjs [container]
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? "sg-rig-host";
const results = resolve(here, "../../results/rig", name);
mkdirSync(results, { recursive: true });
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
const host = (script) =>
  execFileSync("docker", ["exec", "-i", name, "sh", "-c", script], {
    encoding: "utf8",
  }).trim();
const wait = (what, check, seconds = 90) => {
  for (let i = 0; ; i++) {
    try {
      check();
      return;
    } catch (error) {
      if (i >= seconds) throw new Error(`${what}: ${error}`);
      execFileSync("sleep", ["1"]);
    }
  }
};

if (!docker("ps", "-aq", "--filter", `name=^${name}$`))
  docker(
    "run",
    "--detach",
    "--name",
    name,
    "--hostname",
    "rig-host",
    // systemd gets a private cgroup namespace: with the engine's own tree it
    // would reorganize cgroups under every other container on the machine.
    "--privileged",
    "--cgroupns=private",
    // Inner image stores need real filesystems: overlay cannot nest on the
    // container's own overlay root.
    "--volume",
    `${name}-docker:/var/lib/docker`,
    "--volume",
    `${name}-containerd:/var/lib/containerd`,
    "--tmpfs",
    "/run",
    "--tmpfs",
    "/run/lock",
    "--publish",
    "127.0.0.1:80:80",
    "sg-rig-host:2",
  );
else docker("start", name);
wait("dockerd", () =>
  host("systemctl is-active --quiet docker && docker info >/dev/null"),
);

const credentials = join(results, "minio.json");
const keys = existsSync(credentials)
  ? JSON.parse(readFileSync(credentials, "utf8"))
  : {
      accessKeyId: `rig${randomBytes(8).toString("hex")}`,
      secretAccessKey: randomBytes(24).toString("hex"),
      bucket: "server-guy-backups",
    };
writeFileSync(credentials, JSON.stringify(keys, null, 2), { mode: 0o600 });
// Test credentials reach the host on standard input, never a command line.
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    name,
    "sh",
    "-c",
    "umask 077; mkdir -p /etc/rig-minio && cat > /etc/rig-minio/env",
  ],
  {
    input: [
      `MINIO_ROOT_USER=${keys.accessKeyId}`,
      `MINIO_ROOT_PASSWORD=${keys.secretAccessKey}`,
      // The bucket is created inside MinIO's own network namespace: a nested
      // container would resolve s3.rig.amazonaws.com through public DNS.
      `MC_HOST_local=https://${keys.accessKeyId}:${keys.secretAccessKey}@localhost:9000`,
      "",
    ].join("\n"),
  },
);
host(`set -e
mkdir -p /etc/rig-minio/certs
cd /etc/rig-minio/certs
# A container started before these existed leaves directories in their place.
for file in private.key public.crt; do [ ! -d "$file" ] || rmdir "$file"; done
if [ ! -f public.crt ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=Server Guy rig CA" -keyout ca.key -out ca.crt
  openssl req -newkey rsa:2048 -nodes -subj "/CN=s3.rig.amazonaws.com" -keyout private.key -out host.csr
  printf 'subjectAltName=DNS:s3.rig.amazonaws.com\\n' > san.cnf
  openssl x509 -req -in host.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 30 -extfile san.cnf -out public.crt
  chmod 644 private.key public.crt
fi
grep -q s3.rig.amazonaws.com /etc/hosts || echo '127.0.0.1 s3.rig.amazonaws.com' >> /etc/hosts
mkdir -p /etc/systemd/system/server-guy-.service.d
printf '[Service]\\nEnvironment=AWS_CA_BUNDLE=/etc/rig-minio/certs/ca.crt\\n' > /etc/systemd/system/server-guy-.service.d/rig-ca.conf
systemctl daemon-reload
if ! docker ps --format '{{.Names}}' | grep -qx rig-minio; then
  docker rm -f rig-minio >/dev/null 2>&1 || true
  docker run -d --name rig-minio --restart unless-stopped \\
    -p 127.0.0.1:443:9000 -v rig-minio-data:/data \\
    -v /etc/rig-minio/certs/public.crt:/root/.minio/certs/public.crt:ro \\
    -v /etc/rig-minio/certs/private.key:/root/.minio/certs/private.key:ro \\
    --env-file /etc/rig-minio/env quay.io/minio/minio:latest server /data >/dev/null
fi`);
wait(
  "MinIO",
  () =>
    host(
      "curl -sf --cacert /etc/rig-minio/certs/ca.crt https://s3.rig.amazonaws.com/minio/health/ready",
    ),
  120,
);
host(`docker run --rm --network container:rig-minio --env-file /etc/rig-minio/env \\
  quay.io/minio/mc:latest --insecure mb --ignore-existing local/${keys.bucket}`);
console.log(
  JSON.stringify({
    container: name,
    http: "http://127.0.0.1:80",
    storage: {
      provider: "s3",
      endpoint: "https://s3.rig.amazonaws.com",
      bucket: keys.bucket,
      region: "us-east-1",
      credentials,
    },
  }),
);
