import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  host: vi.fn(),
  save: vi.fn(),
  provider: vi.fn(),
  scan: vi.fn(),
}));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  const { promisify } = await import("node:util");
  const execFile = vi.fn();
  Object.defineProperty(execFile, promisify.custom, {
    value: async (cmd: string, args: string[], options: unknown) => {
      if (cmd === "ssh-keyscan") return mocks.scan();
      return promisify(actual.execFile)(cmd, args, options as never);
    },
  });
  return { ...actual, execFile };
});
vi.mock("../../../src/server/hetzner", () => ({
  hetzner: mocks.provider,
  hetznerConnectionId: () => "account-reference",
}));
vi.mock("../../../src/server/operator-execution", () => ({
  runHostCommand: mocks.host,
  saveOperatorSettings: mocks.save,
  operatorSettings: () => ({ permissionMode: "pi-decides", host: null }),
}));
import {
  serverPublicKey,
  connectServer,
} from "../../../src/server/server-access";
const root = mkdtempSync(join(tmpdir(), "sg-access-"));
let id: string;
let publicKey: string;
let fingerprint: string;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", root);
  id = randomUUID();
  ({ publicKey } = await serverPublicKey(id));
  fingerprint =
    "SHA256:" +
    createHash("sha256")
      .update(Buffer.from(publicKey.split(" ")[1], "base64"))
      .digest("base64")
      .replace(/=+$/, "");
  mocks.scan.mockResolvedValue({
    stdout: `192.0.2.1 ${publicKey}\n`,
    stderr: "",
  });
  mocks.host.mockResolvedValue({
    exitCode: 0,
    output: "server-guy-ssh-ready\nLinux\n",
  });
  mocks.provider.mockResolvedValue({
    server: { status: "running", public_net: { ipv4: { ip: "192.0.2.1" } } },
  });
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it("retains the same private key securely and only returns its public half", async () => {
  expect(await serverPublicKey(id)).toEqual({ publicKey });
  expect(publicKey).toMatch(/^ssh-ed25519 /);
  expect(
    statSync(join(root, "operator", id, "ssh", "id_ed25519")).mode & 0o777,
  ).toBe(0o600);
});
it("resolves the provider identity, verifies SSH and saves controller credential references", async () => {
  const result = await connectServer(id, { serverId: 123 });
  expect(mocks.provider).toHaveBeenCalledWith(
    "/servers/123",
    undefined,
    undefined,
    "GET",
    undefined,
  );
  expect(mocks.save).toHaveBeenCalledWith(
    id,
    expect.objectContaining({
      host: expect.objectContaining({
        address: "192.0.2.1",
        provider: "hetzner",
        serverId: "123",
        providerConnectionId: "account-reference",
        privateKeyPath: expect.stringContaining(root),
      }),
    }),
  );
  expect(result).toMatchObject({
    sshVerified: true,
    applicationDeployed: false,
    hostKeyFingerprint: fingerprint,
  });
  expect(JSON.stringify(result)).not.toContain(root);
  await connectServer(id, { serverId: 123 });
  expect(mocks.scan).toHaveBeenCalledOnce();
});
it("requires a trusted existing-machine fingerprint and never saves a failed connection", async () => {
  await expect(connectServer(id, { address: "192.0.2.1" })).rejects.toThrow(
    "fingerprint",
  );
  await expect(
    connectServer(id, {
      address: "192.0.2.1",
      hostKeyFingerprint: "SHA256:" + "A".repeat(43),
    }),
  ).rejects.toThrow("does not match");
  expect(mocks.host).not.toHaveBeenCalled();
  mocks.host.mockResolvedValue({ exitCode: 255, output: "Permission denied" });
  await expect(
    connectServer(id, {
      address: "192.0.2.1",
      hostKeyFingerprint: fingerprint,
    }),
  ).rejects.toThrow("not verified");
  expect(mocks.save).not.toHaveBeenCalled();
  mocks.host.mockResolvedValue({
    exitCode: 0,
    output: "server-guy-ssh-ready\nLinux",
  });
  expect(
    await connectServer(id, {
      address: "192.0.2.1",
      hostKeyFingerprint: fingerprint,
    }),
  ).toMatchObject({
    provider: "existing",
    hostKeyTrust: "matched supplied fingerprint",
  });
});
