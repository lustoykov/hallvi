// A secret the owner supplies and Pi never sees.
//
// These are the leaks that matter, each tested as a leak rather than as a
// feature: the value in the stored file, in what a page can read, in the
// command as recorded, in the output of the command that used it, and in a
// record Pi tried to save.

import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const VALUE = "correct-horse-battery-staple";
const APP = "app-1";

let directory: string;
let secrets: typeof import("@/server/application-secrets");

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "sg-secrets-"));
  process.env.SERVER_GUY_CONFIG_DIR = directory;
  // The module reads the directory lazily, but a fresh import per test keeps
  // any future caching from leaking a value between them.
  secrets = await import("@/server/application-secrets");
  secrets.requestSecret(APP, {
    name: "GF_SECURITY_ADMIN_PASSWORD",
    why: "Grafana refuses to start without an admin password.",
    process: "grafana",
  });
});

afterEach(() => {
  delete process.env.SERVER_GUY_CONFIG_DIR;
});

describe("asking", () => {
  it("gives Pi a handle and no value", () => {
    const asked = secrets.requestSecret(APP, {
      name: "OTHER_TOKEN",
      why: "Because.",
    });
    expect(asked).toEqual({
      handle: "{{secret:OTHER_TOKEN}}",
      established: false,
    });
    expect(JSON.stringify(asked)).not.toContain(VALUE);
  });

  it("refuses a name that is not an environment variable", () => {
    expect(() =>
      secrets.requestSecret(APP, { name: "my password", why: "x" }),
    ).toThrow(/not a usable name/);
  });

  it("does not fail when a second turn asks for the same thing", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    const again = secrets.requestSecret(APP, {
      name: "GF_SECURITY_ADMIN_PASSWORD",
      why: "Still needed.",
    });
    expect(again.established).toBe(true);
  });
});

describe("holding", () => {
  it("never writes the value to disk in the clear", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    const file = readFileSync(
      join(directory, "secrets", `${APP}.json`),
      "utf8",
    );
    expect(file).not.toContain(VALUE);
    expect(file).toContain("GF_SECURITY_ADMIN_PASSWORD");
  });

  it("keeps the store and its key to the owner alone", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    for (const name of ["key", `${APP}.json`])
      expect(statSync(join(directory, "secrets", name)).mode & 0o777).toBe(
        0o600,
      );
  });

  it("never returns a value to anything that lists them", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    const listed = secrets.listSecrets(APP);
    expect(JSON.stringify(listed)).not.toContain(VALUE);
    expect(listed[0].establishedAt).toBeTruthy();
    expect(listed[0].why).toContain("admin password");
  });

  it("has nowhere to put a value nobody asked for", () => {
    expect(() => secrets.establishSecret(APP, "NOT_ASKED", VALUE)).toThrow(
      /nowhere to put it/,
    );
  });
});

describe("using", () => {
  it("resolves a handle only at the point of use", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    const command =
      "docker run -e GF_SECURITY_ADMIN_PASSWORD={{secret:GF_SECURITY_ADMIN_PASSWORD}} grafana/grafana";
    expect(command).not.toContain(VALUE);
    expect(secrets.resolveSecretHandles(APP, command)).toBe(
      `docker run -e GF_SECURITY_ADMIN_PASSWORD=${VALUE} grafana/grafana`,
    );
  });

  it("stops rather than running with a blank", () => {
    // The failure mode this prevents: a deployment that quietly came up with
    // an empty admin password and looked like a success.
    expect(() =>
      secrets.resolveSecretHandles(
        APP,
        "echo {{secret:GF_SECURITY_ADMIN_PASSWORD}}",
      ),
    ).toThrow(/No value has been supplied/);
  });

  it("stops resolving the moment the owner takes it back", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    secrets.withdrawSecret(APP, "GF_SECURITY_ADMIN_PASSWORD");
    expect(() =>
      secrets.resolveSecretHandles(
        APP,
        "{{secret:GF_SECURITY_ADMIN_PASSWORD}}",
      ),
    ).toThrow(/No value has been supplied/);
  });

  it("puts the handle back into anything the command printed", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    const output = `admin_password=${VALUE}\nstarting…`;
    expect(secrets.redactHeldSecrets(APP, output)).toBe(
      "admin_password={{secret:GF_SECURITY_ADMIN_PASSWORD}}\nstarting…",
    );
  });

  it("keeps one application's values out of another's output", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    expect(secrets.redactHeldSecrets("app-2", VALUE)).toBe(VALUE);
  });

  it("does not chase values too short to be distinctive", () => {
    secrets.requestSecret(APP, { name: "PIN", why: "x" });
    secrets.establishSecret(APP, "PIN", "abc");
    expect(secrets.redactHeldSecrets(APP, "abcdef")).toBe("abcdef");
  });
});
