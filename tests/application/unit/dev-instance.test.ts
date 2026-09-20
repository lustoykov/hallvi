import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const applicationId = "1a2949ed-03bc-4692-b3c2-ca0719ba94a0";
const script = join(process.cwd(), "scripts", "dev-instance.mjs");
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-dev-instance-review-"));
  writeFileSync(
    join(root, "instance.json"),
    JSON.stringify({
      name: "Disposable review fixture",
      port: 61479,
      baseline: "fixture",
      host: {
        address: "example.test",
        provider: "fixture",
        serverId: "none",
        cost: "none",
      },
      applications: [
        {
          id: applicationId,
          name: "v2",
          exercises: "fixture",
          url: "https://example.test",
        },
      ],
    }),
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function command(args: string[], holder = "first") {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, HALLVI_DEV_ROOT: root, HALLVI_DEV_HOLDER: holder },
  });
}

it("uses one atomic claim for an application's name and ID", () => {
  expect(command(["claim", "v2", "changing feeds"]).status).toBe(0);
  expect(
    JSON.parse(readFileSync(join(root, "claims.json"), "utf8")),
  ).toMatchObject([{ scope: applicationId, holder: "first" }]);
  expect(
    command(["claim", applicationId, "another change"], "second").status,
  ).toBe(1);
  expect(command(["release", "v2"], "second").status).toBe(1);
  expect(command(["release", applicationId]).status).toBe(0);

  mkdirSync(join(root, "claims.lock"));
  expect(command(["claim", "v2", "another change"]).status).toBe(1);
  expect(JSON.parse(readFileSync(join(root, "claims.json"), "utf8"))).toEqual(
    [],
  );
});

it("refuses missing retained state and backup labels that escape its directory", () => {
  mkdirSync(join(root, "program", "dist"), { recursive: true });
  writeFileSync(join(root, "program", "dist", "worker.mjs"), "");
  expect(command(["start"]).stderr).toContain("persistent database is missing");
  expect(command(["backup", "nested/../../../elsewhere"]).stderr).toContain(
    "Use a short backup label",
  );

  mkdirSync(join(root, "run"));
  writeFileSync(join(root, "run", "dev-instance.pid"), String(process.pid));
  expect(command(["status"]).stdout).toContain("not started by this command");
});
