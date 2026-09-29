import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "@/server/db";
import {
  decideExecution,
  executionContext,
  listExecutions,
  saveOperatorSettings,
  settleRunningExecutions,
} from "@/server/operator-execution";
import {
  executePrivateAccess,
  privateAccessArguments,
} from "@/server/saved-private-access";
import type { SavedInformation } from "@/server/operator-data";
import { pushTestDatabase } from "../../test-database";

const ssh = vi.hoisted(() => vi.fn());
vi.mock("@/server/private-access", () => ({
  openServerPort: ssh,
  privateAccessPortAllowed: (port: number) => port === 18000,
}));
let root: string;
let run: { applicationId: string; chatId: string };
let route: SavedInformation;
const host = {
  address: "192.0.2.1",
  user: "root",
  port: 22,
  privateKeyPath: "/private/fixture-key",
  knownHostsPath: "/private/fixture-host",
};
const settings = (
  permissionMode: "always-ask" | "pi-decides" | "bypass",
  connection = host,
) =>
  saveOperatorSettings(run.applicationId, { permissionMode, host: connection });
const reference = () => ({
  accessRecordId: route.id,
  expectedUpdatedAt: route.updatedAt,
});
const reconnect = (id: string, signal?: AbortSignal) =>
  executePrivateAccess(
    run.applicationId,
    executionContext(run),
    reference(),
    id,
    signal,
  );
async function receipt(id: string) {
  return vi.waitFor(async () => {
    const found = (await listExecutions(run.applicationId)).find(
      (item) => item.toolCallId === id,
    );
    expect(found).toBeDefined();
    return found!;
  });
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-saved-access-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
});
beforeEach(async () => {
  ssh.mockReset().mockResolvedValue({
    url: "http://127.0.0.1:18000",
    httpStatus: 503,
    reused: false,
  });
  const app = await store.insertApplication({
    name: "Saved route",
    repositoryUrl: "https://github.com/qa/access",
    repositoryOwner: "qa",
    repositoryName: "access",
  });
  const chat = await store.insertChat(app.id, "Main operator");
  run = { applicationId: app.id, chatId: chat.id };
  await settings("always-ask");
  route = await store.saveInformationRow(app.id, {
    title: "Private connection",
    body: "Saved on this controller.",
    evidence: [],
    establishedAt: new Date().toISOString(),
    presentation: {
      views: ["access"],
      role: "status",
      status: "verified",
      checks: [],
      url: "http://127.0.0.1:18000",
      content: {
        kind: "application-access",
        mode: "private",
        server: host.address,
        remotePort: 8080,
        localPort: 18000,
      },
    },
  });
});
afterAll(async () => {
  await store.closeDatabase();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it("records the exact private route before approval, opens only after it, and preserves HTTP evidence", async () => {
  const pending = reconnect("approved-route");
  const evidence = await receipt("approved-route");
  expect(evidence.status).toBe("awaiting-approval");
  expect(evidence.input).toContain('"localPort":18000');
  expect(evidence.target).toContain("root@192.0.2.1:22");
  expect(JSON.stringify(evidence)).not.toContain("/private/");
  expect(ssh).not.toHaveBeenCalled();
  await decideExecution(run.applicationId, evidence.id, true);
  expect(await pending).toMatchObject({
    accessRecordId: route.id,
    httpStatus: 503,
    checkedAt: expect.any(String),
  });
  expect(ssh).toHaveBeenCalledExactlyOnceWith(
    run.applicationId,
    { remotePort: 8080, localPort: 18000 },
    undefined,
    { host, url: route.presentation!.url },
  );
  expect((await receipt("approved-route")).approvalId).toBe(evidence.id);
});

it.each(["pi-decides", "bypass"] as const)(
  "uses the existing %s permission contract",
  async (mode) => {
    await settings(mode);
    await reconnect(mode);
    expect(ssh).toHaveBeenCalledOnce();
    expect((await receipt(mode)).status).toBe("succeeded");
  },
);

it.each(["route", "host", "credentials", "retired"])(
  "rejects %s changes made during approval without running SSH",
  async (change) => {
    const pending = reconnect(change);
    const rejected = expect(pending).rejects.toThrow(/changed|match/);
    const evidence = await receipt(change);
    if (change === "retired")
      await store.retireInformation(run.applicationId, route.id);
    else if (change === "route")
      await store.saveInformationRow(
        run.applicationId,
        {
          title: route.title,
          body: "Edited",
          evidence: [],
          establishedAt: new Date().toISOString(),
          presentation: {
            ...route.presentation!,
            url: "http://127.0.0.1:18001",
            content: {
              kind: "application-access",
              mode: "private",
              server: host.address,
              localPort: 18001,
              remotePort: 8080,
            },
          },
        },
        route.id,
      );
    else
      await settings("always-ask", {
        ...host,
        ...(change === "host"
          ? { address: "192.0.2.2" }
          : { privateKeyPath: "/private/changed" }),
      });
    await decideExecution(run.applicationId, evidence.id, true);
    await rejected;
    expect(ssh).not.toHaveBeenCalled();
    expect((await receipt(change)).status).toBe("failed");
  },
);

it("decline and interruption do not open or replay a connection", async () => {
  const declined = reconnect("decline");
  await decideExecution(
    run.applicationId,
    (await receipt("decline")).id,
    false,
  );
  expect(await declined).toEqual({ declined: true });
  const stop = new AbortController();
  const interrupted = reconnect("interrupted", stop.signal);
  const rejected = expect(interrupted).rejects.toThrow();
  const evidence = await receipt("interrupted");
  await settleRunningExecutions(run.applicationId, run.chatId);
  stop.abort();
  await rejected;
  await expect(
    decideExecution(run.applicationId, evidence.id, true),
  ).rejects.toThrow("no longer");
  expect(ssh).not.toHaveBeenCalled();
});

it("refuses cross-application references, descriptive hosts, disallowed ports and mixed argument forms", async () => {
  const another = await store.insertApplication({
    name: "Other",
    repositoryUrl: "https://github.com/qa/other",
    repositoryOwner: "qa",
    repositoryName: "other",
  });
  await expect(
    executePrivateAccess(
      another.id,
      executionContext(run),
      reference(),
      "cross-app",
    ),
  ).rejects.toThrow("changed");
  await store.saveInformationRow(
    run.applicationId,
    {
      title: route.title,
      body: "Disallowed port",
      evidence: [],
      establishedAt: route.establishedAt,
      presentation: {
        ...route.presentation!,
        url: "http://127.0.0.1:18001",
        content: {
          kind: "application-access",
          mode: "private",
          server: host.address,
          localPort: 18001,
          remotePort: 8080,
        },
      },
    },
    route.id,
  );
  route = (await store.listInformation(run.applicationId))[0];
  await expect(reconnect("disallowed")).rejects.toThrow("match");
  await store.saveInformationRow(
    run.applicationId,
    {
      title: route.title,
      body: "Legacy label",
      evidence: [],
      establishedAt: route.establishedAt,
      presentation: {
        ...route.presentation!,
        url: "http://127.0.0.1:18000",
        content: {
          kind: "application-access",
          mode: "private",
          server: "legacy-label",
          localPort: 18000,
          remotePort: 8080,
        },
      },
    },
    route.id,
  );
  route = (await store.listInformation(run.applicationId))[0];
  await settings("bypass", { ...host, address: "192.0.2.1" });
  await expect(reconnect("legacy")).rejects.toThrow("match");
  expect(
    privateAccessArguments.safeParse({ ...reference(), remotePort: 8080 })
      .success,
  ).toBe(false);
  expect(ssh).not.toHaveBeenCalled();
});

it("reports an occupied saved port as a failure without selecting another route", async () => {
  await settings("bypass");
  ssh.mockRejectedValue(new Error("Address already in use"));
  await expect(reconnect("occupied")).rejects.toThrow("Address already in use");
  expect(ssh).toHaveBeenCalledOnce();
  expect((await receipt("occupied")).status).toBe("failed");
});
