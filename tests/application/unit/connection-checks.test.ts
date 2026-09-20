import { Resolver } from "node:dns/promises";
// The claims a connection card makes to someone who cannot check them: a
// provider that did not answer has not judged the credential, a credential of
// the wrong kind is not saved, and a zone a token cannot see is not reported
// as a zone that does not exist.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { recogniseCloudflare } from "../../../src/components/hallvi/onboarding/domain-connect";
import { recogniseHetzner } from "../../../src/components/hallvi/onboarding/hetzner-connect";
import {
  machineCommand,
  machineKeyLabel,
  parseMachineLine,
} from "../../../src/components/hallvi/onboarding/machine-connect";

const application = "6f1c2a3e-7b5d-4c8e-9a10-2b3c4d5e6f70";
const token = "a".repeat(64);
let config: string;

beforeEach(() => {
  config = mkdtempSync(join(tmpdir(), "hallvi-connections-"));
  vi.stubEnv("HALLVI_CONFIG_DIR", config);
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(config, { recursive: true, force: true });
});

const saved = () => existsSync(join(config, "hetzner-connection.json"));

it("does not call a Hetzner token bad when Hetzner was never reached", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.hetzner.cloud");
    }),
  );
  const { checkHetznerToken } =
    await import("../../../src/server/connection-checks");
  expect(await checkHetznerToken(application, token)).toEqual({
    kind: "unreachable",
  });
  expect(saved()).toBe(false);
});

it("tells a read-only Hetzner token from a rejected one, and saves neither", async () => {
  const { checkHetznerToken } =
    await import("../../../src/server/connection-checks");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: { code: "unauthorized" } }, { status: 401 }),
    ),
  );
  expect(await checkHetznerToken(application, token)).toEqual({
    kind: "rejected",
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) =>
      init.method === "GET"
        ? Response.json({
            servers: [],
            meta: { pagination: { total_entries: 3 } },
          })
        : Response.json({ error: { code: "forbidden" } }, { status: 403 }),
    ),
  );
  expect(await checkHetznerToken(application, token)).toEqual({
    kind: "read-only",
    servers: 3,
  });
  expect(saved()).toBe(false);
});

it("saves a Hetzner token only after the write probe, and never returns it", async () => {
  const fetch = vi.fn(async (_url: string, init: RequestInit) =>
    init.method === "GET"
      ? Response.json({
          servers: [],
          meta: { pagination: { total_entries: 0 } },
        })
      : Response.json({ ssh_key: { id: 1 } }, { status: 201 }),
  );
  vi.stubGlobal("fetch", fetch);
  const { checkHetznerToken } =
    await import("../../../src/server/connection-checks");
  const outcome = await checkHetznerToken(application, token);
  expect(outcome).toEqual({ kind: "connected", servers: 0, wrote: true });
  expect(JSON.stringify(outcome)).not.toContain(token);
  expect(fetch.mock.calls[1]![0]).toBe("https://api.hetzner.cloud/v1/ssh_keys");
  expect(String(fetch.mock.calls[1]![1].body)).toContain("ssh-ed25519 ");
  expect(saved()).toBe(true);
});

it("reports a Cloudflare zone outside the token's scope as hidden, with what it can see, and saves nothing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json({
        success: true,
        result: url.endsWith("/verify")
          ? { status: "active" }
          : [{ name: "other.dev" }],
      }),
    ),
  );
  const { connectCloudflareForZone } =
    await import("../../../src/server/cloudflare");
  expect(
    await connectCloudflareForZone({
      token: "t".repeat(40),
      zone: "example.com",
    }),
  ).toEqual({ kind: "zone-hidden", visible: ["other.dev"] });
  expect(existsSync(join(config, "cloudflare-connection.json"))).toBe(false);
});

it("recognises the wrong kind of key by shape, without echoing it", () => {
  const global = "0123456789abcdef0123456789abcdef01234";
  expect(recogniseCloudflare(global).ok).toBe(false);
  expect(recogniseCloudflare(global).hint).not.toContain(global);
  expect(recogniseCloudflare(`cfut_${"x".repeat(40)}`).ok).toBe(true);
  expect(recogniseHetzner("ssh-ed25519 AAAA").ok).toBe(false);
  expect(recogniseHetzner(token).ok).toBe(true);
});

it("reads a pasted machine line and refuses one without a full fingerprint", () => {
  const fingerprint = `SHA256:${"k".repeat(43)}`;
  expect(
    parseMachineLine(
      `$ noise\nhallvi-machine user=deploy port=2222 key=${fingerprint} os=ubuntu-24.04 arch=x86_64 addrs=203.0.113.9,10.0.0.5,203.0.113.9`,
    ),
  ).toEqual({
    user: "deploy",
    port: 2222,
    fingerprint,
    os: "ubuntu-24.04",
    arch: "x86_64",
    addresses: ["203.0.113.9", "10.0.0.5"],
  });
  expect(
    parseMachineLine("hallvi-machine user=deploy port=22 key=SHA256:short"),
  ).toBeNull();
});

it("labels a machine key and collapses prior copies to that exact line", () => {
  const sharedHeader = "AAAAC3NzaC1lZDI1NTE5AAAAI";
  const publicKey = `ssh-ed25519 ${sharedHeader}${"A".repeat(40)}`;
  const otherPublicKey = `ssh-ed25519 ${sharedHeader}${"B".repeat(40)}`;
  const label = machineKeyLabel(publicKey);
  const command = machineCommand(publicKey);
  const home = mkdtempSync(join(tmpdir(), "hallvi-machine-key-"));
  const ssh = join(home, ".ssh");
  const authorizedKeys = join(ssh, "authorized_keys");
  mkdirSync(ssh);
  writeFileSync(
    authorizedKeys,
    [`ssh-ed25519 ${"B".repeat(68)} owner`, publicKey, `${publicKey} old`].join(
      "\n",
    ) + "\n",
  );

  expect(label).toBe("hallvi-AAAAAAAAAAAAAAAAAAAA");
  expect(machineKeyLabel(publicKey)).toBe(label);
  expect(machineKeyLabel(otherPublicKey)).not.toBe(label);
  expect(command).toContain(`replacement='${publicKey} ${label}'`);
  expect(command).toContain("$1 == kind && $2 == encoded");
  expect(command).toContain(
    "(tmp=$(mktemp ~/.ssh/authorized_keys.hallvi.XXXXXX)",
  );
  expect(command).toContain('chmod 600 "$tmp" && mv "$tmp"');
  expect(command).toContain('mv "$tmp" ~/.ssh/authorized_keys)');
  expect(command).not.toContain(`echo '${publicKey}' >>`);

  const install = command.split(" && set --")[0]!;
  try {
    execFileSync("/bin/sh", ["-c", `${install} && ${install}`], {
      env: { ...process.env, HOME: home },
    });
    expect(readFileSync(authorizedKeys, "utf8").trim().split("\n")).toEqual([
      `ssh-ed25519 ${"B".repeat(68)} owner`,
      `${publicKey} ${label}`,
    ]);
    expect(statSync(authorizedKeys).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it("keeps a host request whose sentences run long, instead of dropping the card", async () => {
  const { requestHost, listConnectionRequests } =
    await import("../../../src/server/connection-requests");
  requestHost(application, {
    needs: "n".repeat(900),
    estimate: "€5.99/month ".repeat(60),
    recommended: "hetzner",
  });
  const [request] = listConnectionRequests(application);
  expect(request?.kind).toBe("host");
  expect(request?.kind === "host" && request.estimate.length).toBe(240);
  expect(request?.kind === "host" && request.needs.length).toBe(400);
});

it("stops an unanswered DNS lookup without calling the domain unregistered", async () => {
  const { whoHostsDns } = await import("../../../src/server/connection-checks");
  vi.useFakeTimers();
  let rejectLookup: (error: Error) => void = () => {};
  vi.spyOn(Resolver.prototype, "resolveNs").mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectLookup = reject;
      }),
  );
  const cancel = vi
    .spyOn(Resolver.prototype, "cancel")
    .mockImplementation(() => {
      rejectLookup(
        Object.assign(new Error("cancelled"), { code: "ECANCELLED" }),
      );
    });
  const result = whoHostsDns("app.example.com");
  await vi.advanceTimersByTimeAsync(15000);
  expect(await result).toEqual({ kind: "unreachable" });
  expect(cancel).toHaveBeenCalledOnce();
});

it("finds the parent DNS zone and clears the deadline after an answer", async () => {
  const { whoHostsDns } = await import("../../../src/server/connection-checks");
  vi.useFakeTimers();
  vi.spyOn(Resolver.prototype, "resolveNs")
    .mockRejectedValueOnce(
      Object.assign(new Error("no nameservers"), { code: "ENODATA" }),
    )
    .mockResolvedValueOnce(["ada.ns.cloudflare.com"]);
  const cancel = vi.spyOn(Resolver.prototype, "cancel");
  expect(await whoHostsDns("app.example.com")).toEqual({
    kind: "cloudflare",
    zone: "example.com",
  });
  await vi.advanceTimersByTimeAsync(15000);
  expect(cancel).not.toHaveBeenCalled();
});
