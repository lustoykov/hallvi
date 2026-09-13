// A secret the owner supplies and Pi never sees.
//
// These are the leaks that matter, each tested as a leak rather than as a
// feature: the value in the stored file, in what a page can read, in the
// command as recorded, in the output of the command that used it, and in a
// record Pi tried to save.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const VALUE = "correct-horse-battery-staple";
const APP = "11111111-1111-4111-8111-111111111111";

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

describe("giving a command a secret", () => {
  it("exports it rather than splicing it into the command", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    expect(secrets.secretEnvironment(APP, ["GF_SECURITY_ADMIN_PASSWORD"])).toBe(
      `export GF_SECURITY_ADMIN_PASSWORD='${VALUE}'\n`,
    );
  });

  it("exports nothing when nothing was asked for", () => {
    expect(secrets.secretEnvironment(APP, [])).toBe("");
  });

  it("stops rather than exporting a blank", () => {
    // The failure this prevents: a deployment that quietly came up with an
    // empty admin password and looked like a success.
    expect(() =>
      secrets.secretEnvironment(APP, ["GF_SECURITY_ADMIN_PASSWORD"]),
    ).toThrow(/No value has been supplied/);
  });

  it("stops the moment the owner takes it back", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    secrets.withdrawSecret(APP, "GF_SECURITY_ADMIN_PASSWORD");
    expect(() =>
      secrets.secretEnvironment(APP, ["GF_SECURITY_ADMIN_PASSWORD"]),
    ).toThrow(/No value has been supplied/);
  });

  it("refuses a command that writes a handle into its own text", () => {
    const refuse = () =>
      secrets.refuseSecretHandles(
        "docker run -e P={{secret:GF_SECURITY_ADMIN_PASSWORD}} grafana",
      );
    expect(refuse).toThrow(/shell syntax, not data/);
    expect(refuse).toThrow(/secrets: \["GF_SECURITY_ADMIN_PASSWORD"\]/);
  });

  it("lets an ordinary command through", () => {
    expect(() =>
      secrets.refuseSecretHandles('printf "%s" "$GF_SECURITY_ADMIN_PASSWORD"'),
    ).not.toThrow();
  });
});

describe("a hostile value is data, not syntax", () => {
  // Each of these would be a second command if the value were spliced into
  // the text Pi wrote. Through the environment, none of them is.
  const hostile = [
    ["a quote", `pa'ss word`],
    ["a command substitution", "x$(touch /tmp/sg-pwned)y"],
    ["backticks", "x`touch /tmp/sg-pwned2`y"],
    ["a semicolon", "abc; touch /tmp/sg-pwned3"],
    ["a newline", "line one\ntouch /tmp/sg-pwned4"],
    ["a dollar variable", "$HOME and ${PATH}"],
    ["unicode and spaces", "  pä ss — wörd  "],
    ["a backslash", "back\\slash\\"],
  ] as const;

  for (const [what, value] of hostile)
    it(`survives ${what} unchanged`, () => {
      secrets.requestSecret(APP, { name: "HOSTILE", why: "x" });
      secrets.establishSecret(APP, "HOSTILE", value);
      const prologue = secrets.secretEnvironment(APP, ["HOSTILE"]);
      // Round-trip it through a real shell: what the variable holds must be
      // the value byte for byte, and nothing else may have run.
      const printed = execFileSync(
        "bash",
        ["-c", `${prologue}printf %s "$HOSTILE"`],
        { encoding: "utf8" },
      );
      expect(printed).toBe(value);
    });

  it("runs no second command", () => {
    const marker = join(directory, "pwned");
    secrets.requestSecret(APP, { name: "HOSTILE", why: "x" });
    secrets.establishSecret(APP, "HOSTILE", `x'; touch ${marker}; echo '`);
    execFileSync(
      "bash",
      [
        "-c",
        `${secrets.secretEnvironment(APP, ["HOSTILE"])}printf %s "$HOSTILE"`,
      ],
      { encoding: "utf8" },
    );
    expect(existsSync(marker)).toBe(false);
  });
});

describe("using", () => {
  it("puts the handle back into anything the command printed", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    const output = `admin_password=${VALUE}\nstarting…`;
    expect(secrets.redactHeldSecrets(APP, output)).toBe(
      "admin_password={{secret:GF_SECURITY_ADMIN_PASSWORD}}\nstarting…",
    );
  });

  it("keeps one application's values out of another's output", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    expect(
      secrets.redactHeldSecrets("22222222-2222-4222-8222-222222222222", VALUE),
    ).toBe(VALUE);
  });

  it("has no value too short to redact, because none is accepted", () => {
    // The old gap: the store took any non-empty value and the redactor
    // skipped anything under four characters, so a three-character secret
    // was accepted and then silently not hidden.
    secrets.requestSecret(APP, { name: "PIN", why: "x" });
    expect(() => secrets.establishSecret(APP, "PIN", "abc")).toThrow(
      /at least 8 characters/,
    );
    expect(
      secrets.listSecrets(APP).find((s) => s.name === "PIN")?.establishedAt,
    ).toBeNull();
  });
});

describe("one application cannot reach another's", () => {
  const OTHER = "22222222-2222-4222-8222-222222222222";

  it("cannot export a value held by another application", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    secrets.requestSecret(OTHER, {
      name: "GF_SECURITY_ADMIN_PASSWORD",
      why: "x",
    });
    expect(() =>
      secrets.secretEnvironment(OTHER, ["GF_SECURITY_ADMIN_PASSWORD"]),
    ).toThrow(/No value has been supplied/);
  });

  it("cannot list, overwrite or withdraw another application's", () => {
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    expect(secrets.listSecrets(OTHER)).toEqual([]);
    expect(() =>
      secrets.establishSecret(
        OTHER,
        "GF_SECURITY_ADMIN_PASSWORD",
        "another-one",
      ),
    ).toThrow(/nowhere to put it/);
    secrets.withdrawSecret(OTHER, "GF_SECURITY_ADMIN_PASSWORD");
    // Untouched.
    expect(
      secrets.secretEnvironment(APP, ["GF_SECURITY_ADMIN_PASSWORD"]),
    ).toContain(VALUE);
  });

  it("refuses an application id that is not one", () => {
    // The same check the execution store makes, so nothing can be talked
    // into a path outside the secrets directory.
    for (const bad of ["../../etc/passwd", "not-a-uuid", ""])
      expect(() => secrets.listSecrets(bad)).toThrow();
  });
});
