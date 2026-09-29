import { randomUUID } from "node:crypto";
import {
  promises as fs,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  ownChangeNotifications,
  subscribeChanges,
} from "../../../src/server/change-notifications";

vi.mock("../../../src/server/applications", async (original) => ({
  ...(await original<typeof import("../../../src/server/applications")>()),
  loadChat: vi.fn(),
  loadApplication: vi.fn(),
}));
vi.mock("../../../src/server/pi-conversation", async () => {
  const { listExecutions } =
    await import("../../../src/server/operator-execution");
  return {
    chatSnapshot: async (app: string) => ({
      executions: await listExecutions(app),
    }),
  };
});
import { GET } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/events/route";

it("reconnecting a chat cannot reuse its abandoned scan while another chat keeps the hub connected", async () => {
  const root = mkdtempSync(join(tmpdir(), "hv-stream-reconnect-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", root);
  const app = randomUUID();
  const chat = randomUUID();
  const directory = join(root, "operator", app, "executions");
  mkdirSync(directory, { recursive: true });
  const owner = ownChangeNotifications();
  const other = subscribeChanges(
    { applicationId: randomUUID(), chatId: randomUUID() },
    () => {},
  );
  await other.ready;
  const first = new AbortController();
  const second = new AbortController();
  let release!: () => void;
  let enumerated!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    enumerated = resolve;
  });
  const readdir = fs.readdir.bind(fs);
  const scan = vi
    .spyOn(fs, "readdir")
    .mockImplementationOnce(async (...args) => {
      const names = await readdir(...args);
      enumerated();
      await held;
      return names;
    });
  const context = {
    params: Promise.resolve({ applicationId: app, chatId: chat }),
  };
  const abandoned = GET(
    new Request("http://localhost/events", { signal: first.signal }),
    context,
  );
  try {
    await started;
    first.abort();
    const id = randomUUID();
    writeFileSync(
      join(directory, `${id}.json`),
      JSON.stringify({
        id,
        applicationId: app,
        chatId: chat,
        createdAt: "2026-09-29T00:00:00.000Z",
      }),
    );
    // No subscriber for this application exists now. The other subscription
    // keeps ready resolved: reconnect will not get a connection notice.
    owner.notify({ kind: "execution", applicationId: app });
    let response: Response | undefined;
    const reopened = GET(
      new Request("http://localhost/events", { signal: second.signal }),
      context,
    ).then((value) => (response = value));
    await vi.waitFor(() => expect(response).toBeDefined());
    await reopened;
    const reader = response!.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(id);
    await reader.cancel();
  } finally {
    release();
    await abandoned;
    second.abort();
    other.close();
    owner.close();
    scan.mockRestore();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});
