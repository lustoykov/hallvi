import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it } from "vitest";
import type { NativeConfiguration } from "../../../src/server/deployment-release";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import { saveDeploymentInputs } from "../../../src/server/deployment-executor";
import { releaseSecrets } from "../../../src/server/release-executor";
import { executableCompose } from "../../../src/server/native-compose";

const id = "0a1b2c3d-0000-4000-8000-000000000009";
const native = {
  format: 1,
  resolver: "docker compose 2.40.3",
  compose: ["compose.yaml"],
  files: [],
  resolved: {
    name: "sg-0a1b2c3d",
    services: {
      web: {
        image: "example/web:1",
        environment: {
          APP_URL: "${SERVER_GUY_PUBLIC_URL}",
          APP_KEY: "${APP_KEY}",
          ADMIN_PASSWORD: "${ADMIN_PASSWORD}",
        },
      },
    },
  },
  inputs: ["ADMIN_PASSWORD", "APP_KEY"],
  inputGenerators: { APP_KEY: { bytes: 32, encoding: "base64", prefix: "base64:" } },
  data: [],
  database: null,
  httpAccess: "public",
  criterion: null,
  summary: "A web service with a generated key and its own address",
} satisfies NativeConfiguration;
const record = {
  id,
  native,
  address: "203.0.113.7",
} as unknown as DeploymentRecord;
beforeEach(() => {
  process.env.SERVER_GUY_CONFIG_DIR = mkdtempSync(join(tmpdir(), "sg-inputs-"));
  const directory = join(process.env.SERVER_GUY_CONFIG_DIR, "deployments", id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "database-password"), "synthetic-password");
});

it("generates values that only need to be random and still requires what the owner must supply", () => {
  expect(() =>
    saveDeploymentInputs(record, { ADMIN_PASSWORD: "typed", APP_KEY: "x" }),
  ).toThrow("Unexpected deployment input");
  expect(() => saveDeploymentInputs(record, {})).toThrow(
    "Provide ADMIN_PASSWORD",
  );
  saveDeploymentInputs(record, { ADMIN_PASSWORD: "typed-by-owner" });
  const saved = JSON.parse(
    readFileSync(
      join(process.env.SERVER_GUY_CONFIG_DIR!, "deployments", id, "inputs.json"),
      "utf8",
    ),
  );
  expect(saved.ADMIN_PASSWORD).toBe("typed-by-owner");
  expect(saved.APP_KEY).toMatch(/^base64:[A-Za-z0-9+/]{43}=$/);
});

it("supplies the application's own address once the server exists, unredacted", () => {
  saveDeploymentInputs(record, { ADMIN_PASSWORD: "typed-by-owner" });
  const secrets = releaseSecrets(record);
  const compose = JSON.parse(executableCompose(native, secrets.values));
  expect(compose.services.web.environment.APP_URL).toBe("http://203.0.113.7");
  expect(secrets.redact("open http://203.0.113.7 as typed-by-owner")).toBe(
    "open http://203.0.113.7 as [REDACTED]",
  );
});
