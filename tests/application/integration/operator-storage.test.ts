import { mkdtempSync, rmSync } from "node:fs";
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
} from "../../../src/server/operator-execution";
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
function reopen() {
  store.db().$client.close();
  delete globalThis.__hallviDb;
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-storage-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
});
beforeEach(async () => {
  store.db().$client.exec("DELETE FROM applications");
  app = (
    await createApplication({ repositoryUrl: "https://github.com/example/app" })
  ).application.id;
  chat = store.listApplicationChats(app)[0].id;
});
afterAll(() => {
  reopen();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it("loads creation and settings after reopening the database", () => {
  expect(store.getApplication(app)?.repositoryId).toBe(123);
  expect(store.getChat(chat)?.kind).toBe("main");
  expect(operatorSettings(app).permissionMode).toBe("pi-decides");
  saveOperatorSettings(app, { permissionMode: "always-ask", host: null });
  reopen();
  expect(operatorSettings(app).permissionMode).toBe("always-ask");
});
it("shares one outcome between views while keeping working knowledge unsurfaced", async () => {
  const hidden = saveInformation(app, {
    title: "Build note",
    body: "Use the repository lockfile.",
  });
  const record = saveInformation(app, {
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
  reopen();
  const view = await getOperatorView(app, chat);
  expect(view.information?.map((r) => r.id)).toEqual([record.id]);
  expect(listInformation(app, "lockfile").map((r) => r.id)).toEqual([
    hidden.id,
  ]);
  saveInformation(app, { title: hidden.title, body: "Use npm ci." }, hidden.id);
  expect(listInformation(app, "npm ci")).toHaveLength(1);
  retireInformation(app, record.id);
  expect(listInformation(app).map((r) => r.id)).toEqual([hidden.id]);
  expect(
    (await getOperatorView(app, chat)).information?.[0].retiredAt,
  ).toBeTruthy();
});
it("saves a record under the ID its author chose, and updates it there", () => {
  const chosen = "3b59539b-a80c-4511-a247-05561b0fede4";
  const created = saveInformation(
    app,
    { title: "Private access is ready", body: "Open it on this computer." },
    chosen,
  );
  expect(created.id).toBe(chosen);
  expect(listInformation(app, "private access").map((r) => r.id)).toEqual([
    chosen,
  ]);
  // The same ID again is the update it was always meant to be, not a second
  // record.
  saveInformation(
    app,
    { title: "Private access is ready", body: "The link is open again." },
    chosen,
  );
  const again = listInformation(app, "private access");
  expect(again).toHaveLength(1);
  expect(again[0].body).toBe("The link is open again.");
});
it("removal goes through the worker that owns the histories, and cascades only application data", async () => {
  saveInformation(app, { title: "Note", body: "Saved" });
  // Without the owner nothing is removed: a history must not be orphaned.
  await expect(removeApplication(app, "example/app")).rejects.toThrow(
    /worker is not running/,
  );
  expect(store.getApplication(app)).toBeTruthy();
  const worker = (await ownSessions())!;
  try {
    await removeApplication(app, "example/app");
  } finally {
    await worker.close();
  }
  for (const table of ["applications", "conversations", "saved_information"])
    expect(
      store.db().$client.prepare(`SELECT count(*) AS n FROM ${table}`).get(),
    ).toEqual({ n: 0 });
});

it("persists typed deployment/access facts and shares edits without duplicating records", () => {
  const deployment = saveInformation(app, {
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
  })!;
  const access = saveInformation(app, {
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
  })!;
  expect(
    listInformation(app).find((r) => r.id === deployment.id)?.presentation
      ?.content,
  ).toMatchObject({ kind: "deployment", image: "app:candidate" });
  // What the check was about survives the round trip, which is what places
  // it on a lane; `subject` used to carry this and named a column instead.
  expect(
    listInformation(app).find((r) => r.id === deployment.id)?.presentation
      ?.checks[0].about,
  ).toEqual({ kind: "application", id: "qa-app" });
  saveInformation(
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
    listInformation(app).filter(
      (r) => r.presentation?.content?.kind === "application-access",
    ),
  ).toHaveLength(1);
  expect(
    listInformation(app).find((r) => r.id === access.id)?.presentation?.url,
  ).toBe("http://127.0.0.1:8081");
});

it("rejects malformed typed records before saving them", () => {
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
  expect(() => saveInformation(app, base)).toThrow("127.0.0.1");
  expect(() =>
    saveInformation(app, {
      ...base,
      presentation: { ...base.presentation, url: "http://127.0.0.1:8081" },
    }),
  ).toThrow("localPort");
  expect(() =>
    saveInformation(app, {
      ...base,
      presentation: { ...base.presentation, url: undefined },
    }),
  ).toThrow("browser URL");
  expect(() =>
    saveInformation(app, {
      ...base,
      presentation: {
        ...base.presentation,
        content: { kind: "arbitrary-html", html: "<script>" },
      },
    }),
  ).toThrow();
  expect(listInformation(app)).toHaveLength(0);
});
