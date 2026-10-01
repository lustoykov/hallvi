import { promises as fs, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import {
  createApplication,
  removeApplication,
} from "../../../src/server/applications";
import { getOperatorView } from "../../../src/server/operator-view";
import { ownSessions } from "../../../src/server/pi-owner";
import {
  saveInformation,
  listInformation,
  retireInformation,
} from "../../../src/server/saved-information";
import {
  saveOperatorSettings,
  operatorSettings,
  executionContext,
  listExecutions,
} from "../../../src/server/operator-execution";
import { countDay } from "../../../src/server/traffic/count";
import {
  collectionOf,
  readDays,
  setCollection,
  writeDay,
} from "../../../src/server/traffic/store";
import { pushTestDatabase } from "../../test-database";
vi.mock("../../../src/server/github", async (original) => ({
  ...(await original<typeof import("../../../src/server/github")>()),
  inspectGithubRepository: async () => ({
    status: "passed",
    summary: "Repository checked",
    sourceUrl: null,
    raw: { repositoryId: 123 },
  }),
}));
let root: string;
let app: string;
let chat: string;
async function reopen() {
  await store.closeDatabase();
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-storage-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
});
beforeEach(async () => {
  for (const application of await store.listApplications())
    await store.deleteApplication(application.id);
  app = (
    await createApplication({ repositoryUrl: "https://github.com/example/app" })
  ).application.id;
  chat = (await store.listApplicationChats(app))[0].id;
});
afterAll(async () => {
  await reopen();
  await globalThis.__hallviTraffic?.client.close();
  globalThis.__hallviTraffic = undefined;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it("loads creation and settings after reopening the database", async () => {
  expect((await store.getApplication(app))?.repositoryId).toBe(123);
  expect((await store.getChat(chat))?.kind).toBe("main");
  expect((await operatorSettings(app)).permissionMode).toBe("pi-decides");
  await saveOperatorSettings(app, { permissionMode: "always-ask", host: null });
  await reopen();
  expect((await operatorSettings(app)).permissionMode).toBe("always-ask");
});
it("validates new execution evidence while an older history scan is in flight", async () => {
  await saveOperatorSettings(app, { permissionMode: "bypass", host: null });
  mkdirSync(join(root, "config", "operator", app, "executions"), {
    recursive: true,
  });
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const enumerated = new Promise<void>((resolve) => {
    started = resolve;
  });
  const readdir = fs.readdir.bind(fs);
  const scan = vi
    .spyOn(fs, "readdir")
    .mockImplementationOnce(async (...args) => {
      const names = await readdir(...args);
      started();
      await held;
      return names;
    });
  const older = listExecutions(app);
  try {
    await enumerated;
    await executionContext({ applicationId: app, chatId: chat }).execute(
      "fixture",
      "local",
      "read fixture",
      async () => "verified",
      false,
      "new-evidence",
    );
    const [name] = await readdir(
      join(root, "config", "operator", app, "executions"),
    );
    const executionId = name.replace(/\.json$/, "");
    // The held scan enumerated no files. Evidence validation must read the
    // cited record independently, without waiting for that stale listing.
    const saving = saveInformation(app, {
      title: "New evidence",
      body: "The command completed.",
      evidence: [{ type: "execution", id: executionId }],
    });
    let saved = false;
    void saving.then(
      () => {
        saved = true;
      },
      () => undefined,
    );
    await vi.waitFor(() => expect(saved).toBe(true), { timeout: 2000 });
    expect((await saving).evidence).toEqual([
      { type: "execution", id: executionId },
    ]);
  } finally {
    release();
    await older;
    scan.mockRestore();
  }
});
it("shares one outcome between views while keeping working knowledge unsurfaced", async () => {
  const hidden = await saveInformation(app, {
    title: "Build note",
    body: "Use the repository lockfile.",
  });
  const record = await saveInformation(app, {
    title: "Application verified",
    body: "HTTP check passed.",
    evidence: [{ type: "url", url: "https://example.com" }],
    establishedAt: "2026-09-12T12:00:00.000Z",
    presentation: {
      views: ["overview", "deployment"],
      role: "outcome",
      status: "verified",
      url: "https://example.com",
      checks: [
        {
          key: "http",
          label: "HTTP responds",
          status: "passed",
          claim: "reachability",
          basis: "observed",
          about: { kind: "application", id: "qa-app" },
        },
      ],
    },
  });
  await reopen();
  const view = await getOperatorView(app, chat);
  expect(view.information?.map((r) => r.id)).toEqual([record.id]);
  expect((await listInformation(app, "lockfile")).map((r) => r.id)).toEqual([
    hidden.id,
  ]);
  await saveInformation(
    app,
    { title: hidden.title, body: "Use npm ci." },
    hidden.id,
  );
  expect(await listInformation(app, "npm ci")).toHaveLength(1);
  await retireInformation(app, record.id);
  expect((await listInformation(app)).map((r) => r.id)).toEqual([hidden.id]);
  expect(
    (await getOperatorView(app, chat)).information?.[0].retiredAt,
  ).toBeTruthy();
});
it("tells an author who invented an ID what to do instead, and never touches another application's record", async () => {
  // Pi supplied IDs of its own when creating records, and the refusal said
  // only that they were not found. Record IDs are unique across every
  // application, so an invented one is a mistake worth naming precisely.
  const invented = "deployment";
  await expect(
    saveInformation(app, { title: "Deployed", body: "It runs." }, invented),
  ).rejects.toThrow(/Omit id to create a record/);
  expect(await listInformation(app)).toHaveLength(0);

  // Creating without an ID works and hands back the ID to update with.
  const created = await saveInformation(app, {
    title: "Deployed",
    body: "It runs.",
  });
  await saveInformation(
    app,
    { title: "Deployed", body: "It runs, and the data survived." },
    created.id,
  );
  const records = await listInformation(app);
  expect(records).toHaveLength(1);
  expect(records[0].body).toBe("It runs, and the data survived.");

  // A second application cannot reach the first one's record by naming its
  // ID, and the first one's record is left exactly as it was.
  const other = (
    await createApplication({
      repositoryUrl: "https://github.com/example/other",
    })
  ).application.id;
  await expect(
    saveInformation(
      other,
      { title: "Mine now", body: "Overwritten." },
      created.id,
    ),
  ).rejects.toThrow(/Omit id to create a record/);
  expect(await listInformation(other)).toHaveLength(0);
  expect((await listInformation(app))[0].body).toBe(
    "It runs, and the data survived.",
  );
});
it("removal goes through the worker that owns the histories, and cascades only application data", async () => {
  await saveInformation(app, { title: "Note", body: "Saved" });
  // Traffic totals live in traffic.db, where no foreign key reaches.
  await setCollection(app, "keep");
  await writeDay(
    app,
    countDay([], {
      day: "2026-09-28",
      timeZone: "UTC",
      scriptSince: null,
      coverage: { from: null, to: null, gaps: [] },
    }),
  );
  // Without the owner nothing is removed: a history must not be orphaned.
  await expect(removeApplication(app, "example/app")).rejects.toThrow(
    /worker is not running/,
  );
  expect(await store.getApplication(app)).toBeTruthy();
  expect(await readDays(app, "2026-09-28", "2026-09-28")).toHaveLength(1);
  const worker = (await ownSessions())!;
  try {
    await removeApplication(app, "example/app");
  } finally {
    await worker.close();
  }
  expect(await store.listApplications()).toEqual([]);
  expect(await store.listApplicationChats(app)).toEqual([]);
  expect(await listInformation(app, "", true)).toEqual([]);
  expect(await readDays(app, "2026-09-28", "2026-09-28")).toEqual([]);
  expect((await collectionOf(app)).enabledAt).toBeNull();
});

it("persists typed deployment/access facts and shares edits without duplicating records", async () => {
  const deployment = (await saveInformation(app, {
    title: "Application deployed",
    body: "The deployment is recorded.",
    presentation: {
      checks: [
        {
          key: "http",
          label: "HTTP responded",
          status: "passed",
          claim: "reachability",
          basis: "observed",
          about: { kind: "application", id: "qa-app" },
        },
      ],
      views: ["overview", "deployment"],
      role: "outcome",
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/qa/app",
        revision: "abcdef0123456789",
        image: "app:candidate",
        server: "fixture-server",
        changes: ["Added container packaging"],
      },
    },
  }))!;
  const access = (await saveInformation(app, {
    title: "Private access ready",
    body: "Open on the controller PC.",
    presentation: {
      views: ["overview", "deployment"],
      role: "status",
      url: "http://127.0.0.1:8080",
      content: {
        kind: "application-access",
        mode: "private",
        server: "fixture-server",
        localPort: 8080,
        remotePort: 80,
      },
    },
  }))!;
  expect(
    (await listInformation(app)).find((r) => r.id === deployment.id)
      ?.presentation?.content,
  ).toMatchObject({ kind: "deployment", image: "app:candidate" });
  // What the check was about survives the round trip, which is what places
  // it on a lane; `subject` used to carry this and named a column instead.
  expect(
    (await listInformation(app)).find((r) => r.id === deployment.id)
      ?.presentation?.checks[0].about,
  ).toEqual({ kind: "application", id: "qa-app" });
  await saveInformation(
    app,
    {
      ...access,
      presentation: {
        ...access.presentation!,
        url: "http://127.0.0.1:8081",
        content: {
          kind: "application-access",
          mode: "private",
          server: "fixture-server",
          localPort: 8081,
          remotePort: 80,
        },
      },
    },
    access.id,
  );
  expect(
    (await listInformation(app)).filter(
      (r) => r.presentation?.content?.kind === "application-access",
    ),
  ).toHaveLength(1);
  expect(
    (await listInformation(app)).find((r) => r.id === access.id)?.presentation
      ?.url,
  ).toBe("http://127.0.0.1:8081");
});

it("rejects malformed typed records before saving them", async () => {
  const base = {
    title: "Access",
    body: "",
    presentation: {
      views: ["overview"],
      role: "status",
      url: "http://example.com",
      content: {
        kind: "application-access",
        mode: "private",
        server: "fixture-server",
        localPort: 8080,
        remotePort: 80,
      },
    },
  };
  await expect(saveInformation(app, base)).rejects.toThrow("127.0.0.1");
  await expect(
    saveInformation(app, {
      ...base,
      presentation: { ...base.presentation, url: "http://127.0.0.1:8081" },
    }),
  ).rejects.toThrow("localPort");
  await expect(
    saveInformation(app, {
      ...base,
      presentation: { ...base.presentation, url: undefined },
    }),
  ).rejects.toThrow("browser URL");
  await expect(
    saveInformation(app, {
      ...base,
      presentation: {
        ...base.presentation,
        content: { kind: "arbitrary-html", html: "<script>" },
      },
    }),
  ).rejects.toThrow();
  expect(await listInformation(app)).toHaveLength(0);
});
