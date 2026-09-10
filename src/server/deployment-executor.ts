import { invalidateDeploymentRuntime } from "./deployment-lifecycle";
import { assertApprovedRelease } from "./deployment-release";
import { getApplication } from "./db";
import { spawn } from "node:child_process";
import { deploymentLock, shellQuote } from "./deployment-ssh";
import { currentFacts, primaryHttp } from "./release-facts";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { isIP } from "node:net";
import { deploymentDirectory } from "./deployment-files";
export { deploymentDirectory } from "./deployment-files";
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
import type { DeploymentRecord } from "./deployment-types";
import { redactSecrets } from "./secrets";

export function saveDeploymentInputs(
  record: DeploymentRecord,
  input: Record<string, string>,
) {
  const allowed = new Set(currentFacts(record)?.inputs);
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
    if (currentFacts(record)?.inputs.length)
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
export { composeDefinition } from "./deployment-compose";

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
          rules: (currentFacts(record)?.httpAccess === "controller"
            ? [22]
            : [22, 80]
          ).map((port) => ({
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
/**
 * A first deployment: provision the approved host, restrict HTTP and cloud
 * metadata, then run the approved release through the shared release loop,
 * where Pi corrects execution failures within the approval.
 */
export async function executeDeployment(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  const facts = currentFacts(record);
  if (!facts || !record.revision || !record.authority)
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
  assertApprovedRelease(record);
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
  if (facts.httpAccess === "controller") {
    const peer = (
      await command(
        "ssh",
        [...sshArgs(record), 'printf "%s" "$SSH_CONNECTION"'],
        signal,
      )
    )
      .trim()
      .split(/\s+/)[0];
    if (isIP(peer) !== 4)
      throw new Error(
        "Could not identify the controller address for restricted HTTP access.",
      );
    const query = `?label_selector=${encodeURIComponent(`sg-deployment=${record.id}`)}`;
    if (record.authority.connectionId !== hetznerConnectionId())
      throw new Error("Hetzner access changed.");
    const firewalls = (
      await hetzner<{ firewalls: { id: number }[] }>(`/firewalls${query}`)
    ).firewalls;
    if (firewalls.length !== 1)
      throw new Error("The deployment firewall identity is ambiguous.");
    const change = await hetzner<{ actions: { id: number }[] }>(
      `/firewalls/${firewalls[0].id}/actions/set_rules`,
      {
        rules: [
          {
            direction: "in",
            protocol: "tcp",
            port: "22",
            source_ips: ["0.0.0.0/0", "::/0"],
          },
          {
            direction: "in",
            protocol: "tcp",
            port: "80",
            source_ips: [`${peer}/32`],
          },
        ],
      },
    );
    for (const started of change.actions) {
      let done = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const { action } = await hetzner<{ action: { status: string } }>(
          `/actions/${started.id}`,
        );
        if (action.status === "error")
          throw new Error("The HTTP access restriction failed.");
        if (action.status === "success") {
          done = true;
          break;
        }
        await delay(1000, undefined, { signal });
      }
      if (!done)
        throw new Error("The HTTP access restriction is not confirmed yet.");
    }
    record.httpSourceIp = peer;
    deploymentEvent(
      record,
      "HTTP restricted to this controller's network during application setup",
    );
  }
  await hardenDeploymentHost(record, signal);
  deploymentEvent(
    record,
    "Metadata access restricted before running application code",
  );
  const { runInitialRelease } = await import("./application-releases");
  await runInitialRelease(record, signal);
  const verified = currentFacts(record)!;
  record.status = "live";
  record.url = `http://${record.address}`;
  deploymentEvent(
    record,
    "Application behavior verified against the deployed configuration",
  );
  deploymentMessage(
    record,
    `Your application is running at ${record.url}.${record.httpSourceIp ? " HTTP access is restricted to this controller’s network; use an SSH tunnel for private admin setup until HTTPS is configured." : ""} I verified the running images and the application checks: ${verified.criterion?.checks.map((check) => check.name).join(", ")}.${verified.database ? " PostgreSQL is private to the Compose network and uses a persistent volume. Backups are not configured yet." : ""} This first deployment uses HTTP; a domain and HTTPS have not been configured.`,
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
  const facts = currentFacts(record);
  const criterion = facts?.criterion;
  // Without a recorded behavior criterion there is no behavior to claim.
  if (!criterion) return;
  const primary = primaryHttp(facts)?.service ?? "app";
  const origin = `http://${record.address}`;
  const request = async (path: string, init: RequestInit = {}) => {
    const url = new URL(path, origin);
    if (url.origin !== origin)
      throw new Error("Verification must stay on the application host.");
    return fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(20000),
        ...(init.signal ? [init.signal] : []),
      ]),
    });
  };
  // A running container may still be initializing its HTTP listener. Retry
  // only the non-mutating readiness check; never blindly repeat a POST.
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    signal.throwIfAborted();
    try {
      const health = await request(criterion.healthPath);
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
  record.serviceReadiness ??= {};
  record.serviceReadiness[primary] ??= {
    checkedAt: new Date().toISOString(),
    kind: "http",
    imageId: record.serviceImages?.[primary] ?? record.imageId ?? null,
  };
  saveDeployment(record);
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
    record.verificationRecoveryId = null;
    deploymentEvent(record, "Removed the verification test object");
  };
  if (
    record.verificationPending &&
    !record.cleanup &&
    record.verificationRecoveryId
  ) {
    const read = criterion.checks.find(
      (c) =>
        c.method === "GET" &&
        c.path.includes("{id}") &&
        c.contains.includes("SG_VERIFY_TOKEN"),
    );
    const removal = criterion.checks.find(
      (c) => c.method === "DELETE" && c.path.includes("{id}"),
    );
    if (!read || !removal)
      throw new Error(
        "The approved checks do not define safe test-object recovery.",
      );
    const id = encodeURIComponent(record.verificationRecoveryId);
    const response = await request(read.path.replaceAll("{id}", id));
    const text = await response.text();
    if (
      response.status !== read.expectedStatus ||
      !text.includes(record.verificationPending)
    )
      throw new Error(
        "This object does not contain the pending verification marker. Nothing was deleted and verification remains paused.",
      );
    record.cleanup = {
      path: removal.path.replaceAll("{id}", id),
      expectedStatus: removal.expectedStatus,
      marker: record.verificationPending,
    };
    deploymentEvent(
      record,
      "Located the pending verification object and verified its unique marker before cleanup",
    );
  }
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
    for (const check of criterion.checks) {
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
      const waitSignal = check.waitSeconds
        ? AbortSignal.timeout(check.waitSeconds * 1000)
        : undefined;
      let response = await request(path, {
        signal: waitSignal,
        method: check.method,
        ...(body
          ? { body, headers: { "Content-Type": "application/json" } }
          : {}),
      });
      let text = await response.text();
      const matches = () =>
        response.status === check.expectedStatus &&
        responseContains(
          text,
          check.contains.replaceAll("SG_VERIFY_TOKEN", marker),
        );
      // Only the explicitly declared read is polled. Never repeat a POST,
      // and always retain the marked-object cleanup protocol on failure.
      while (check.method === "GET" && waitSignal && !matches()) {
        await delay(1000, undefined, {
          signal: AbortSignal.any([signal, waitSignal]),
        });
        response = await request(path, { method: "GET", signal: waitSignal });
        text = await response.text();
      }
      if (check.captureId) {
        let value: unknown = JSON.parse(text);
        for (const part of check.captureId.split("."))
          value = (value as Record<string, unknown>)?.[part];
        if (!["string", "number"].includes(typeof value))
          throw new Error("The verification response had no usable object ID.");
        captured = String(value);
      }
      if (check.method === "POST" && captured) {
        if (response.status !== check.expectedStatus || !text.includes(marker))
          throw new Error(
            "The create response did not prove ownership of the test object. Resolve its marker before retrying.",
          );
        const removal = criterion.checks.find(
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
        !responseContains(
          text,
          check.contains.replaceAll("SG_VERIFY_TOKEN", marker),
        )
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

/** Ignore JSON serialization whitespace, never whitespace inside values. */
export function responseContains(body: string, expected: string) {
  if (body.includes(expected)) return true;
  try {
    return JSON.stringify(JSON.parse(body)).includes(expected);
  } catch {
    return false;
  }
}

/** Observe every image, not just the web container, before claiming a stack. */
export async function verifyServiceImages(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  record.serviceReadiness = {};
  saveDeployment(record);
  const facts = currentFacts(record);
  if (!facts) throw new Error("No recorded configuration to verify.");
  const output = await command(
    "ssh",
    [
      ...sshArgs(record),
      `cd /opt/server-guy/${record.id} && docker inspect --format '[{{json .Image}},{{json .Config.Image}},{{json (index .Config.Labels "com.docker.compose.service")}},{{json .State.Running}},{{json (index .Config.Labels "server-guy.revision")}}]' $(docker compose -p sg-${record.id.slice(0, 8)} -f compose.json ps -q)`,
    ],
    signal,
  );
  // Inspect only identities/state, never container environment secrets.
  const containers = output
    .trim()
    .split("\n")
    .map((line) => {
      const [Image, reference, service, running, revision] = JSON.parse(
        line,
      ) as [string, string, string, boolean, string | undefined];
      return { Image, reference, service, running, revision };
    });
  const images: Record<string, string> = {};
  for (const service of facts.services) {
    const matches = containers.filter((c) => c.service === service.name);
    if (matches.length !== 1 || !matches[0].running)
      throw new Error(
        `Compose service ${service.name} is not running exactly once.`,
      );
    const container = matches[0];
    if (
      service.pinned &&
      container.reference !== service.pinned &&
      container.reference !== record.serviceImages?.[service.name]
    )
      throw new Error(
        `Service ${service.name} differs from its approved image.`,
      );
    if (
      record.serviceImages?.[service.name] &&
      record.serviceImages[service.name] !== container.Image
    )
      throw new Error(`Service ${service.name} changed since it was recorded.`);
    if (service.labeled && container.revision !== record.revision)
      throw new Error(
        `Service ${service.name} does not run the selected revision.`,
      );
    images[service.name] = container.Image;
  }
  for (const service of facts.services)
    if (
      service.sharesImageWith &&
      images[service.name] !== images[service.sharesImageWith]
    )
      throw new Error(
        `Service ${service.name} does not use the same image as ${service.sharesImageWith}.`,
      );
  record.serviceImages = images;
  saveDeployment(record);
}

export async function verifyPrivateServices(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  // Clear previous readiness before observing this attempt; failure must not
  // leave an earlier passing check attached to a replaced container.
  record.serviceReadiness = {};
  saveDeployment(record);
  const facts = currentFacts(record)!;
  for (const service of facts.services) {
    // The managed database's health already gates its dependents.
    if (!service.healthcheck || service.name === facts.database?.service)
      continue;
    const output = await command(
      "ssh",
      [
        ...sshArgs(record),
        `cd /opt/server-guy/${record.id} && docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $(docker compose -p sg-${record.id.slice(0, 8)} -f compose.json ps -q ${shellQuote(service.name)})`,
      ],
      signal,
    );
    if (output.trim() !== "healthy")
      throw new Error(
        `Service ${service.name} has not passed its readiness command.`,
      );
    record.serviceReadiness[service.name] = {
      checkedAt: new Date().toISOString(),
      kind: "command",
      imageId: record.serviceImages?.[service.name] ?? null,
    };
    saveDeployment(record);
    deploymentEvent(record, `Verified readiness command: ${service.name}`);
  }
  for (const service of facts.criterion?.services ?? []) {
    const output = await command(
      "ssh",
      [
        ...sshArgs(record),
        `cd /opt/server-guy/${record.id} && docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker compose -p sg-${record.id.slice(0, 8)} -f compose.json ps -q ${shellQuote(service.name)})`,
      ],
      signal,
    );
    const address = output.trim();
    if (isIP(address) !== 4)
      throw new Error(`No private address for ${service.name}.`);
    for (const check of [
      { path: service.healthPath, contains: "", jsonPath: null, equals: null },
      ...service.checks,
    ]) {
      const url = `http://${address}:${service.port}${check.path}`;
      // JSON stdin keeps paths and responses out of shell evaluation. Host
      // Python probes the private bridge; no auxiliary port is published.
      const script = `import json,sys,urllib.request\nx=json.load(sys.stdin)\nclass NoRedirect(urllib.request.HTTPRedirectHandler):\n def redirect_request(self,*args,**kwargs): return None\nr=urllib.request.build_opener(NoRedirect).open(x["url"],timeout=20)\ns=r.read(1000000).decode()\nassert r.status==200 and x["contains"] in s\nif x["jsonPath"]:\n v=json.loads(s)\n for p in x["jsonPath"].split("."): v=v[int(p)] if isinstance(v,list) else v[p]\n assert v==x["equals"]\nprint("verified")`;
      const encoded = Buffer.from(script).toString("base64");
      await command(
        "ssh",
        [
          ...sshArgs(record),
          `python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`,
        ],
        signal,
        JSON.stringify({ ...check, url }),
      );
      deploymentEvent(
        record,
        `Verified private ${service.name}: ${check.path}`,
      );
    }
    record.serviceReadiness[service.name] = {
      checkedAt: new Date().toISOString(),
      kind: "http",
      imageId: record.serviceImages?.[service.name] ?? null,
    };
    saveDeployment(record);
  }
}

/** Recreate the accepted stack without pulling or deleting volumes. */
export async function recreateDeployment(
  record: DeploymentRecord,
  signal: AbortSignal,
) {
  const facts = currentFacts(record);
  if (
    record.status !== "live" ||
    !facts ||
    !record.serverId ||
    !(record.imageId || Object.keys(record.serviceImages ?? {}).length)
  )
    throw new Error(
      "A verified deployment is required before recreating its containers.",
    );
  if (!record.bundleHashes)
    throw new Error(
      "This older deployment has no recorded configuration fingerprints. Reconcile its configuration before recreation.",
    );
  const files = Object.keys(record.bundleHashes);
  if (
    files.some(
      (path) =>
        !/^[A-Za-z0-9_@+=,.-][A-Za-z0-9_@+=,./-]*$/.test(path) ||
        path.split("/").some((part) => !part || part === "." || part === ".."),
    )
  )
    throw new Error("Invalid recorded configuration path.");
  const hashes = await command(
    "ssh",
    [
      ...sshArgs(record),
      `cd /opt/server-guy/${record.id} && sha256sum -- ${files.map(shellQuote).join(" ")}`,
    ],
    signal,
  );
  for (const line of hashes.trim().split("\n")) {
    const [hash, path] = line.trim().split(/\s+/);
    if (record.bundleHashes[path] !== hash)
      throw new Error(
        "Remote deployment configuration changed. Review it before recreation.",
      );
  }
  if (hashes.trim().split("\n").length !== files.length)
    throw new Error("Configuration verification was incomplete.");
  const compose = `docker compose -p sg-${record.id.slice(0, 8)} -f compose.json`;
  const root = `/opt/server-guy/${record.id}`;
  const ids = async () =>
    (
      await command(
        "ssh",
        [...sshArgs(record), `cd ${root} && ${compose} ps -q`],
        signal,
      )
    )
      .trim()
      .split(/\s+/)
      .sort();
  const before = await ids();
  const volumeNames = facts.volumes.map((volume) => volume.dockerName);
  // Compose creates missing named volumes automatically. Refuse that during
  // recreation: a deleted data volume must become an explicit recovery task.
  if (volumeNames.length) {
    await command(
      "ssh",
      [
        ...sshArgs(record),
        `docker volume inspect --format '{{.Name}}' ${volumeNames.map(shellQuote).join(" ")}`,
      ],
      signal,
    );
  }
  const { recordOperationRemoteEffect } =
    await import("./application-operations");
  recordOperationRemoteEffect();
  invalidateDeploymentRuntime(record);
  saveDeployment(record);
  deploymentEvent(
    record,
    "Recreating the accepted containers without rebuilding images or removing persistent volumes",
  );
  await command(
    "ssh",
    [
      ...sshArgs(record),
      deploymentLock(
        record.id,
        `cd ${root} && ${compose} up -d --force-recreate --no-build --pull never --wait --wait-timeout 120`,
      ),
    ],
    signal,
    undefined,
    (text) => logOutput(record, text),
  );
  const after = await ids();
  if (before.length !== after.length || after.some((id) => before.includes(id)))
    throw new Error(
      "Container replacement did not complete for the entire accepted stack.",
    );
  const behavior = await verifyRuntime(record, signal);
  if (behavior === "passed") record.verifiedAt = new Date().toISOString();
  deploymentEvent(
    record,
    behavior === "passed"
      ? "Recreated containers and reverified the accepted image identities and application checks; persistent volumes were retained"
      : "Recreated containers from the recorded images; readiness passed and persistent volumes were retained. No behavior criterion is recorded, so behavior is unverified",
  );
  deploymentMessage(
    record,
    behavior === "passed"
      ? "The containers were recreated from the same images and passed verification. Named data volumes were retained. This is not a backup or a restore test."
      : "The containers were recreated from the same images and passed readiness. Named data volumes were retained. Behavior is unverified because no behavior criterion is recorded. This is not a backup or a restore test.",
  );
  return {
    evidence:
      behavior === "passed"
        ? `Replaced ${after.length} containers, retained their named volumes, and verified the accepted image identities and application checks.`
        : `Replaced ${after.length} containers, retained their named volumes, and observed the accepted image identities and readiness. Behavior is unverified.`,
    before,
    after,
    behavior,
  };
}

/** Identity, readiness and the recorded behavior criterion, in that order. */
export async function verifyRuntime(
  record: DeploymentRecord,
  signal: AbortSignal,
  established?: () => void,
) {
  await verifyServiceImages(record, signal);
  established?.();
  await verifyDeployment(record, signal);
  await verifyPrivateServices(record, signal);
  await collectDeploymentLogs(record, signal);
  return currentFacts(record)?.criterion
    ? ("passed" as const)
    : ("unverified" as const);
}
