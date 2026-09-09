import { getApplication } from "./db";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isIP } from "node:net";
import { piConfigDir } from "./pi-configuration";
import {
  hetzner,
  hetznerConnectionId,
  HetznerError,
  smallestHostOffer,
} from "./hetzner";
import { checkDeploymentSource } from "./deployment-source";
import {
  installMetadataGuard,
  metadataGuardScript,
  metadataGuardDropIn,
} from "./host-metadata-guard";
import {
  deploymentEvent,
  deploymentMessage,
  saveDeployment,
} from "./deployment-store";
import {
  deploymentPlanSchema,
  type DeploymentPlan,
  type DeploymentRecord,
} from "./deployment-types";
import { fetchBaseTree } from "./execution-tree";
import { writeTar } from "./tar";
import { deniedPathReason, redactSecrets } from "./secrets";

export function deploymentDirectory(record: DeploymentRecord) {
  const directory = join(piConfigDir(), "deployments", record.id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}
export function saveDeploymentInputs(
  record: DeploymentRecord,
  input: Record<string, string>,
) {
  const allowed = new Set(record.plan?.missingInputs.map((i) => i.name));
  for (const key of Object.keys(input))
    if (!allowed.has(key)) throw new Error("Unexpected deployment input.");
  for (const key of allowed)
    if (!input[key]?.trim())
      throw new Error(`Provide ${key} before deploying.`);
  writeFileSync(
    join(deploymentDirectory(record), "inputs.json"),
    JSON.stringify(input),
    { mode: 0o600 },
  );
}
function inputs(record: DeploymentRecord): Record<string, string> {
  try {
    return JSON.parse(
      readFileSync(join(deploymentDirectory(record), "inputs.json"), "utf8"),
    );
  } catch {
    if (record.plan?.missingInputs.length)
      throw new Error(
        "The saved deployment inputs are unavailable. Restore them before retrying.",
      );
    return {};
  }
}
function databasePassword(record: DeploymentRecord) {
  const path = join(deploymentDirectory(record), "database-password");
  if (!existsSync(path) && record.serverCreateAttempted)
    throw new Error(
      "The deployment database credential is missing. Restore controller state before retrying; the existing database password was not changed.",
    );
  if (!existsSync(path))
    writeFileSync(path, randomBytes(24).toString("hex"), {
      mode: 0o600,
      flag: "wx",
    });
  return readFileSync(path, "utf8");
}
export function composeDefinition(
  plan: DeploymentPlan,
  revision: string,
  id: string,
  password: string,
  supplied: Record<string, string>,
) {
  const environment = Object.fromEntries(
    plan.environment.map((item) => [item.name, item.value]),
  );
  Object.assign(environment, supplied);
  if (plan.postgres)
    environment[plan.postgres.variable] =
      `${plan.postgres.scheme}://serverguy:${password}@postgres:5432/application`;
  // Compose interprets dollars in values, including user secrets. Escape once
  // at serialization; never let a remote shell expand these strings.
  const literal = (value: string) => value.replaceAll("$", () => "$$");
  const services: Record<string, unknown> = {
    app: {
      image: `server-guy-${id}:${revision}`,
      build: {
        context: `./source/${plan.context}`,
        dockerfile:
          plan.context === "."
            ? plan.dockerfile
            : `${"../".repeat(plan.context.split("/").length)}${plan.dockerfile}`,
      },
      restart: "unless-stopped",
      ports: [`80:${plan.port}`],
      environment: Object.fromEntries(
        Object.entries(environment).map(([key, value]) => [
          key,
          literal(value),
        ]),
      ),
      labels: { "server-guy.revision": revision, "server-guy.deployment": id },
      ...(plan.command ? { command: plan.command.map(literal) } : {}),
      ...(plan.postgres
        ? { depends_on: { postgres: { condition: "service_healthy" } } }
        : {}),
      logging: {
        driver: "json-file",
        options: { "max-size": "10m", "max-file": "3" },
      },
    },
  };
  if (plan.postgres)
    services.postgres = {
      image: `postgres:${plan.postgres.version}`,
      restart: "unless-stopped",
      environment: {
        POSTGRES_USER: "serverguy",
        POSTGRES_PASSWORD: password,
        POSTGRES_DB: "application",
      },
      volumes: [
        `database:/var/lib/postgresql${plan.postgres.version === "18" ? "" : "/data"}`,
      ],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U serverguy -d application"],
        interval: "5s",
        timeout: "5s",
        retries: 20,
      },
      logging: {
        driver: "json-file",
        options: { "max-size": "10m", "max-file": "3" },
      },
    };
  return { services, ...(plan.postgres ? { volumes: { database: {} } } : {}) };
}

async function command(
  file: string,
  args: string[],
  signal: AbortSignal,
  input?: Buffer | string,
  onOutput?: (text: string) => void,
  timeout = 900000,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const stop = () => child.kill("SIGTERM");
    const timer = setTimeout(stop, timeout);
    signal.addEventListener("abort", stop, { once: true });
    const receive = (chunk: Buffer) => {
      const text = chunk.toString();
      output = (output + text).slice(-60000);
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    child.on("error", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      reject(new Error(`Could not start ${file}.`));
    });
    child.on("close", (code) => {
      onOutput?.(output);
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(new Error("Deployment interrupted."));
      else if (code !== 0)
        reject(
          new Error(`${file} failed. Inspect the redacted deployment log.`),
        );
      else resolve(output);
    });
  });
}
async function ensureKeys(record: DeploymentRecord, signal: AbortSignal) {
  const directory = deploymentDirectory(record);
  for (const name of ["client", "host"]) {
    const path = join(directory, name);
    if (!existsSync(path))
      await command(
        "ssh-keygen",
        ["-q", "-t", "ed25519", "-N", "", "-f", path],
        signal,
      );
  }
}
type Server = {
  id: number;
  name: string;
  status: string;
  public_net: { ipv4: { ip: string } | null };
  labels: Record<string, string>;
};
export async function provision(record: DeploymentRecord, signal: AbortSignal) {
  const provider = <T>(path: string, body?: unknown) => {
    if (record.authority?.connectionId !== hetznerConnectionId())
      throw new Error(
        "Hetzner access changed during deployment. Reconnect the approved project.",
      );
    return hetzner<T>(path, body);
  };
  if (record.authority?.connectionId !== hetznerConnectionId())
    throw new Error(
      "Hetzner access changed. Review the deployment before creating or using a server.",
    );
  if (
    !record.offer ||
    !record.authority ||
    record.offer.monthly > record.authority.maxMonthly
  )
    throw new Error("The server cost exceeds the accepted recommendation.");
  await ensureKeys(record, signal);
  const label = `sg-deployment=${record.id}`;
  const query = `?label_selector=${encodeURIComponent(label)}`;
  const matches = (await provider<{ servers: Server[] }>(`/servers${query}`))
    .servers;
  if (matches.length > 1)
    throw new Error(
      "More than one server matches this deployment. Reconcile the resources before proceeding.",
    );
  let server = matches[0];
  if (!server && record.serverId)
    throw new Error(
      "The recorded server is missing. A replacement requires a separate decision.",
    );
  if (!server && record.serverCreateAttempted)
    throw new Error(
      "A server creation was already attempted but its outcome is unresolved. No second purchase was made. Check the Hetzner project and retry reconciliation.",
    );
  if (!server) {
    const current = await smallestHostOffer(record.offer);
    if (
      current.monthly > record.authority.maxMonthly ||
      current.currency !== record.offer.currency
    ) {
      record.offer = current;
      record.authority = null;
      record.recommendationId = randomUUID();
      record.status = "awaiting-approval";
      deploymentEvent(
        record,
        "Server pricing changed. Review the current cost before purchase.",
      );
      throw new Error("Review the updated server price before deploying.");
    }
    record.offer = current;
    deploymentEvent(
      record,
      "Preparing SSH access and a firewall for SSH and HTTP",
    );
    const directory = deploymentDirectory(record);
    const name = `sg-${record.id.slice(0, 8)}`;
    let key = (
      await provider<{ ssh_keys: { id: number }[] }>(`/ssh_keys${query}`)
    ).ssh_keys[0];
    if (!key)
      key = (
        await provider<{ ssh_key: { id: number } }>("/ssh_keys", {
          name,
          public_key: readFileSync(
            join(directory, "client.pub"),
            "utf8",
          ).trim(),
          labels: { "sg-deployment": record.id },
        })
      ).ssh_key;
    let firewall = (
      await provider<{ firewalls: { id: number }[] }>(`/firewalls${query}`)
    ).firewalls[0];
    if (!firewall)
      firewall = (
        await provider<{ firewall: { id: number } }>("/firewalls", {
          name,
          labels: { "sg-deployment": record.id },
          rules: [22, 80].map((port) => ({
            direction: "in",
            protocol: "tcp",
            port: String(port),
            source_ips: ["0.0.0.0/0", "::/0"],
          })),
        })
      ).firewall;
    const cloudConfig = {
      ssh_pwauth: false,
      disable_root: false,
      ssh_keys: {
        ed25519_private: readFileSync(join(directory, "host"), "utf8"),
        ed25519_public: readFileSync(
          join(directory, "host.pub"),
          "utf8",
        ).trim(),
      },
      package_update: true,
      packages: ["docker.io", "docker-compose-v2"],
      write_files: [
        {
          path: "/usr/local/sbin/server-guy-metadata-guard",
          permissions: "0700",
          content: metadataGuardScript,
        },
        {
          path: "/etc/systemd/system/docker.service.d/server-guy-metadata.conf",
          permissions: "0644",
          content: metadataGuardDropIn,
        },
      ],
      runcmd: [
        ["systemctl", "daemon-reload"],
        ["systemctl", "enable", "--now", "docker"],
        ["/usr/local/sbin/server-guy-metadata-guard"],
      ],
    };
    record.serverCreateAttempted = true;
    deploymentEvent(record, "Creating the accepted Hetzner instance");
    try {
      server = (
        await provider<{ server: Server }>("/servers", {
          name,
          server_type: record.offer.serverType,
          location: record.offer.location,
          image: "ubuntu-24.04",
          ssh_keys: [key.id],
          firewalls: [{ firewall: firewall.id }],
          labels: { "sg-deployment": record.id },
          public_net: { enable_ipv4: true, enable_ipv6: false },
          user_data: `#cloud-config\n${JSON.stringify(cloudConfig)}`,
        })
      ).server;
    } catch (error) {
      if (error instanceof HetznerError && error.definitelyNotCreated) {
        record.serverCreateAttempted = false;
        deploymentEvent(
          record,
          "Hetzner rejected creation without creating a server. Setup can be retried or cancelled.",
        );
      }
      throw error;
    }
  }
  if (server.labels["sg-deployment"] !== record.id)
    throw new Error("Server identity does not match this deployment.");
  record.serverId = server.id;
  record.address = server.public_net.ipv4?.ip ?? null;
  saveDeployment(record);
  for (let attempt = 0; attempt < 90; attempt++) {
    signal.throwIfAborted();
    server = (await provider<{ server: Server }>(`/servers/${record.serverId}`))
      .server;
    if (server.status === "running" && server.public_net.ipv4) break;
    await delay(2000, undefined, { signal });
  }
  record.address = server.public_net.ipv4?.ip ?? null;
  if (!record.address || isIP(record.address) !== 4)
    throw new Error("The server has no verified public IPv4 address yet.");
  writeFileSync(
    join(deploymentDirectory(record), "known_hosts"),
    `${record.address} ${readFileSync(join(deploymentDirectory(record), "host.pub"), "utf8").trim()}\n`,
    { mode: 0o600 },
  );
  saveDeployment(record);
}
function sshArgs(record: DeploymentRecord) {
  if (!record.address || isIP(record.address) !== 4)
    throw new Error("A valid host address is required.");
  const directory = deploymentDirectory(record);
  return [
    "-i",
    join(directory, "client"),
    "-o",
    `UserKnownHostsFile=${join(directory, "known_hosts")}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ConnectTimeout=10",
    `root@${record.address}`,
  ];
}
export async function hardenDeploymentHost(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  await command("ssh", [...sshArgs(record), installMetadataGuard], signal);
}
function logOutput(record: DeploymentRecord, text: string) {
  let safe = text;
  const secrets = [
    databasePassword(record),
    ...Object.values(inputs(record)),
  ].filter((v) => v.length > 0);
  for (const secret of secrets) safe = safe.replaceAll(secret, "[REDACTED]");
  record.logs = (record.logs + redactSecrets(safe).text).slice(-50000);
  saveDeployment(record);
}
export async function executeDeployment(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  if (!record.plan || !record.revision || !record.authority)
    throw new Error("A reviewed deployment recommendation is required.");
  const application = getApplication(record.applicationId);
  if (
    !application ||
    `${application.repositoryOwner}/${application.repositoryName}` !==
      record.repository
  )
    throw new Error(
      "The application source changed. This deployment cannot be applied to another repository.",
    );
  deploymentPlanSchema.parse(record.plan);
  await checkDeploymentSource(record);
  databasePassword(record);
  record.status = "deploying";
  record.error = null;
  saveDeployment(record);
  await provision(record, signal);
  deploymentEvent(
    record,
    "Waiting for the pinned SSH host and Docker Compose installation",
  );
  let connected = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      await command(
        "ssh",
        [
          ...sshArgs(record),
          "cloud-init status --wait >/dev/null && docker compose version",
        ],
        signal,
        undefined,
        undefined,
        300000,
      );
      connected = true;
      break;
    } catch {
      signal.throwIfAborted();
      await delay(3000, undefined, { signal });
    }
  }
  if (!connected)
    throw new Error(
      "SSH or host preparation is not ready. The existing server is retained for investigation.",
    );
  await hardenDeploymentHost(record, signal);
  deploymentEvent(
    record,
    "Metadata access restricted before running application code",
  );
  if (record.imageId) {
    const current = await command(
      "ssh",
      [
        ...sshArgs(record),
        `cd /opt/server-guy/${record.id} && docker inspect --format '{{.Image}} {{index .Config.Labels "server-guy.revision"}} {{.State.Running}}' $(docker compose -p sg-${record.id.slice(0, 8)} -f compose.json ps -q app)`,
      ],
      signal,
    );
    if (current.trim() !== `${record.imageId} ${record.revision} true`)
      throw new Error(
        "The previously built container changed or stopped. Investigate it before retrying verification.",
      );
    deploymentEvent(
      record,
      "Reconciled the existing container; resuming verification without rebuilding",
    );
  } else {
    deploymentEvent(
      record,
      "Host prepared; uploading the exact source revision and deployment configuration",
    );
    const { token } = await checkDeploymentSource(record);
    const files = await fetchBaseTree(
      record.repository,
      record.revision,
      token,
      signal,
    );
    const safe = files.filter((file) => !deniedPathReason(file.path));
    if (safe.length !== files.length)
      throw new Error(
        "The repository contains credential-bearing paths. Review them before transferring source to the host.",
      );
    if (record.plan.generatedDockerfile)
      safe.push({
        path: record.plan.dockerfile,
        content: Buffer.from(record.plan.generatedDockerfile),
        mode: 0o644,
      });
    const compose = composeDefinition(
      record.plan,
      record.revision,
      record.id,
      databasePassword(record),
      inputs(record),
    );
    const archive = await writeTar([
      ...safe.map((file) => ({ ...file, path: `source/${file.path}` })),
      {
        path: "compose.json",
        content: Buffer.from(JSON.stringify(compose)),
        mode: 0o600,
      },
    ]);
    const root = `/opt/server-guy/${record.id}`;
    await command(
      "ssh",
      [...sshArgs(record), `umask 077; mkdir -p ${root}; tar -xf - -C ${root}`],
      signal,
      archive,
    );
    deploymentEvent(
      record,
      "Building the application and starting its Compose services",
    );
    await command(
      "ssh",
      [
        ...sshArgs(record),
        `cd ${root} && docker compose -p sg-${record.id.slice(0, 8)} -f compose.json up -d --build --wait --wait-timeout 120`,
      ],
      signal,
      undefined,
      (text) => logOutput(record, text),
    );
    const serving = await command(
      "ssh",
      [
        ...sshArgs(record),
        `cd ${root} && docker inspect --format '{{.Image}} {{index .Config.Labels "server-guy.revision"}} {{.State.Running}}' $(docker compose -p sg-${record.id.slice(0, 8)} -f compose.json ps -q app)`,
      ],
      signal,
    );
    const parts = serving.trim().split(/\s+/);
    if (
      !/^sha256:[0-9a-f]{64}$/.test(parts[0]) ||
      parts[1] !== record.revision ||
      parts[2] !== "true"
    )
      throw new Error(
        "The serving container does not match the selected revision.",
      );
    record.imageId = parts[0];
    saveDeployment(record);
  }
  deploymentEvent(
    record,
    "Checking public HTTP and application behavior from outside the host",
  );
  await verifyDeployment(record, signal);
  await collectDeploymentLogs(record, signal);
  record.status = "live";
  record.url = `http://${record.address}`;
  record.verifiedAt = new Date().toISOString();
  deploymentEvent(
    record,
    "Public application behavior verified against the deployed revision",
  );
  deploymentMessage(
    record,
    `Your application is running at ${record.url}. I verified the serving revision and the application checks: ${record.plan.checks.map((c) => c.name).join(", ")}.${record.plan.postgres ? " PostgreSQL is private to the Compose network and uses a persistent volume. Backups are not configured yet." : ""} This first deployment uses HTTP; a domain and HTTPS have not been configured.`,
  );
}
export async function collectDeploymentLogs(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  const output = await command(
    "ssh",
    [
      ...sshArgs(record),
      `cd /opt/server-guy/${record.id} && docker compose -p sg-${record.id.slice(0, 8)} -f compose.json logs --no-color --tail 100`,
    ],
    signal,
    undefined,
    undefined,
    30000,
  );
  record.logsCollectedAt = new Date().toISOString();
  logOutput(record, `\n--- Application logs ---\n${output}`);
}
export async function verifyDeployment(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  const origin = `http://${record.address}`;
  const request = async (path: string, init: RequestInit = {}) => {
    const url = new URL(path, origin);
    if (url.origin !== origin)
      throw new Error("Verification must stay on the application host.");
    return fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });
  };
  // A running container may still be initializing its HTTP listener. Retry
  // only the non-mutating readiness check; never blindly repeat a POST.
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    signal.throwIfAborted();
    try {
      const health = await request(record.plan!.healthPath);
      if (health.ok) {
        ready = true;
        break;
      }
      if (health.status < 500)
        throw new Error(
          `Public application check rejected (HTTP ${health.status}).`,
        );
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof Error &&
        error.message.startsWith("Public application check rejected")
      )
        throw error;
    }
    await delay(2000, undefined, { signal });
  }
  if (!ready)
    throw new Error(
      "The public application did not become ready within the verification window. The existing host is retained.",
    );
  const cleanup = async () => {
    if (!record.cleanup) return;
    const response = await request(record.cleanup.path, { method: "DELETE" });
    if (
      response.status !== record.cleanup.expectedStatus &&
      response.status !== 404
    )
      throw new Error(
        "The verification test object could not be removed. Resolve cleanup before retrying application checks.",
      );
    record.cleanup = null;
    record.verificationPending = null;
    deploymentEvent(record, "Removed the verification test object");
  };
  await cleanup();
  if (record.verificationPending)
    throw new Error(
      "A previous test-object creation has an unknown outcome. Inspect the application for marker " +
        record.verificationPending +
        " before repeating verification.",
    );
  let captured = "";
  const marker = `sg-check-${randomBytes(6).toString("hex")}`;
  try {
    for (const check of record.plan!.checks) {
      const path = check.path.replaceAll("{id}", encodeURIComponent(captured));
      if (check.path.includes("{id}") && !captured)
        throw new Error("A verification step requires a captured object ID.");
      const body = check.body
        ? JSON.stringify(check.body).replaceAll("SG_VERIFY_TOKEN", marker)
        : undefined;
      if (check.method === "POST") {
        record.verificationPending = marker;
        saveDeployment(record);
      }
      const response = await request(path, {
        method: check.method,
        ...(body
          ? { body, headers: { "Content-Type": "application/json" } }
          : {}),
      });
      const text = await response.text();
      if (check.captureId) {
        let value: unknown = JSON.parse(text);
        for (const part of check.captureId.split("."))
          value = (value as Record<string, unknown>)?.[part];
        if (!["string", "number"].includes(typeof value))
          throw new Error("The verification response had no usable object ID.");
        captured = String(value);
      }
      if (check.method === "POST" && captured) {
        const removal = record.plan!.checks.find(
          (c) => c.method === "DELETE" && c.path.includes("{id}"),
        );
        if (removal) {
          record.cleanup = {
            path: removal.path.replaceAll("{id}", encodeURIComponent(captured)),
            expectedStatus: removal.expectedStatus,
            marker,
          };
          saveDeployment(record);
        }
      }
      if (
        response.status !== check.expectedStatus ||
        !text.includes(check.contains.replaceAll("SG_VERIFY_TOKEN", marker))
      )
        throw new Error(
          `Application behavior check failed: ${check.name} (HTTP ${response.status}).`,
        );
      if (check.method === "DELETE") {
        record.cleanup = null;
        record.verificationPending = null;
        saveDeployment(record);
      }
      deploymentEvent(record, `Passed: ${check.name}`);
    }
  } catch (error) {
    try {
      await cleanup();
    } catch {
      throw new Error(
        "Application verification failed and its test object still needs cleanup. Retry cleanup before running more checks.",
      );
    }
    throw error;
  }
}
