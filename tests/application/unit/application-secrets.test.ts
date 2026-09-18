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
  directory = mkdtempSync(join(tmpdir(), "hv-secrets-"));
  process.env.HALLVI_CONFIG_DIR = directory;
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
  delete process.env.HALLVI_CONFIG_DIR;
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

  it("leaves the request open, so the owner can give a different one", () => {
    // Removing the request as well was a dead end: only Pi can ask, so an
    // owner who withdrew by mistake could not put anything back.
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    secrets.withdrawSecret(APP, "GF_SECURITY_ADMIN_PASSWORD");
    const listed = secrets.listSecrets(APP);
    expect(listed.map((item) => item.name)).toContain(
      "GF_SECURITY_ADMIN_PASSWORD",
    );
    expect(listed[0].establishedAt).toBeNull();
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", "a-second-one");
    expect(
      secrets.secretEnvironment(APP, ["GF_SECURITY_ADMIN_PASSWORD"]),
    ).toContain("a-second-one");
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
    ["a command substitution", "x$(touch /tmp/hv-pwned)y"],
    ["backticks", "x`touch /tmp/hv-pwned2`y"],
    ["a semicolon", "abc; touch /tmp/hv-pwned3"],
    ["a newline", "line one\ntouch /tmp/hv-pwned4"],
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

describe("a credential the controller generates", () => {
  it("never returns the value, only its name and length", () => {
    const made = secrets.generateSecret(APP, {
      name: "POSTGRES_PASSWORD",
      why: "PostgreSQL needs a password for the application's role.",
      process: "db",
    });
    expect(made.handle).toBe("{{secret:POSTGRES_PASSWORD}}");
    expect(made.origin).toBe("generated");
    expect(made.length).toBe(32);
    expect(made.reused).toBe(false);
    // Nothing in the returned object is the password.
    expect(JSON.stringify(made)).not.toContain(
      secrets.revealSecret(APP, "POSTGRES_PASSWORD").value,
    );
  });

  it("is strong and free of characters that need escaping", () => {
    secrets.generateSecret(APP, { name: "POSTGRES_PASSWORD", why: "x" });
    const { value } = secrets.revealSecret(APP, "POSTGRES_PASSWORD");
    // base64url only: safe in a connection string, a shell word and a URL.
    expect(value).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("does not collide across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) {
      const app = `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`;
      secrets.generateSecret(app, { name: "POSTGRES_PASSWORD", why: "x" });
      seen.add(secrets.revealSecret(app, "POSTGRES_PASSWORD").value);
    }
    expect(seen.size).toBe(32);
  });

  it("reuses an established credential instead of quietly making another", () => {
    // The failure this prevents: a retried turn or a restarted worker
    // generating afresh, leaving the running database on a value the
    // controller has already replaced.
    secrets.generateSecret(APP, { name: "POSTGRES_PASSWORD", why: "first" });
    const first = secrets.revealSecret(APP, "POSTGRES_PASSWORD").value;
    const again = secrets.generateSecret(APP, {
      name: "POSTGRES_PASSWORD",
      why: "second attempt",
    });
    expect(again.reused).toBe(true);
    expect(secrets.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(first);
  });

  it("survives a restart, because it is on disk and not in memory", async () => {
    secrets.generateSecret(APP, { name: "POSTGRES_PASSWORD", why: "x" });
    const before = secrets.revealSecret(APP, "POSTGRES_PASSWORD").value;
    // A fresh import is this process's version of the controller restarting.
    const restarted = await import(
      "@/server/application-secrets?restart=" + Date.now()
    );
    expect(restarted.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(before);
  });

  it("is not in the list every page reads", () => {
    secrets.generateSecret(APP, { name: "POSTGRES_PASSWORD", why: "x" });
    const value = secrets.revealSecret(APP, "POSTGRES_PASSWORD").value;
    const listed = secrets.listSecrets(APP);
    expect(JSON.stringify(listed)).not.toContain(value);
    const row = listed.find((item) => item.name === "POSTGRES_PASSWORD");
    expect(row?.origin).toBe("generated");
  });
});

describe("revealing", () => {
  it("returns a generated value to the owner who asked", () => {
    secrets.generateSecret(APP, { name: "POSTGRES_PASSWORD", why: "x" });
    const shown = secrets.revealSecret(APP, "POSTGRES_PASSWORD");
    expect(shown.value).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(shown.origin).toBe("generated");
  });

  it("refuses to read back a value the owner supplied", () => {
    // The store is not an oracle for secrets it was given in confidence, and
    // the owner already knows what they typed.
    secrets.establishSecret(APP, "GF_SECURITY_ADMIN_PASSWORD", VALUE);
    expect(() =>
      secrets.revealSecret(APP, "GF_SECURITY_ADMIN_PASSWORD"),
    ).toThrow(/will not read it back/);
  });

  it("refuses a name it holds nothing for", () => {
    expect(() => secrets.revealSecret(APP, "NOTHING_HERE")).toThrow(
      /No value is held/,
    );
  });
});

describe("changing a credential", () => {
  beforeEach(() => {
    secrets.generateSecret(APP, {
      name: "POSTGRES_PASSWORD",
      why: "PostgreSQL role password.",
      process: "db",
    });
  });

  it("hands back both values, because the change needs both", () => {
    const before = secrets.revealSecret(APP, "POSTGRES_PASSWORD").value;
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    expect(change.previous).toBe(before);
    expect(change.next).not.toBe(before);
    expect(change.next).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("says a change is in flight until it is settled", () => {
    secrets.beginChange(APP, "POSTGRES_PASSWORD");
    expect(secrets.changeInFlight(APP, "POSTGRES_PASSWORD")).toBe(true);
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "established");
    expect(secrets.changeInFlight(APP, "POSTGRES_PASSWORD")).toBe(false);
  });

  it("keeps the new value once its use is established", () => {
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "established");
    expect(secrets.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(
      change.next,
    );
  });

  it("puts the old value back when the service is proved to still take it", () => {
    // Only ever after proof. The outcome for "a command failed and I do not
    // know which password the service has" is unresolved, which discards
    // nothing; see the unresolved suite below.
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    const settled = secrets.settleChange(APP, "POSTGRES_PASSWORD", "reverted");
    expect(settled.rolledBack).toBe(true);
    expect(secrets.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(
      change.previous,
    );
  });

  it("redacts both values while the change is in flight", () => {
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    const output = `old=${change.previous} new=${change.next}`;
    const clean = secrets.redactHeldSecrets(APP, output);
    expect(clean).not.toContain(change.previous);
    expect(clean).not.toContain(change.next);
  });

  it("does not keep the old value after the change settles", () => {
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "established");
    const stored = readFileSync(
      join(directory, "secrets", `${APP}.json`),
      "utf8",
    );
    // Not an indefinite history: one predecessor, only while it can still be
    // needed. Its ciphertext is gone once the new value is proven.
    expect(stored).not.toContain("previous");
    expect(secrets.redactHeldSecrets(APP, change.previous)).toBe(
      change.previous,
    );
  });

  it("accepts a value the owner chose instead of generating one", () => {
    const change = secrets.beginChange(
      APP,
      "POSTGRES_PASSWORD",
      "a-password-the-owner-picked",
    );
    expect(change.next).toBe("a-password-the-owner-picked");
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "established");
    const row = secrets
      .listSecrets(APP)
      .find((item) => item.name === "POSTGRES_PASSWORD");
    expect(row?.origin).toBe("owner");
    // And an owner-chosen value stops being revealable, as any owner value is.
    expect(() => secrets.revealSecret(APP, "POSTGRES_PASSWORD")).toThrow();
  });

  it("refuses a replacement too short to redact", () => {
    expect(() =>
      secrets.beginChange(APP, "POSTGRES_PASSWORD", "short"),
    ).toThrow(/at least/);
  });
});

describe("a change nobody could settle", () => {
  // The scenario this exists for: ALTER ROLE succeeds, then writing the
  // application's configuration fails. The service has the new password and
  // the controller cannot prove it. The old answer was to roll back, which
  // deleted the only password the database now accepts.
  beforeEach(() => {
    secrets.generateSecret(APP, {
      name: "POSTGRES_PASSWORD",
      why: "PostgreSQL role password.",
      process: "db",
    });
  });

  it("keeps both values, so the one the service took is still there", () => {
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    const settled = secrets.settleChange(
      APP,
      "POSTGRES_PASSWORD",
      "unresolved",
      "ALTER ROLE succeeded; writing the application config failed.",
    );
    expect(settled.unresolved).toBe(true);
    const environment = secrets.secretEnvironment(APP, ["POSTGRES_PASSWORD"]);
    expect(environment).toContain(`export POSTGRES_PASSWORD='${change.next}'`);
    expect(environment).toContain(
      `export POSTGRES_PASSWORD_PREVIOUS='${change.previous}'`,
    );
  });

  it("keeps saying the change is part-way through, with the reason", () => {
    secrets.beginChange(APP, "POSTGRES_PASSWORD");
    secrets.settleChange(
      APP,
      "POSTGRES_PASSWORD",
      "unresolved",
      "The database was reachable and the app config write failed.",
    );
    expect(secrets.changeInFlight(APP, "POSTGRES_PASSWORD")).toBe(true);
    const row = secrets
      .listSecrets(APP)
      .find((item) => item.name === "POSTGRES_PASSWORD");
    expect(row?.changing).toBe(true);
    expect(row?.unresolved?.why).toMatch(/app config write failed/);
  });

  it("settles properly once the answer is found", () => {
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "unresolved", "Unknown.");
    // Pi goes and asks the service which password it takes, then says so.
    secrets.settleChange(
      APP,
      "POSTGRES_PASSWORD",
      "established",
      "psql authenticated with the new value and the app answered.",
    );
    expect(secrets.changeInFlight(APP, "POSTGRES_PASSWORD")).toBe(false);
    expect(secrets.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(
      change.next,
    );
    const row = secrets
      .listSecrets(APP)
      .find((item) => item.name === "POSTGRES_PASSWORD");
    expect(row?.unresolved).toBe(null);
  });
});

describe("provenance across a rollback", () => {
  it("does not turn an owner's password into a revealable generated one", () => {
    // A generated rotation of a value the owner typed, rolled back. The bytes
    // came back and the record did not, so the store held the owner's own
    // password under origin "generated" — and generated is exactly the origin
    // that may be read back to the screen.
    secrets.requestSecret(APP, {
      name: "GF_SECURITY_ADMIN_PASSWORD",
      why: "Grafana admin.",
    });
    secrets.establishSecret(
      APP,
      "GF_SECURITY_ADMIN_PASSWORD",
      "the-owner-typed-this",
    );
    const before = secrets
      .listSecrets(APP)
      .find((item) => item.name === "GF_SECURITY_ADMIN_PASSWORD");
    expect(before?.origin).toBe("owner");

    secrets.beginChange(APP, "GF_SECURITY_ADMIN_PASSWORD");
    secrets.settleChange(
      APP,
      "GF_SECURITY_ADMIN_PASSWORD",
      "reverted",
      "Grafana still accepts the old password; the new one never reached it.",
    );

    const after = secrets
      .listSecrets(APP)
      .find((item) => item.name === "GF_SECURITY_ADMIN_PASSWORD");
    expect(after?.origin).toBe("owner");
    expect(after?.revision).toBe(before?.revision);
    expect(after?.establishedAt).toBe(before?.establishedAt);
    expect(() =>
      secrets.revealSecret(APP, "GF_SECURITY_ADMIN_PASSWORD"),
    ).toThrow(/will not read it back/);
    // And the value that came back is the owner's, not the replacement.
    expect(
      secrets.secretEnvironment(APP, ["GF_SECURITY_ADMIN_PASSWORD"]),
    ).toContain("'the-owner-typed-this'");
  });
});

describe("the environment a change runs in", () => {
  beforeEach(() => {
    secrets.generateSecret(APP, {
      name: "POSTGRES_PASSWORD",
      why: "PostgreSQL role password.",
      process: "db",
    });
  });

  it("exports the incoming value as $NAME, never the outgoing one", () => {
    // The bug this guards: both values live in the store during a change, and
    // a lookup that flattens them exports whichever came last. If $NAME ever
    // became the old password, every script that "sets the new password"
    // would quietly set the old one again.
    const change = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    const environment = secrets.secretEnvironment(APP, ["POSTGRES_PASSWORD"]);
    expect(environment).toContain(
      "export POSTGRES_PASSWORD='" + change.next + "'",
    );
    expect(environment).toContain(
      "export POSTGRES_PASSWORD_PREVIOUS='" + change.previous + "'",
    );
  });

  it("offers the outgoing value only while the change is in flight", () => {
    expect(secrets.secretEnvironment(APP, ["POSTGRES_PASSWORD"])).not.toContain(
      "_PREVIOUS",
    );
    secrets.beginChange(APP, "POSTGRES_PASSWORD");
    expect(secrets.secretEnvironment(APP, ["POSTGRES_PASSWORD"])).toContain(
      "_PREVIOUS",
    );
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "established");
    expect(secrets.secretEnvironment(APP, ["POSTGRES_PASSWORD"])).not.toContain(
      "_PREVIOUS",
    );
  });

  it("puts a value carrying shell syntax through as bytes", () => {
    const nasty = "a'; rm -rf /; echo '";
    secrets.requestSecret(APP, { name: "AWKWARD", why: "x" });
    secrets.establishSecret(APP, "AWKWARD", nasty);
    const environment = secrets.secretEnvironment(APP, ["AWKWARD"]);
    // Single-quoted with POSIX escaping, so the shell never parses it. Run it
    // to be sure rather than asserting a shape: the variable must come back
    // byte-for-byte and no second command may run.
    const echoed = execFileSync(
      "sh",
      ["-c", environment + 'printf %s "$AWKWARD"'],
      { encoding: "utf8" },
    );
    expect(echoed).toBe(nasty);
  });
});

describe("a second change while one is in flight", () => {
  beforeEach(() => {
    secrets.generateSecret(APP, {
      name: "POSTGRES_PASSWORD",
      why: "PostgreSQL role password.",
      process: "db",
    });
  });

  it("is refused, rather than discarding the password that still works", () => {
    // Before this was refused, the second begin overwrote the predecessor
    // with the first change's unproven value. Rolling back then restored a
    // password nothing had ever accepted, and the application was locked out
    // by the very mechanism meant to prevent it. A retried turn is the
    // ordinary way to reach this.
    const original = secrets.revealSecret(APP, "POSTGRES_PASSWORD").value;
    secrets.beginChange(APP, "POSTGRES_PASSWORD");
    expect(() => secrets.beginChange(APP, "POSTGRES_PASSWORD")).toThrow(
      /already part-way through/,
    );
    // And the working value is still the one that comes back.
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "reverted");
    expect(secrets.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(original);
  });

  it("lets a change begin again once the first is settled", () => {
    secrets.beginChange(APP, "POSTGRES_PASSWORD");
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "established");
    const second = secrets.beginChange(APP, "POSTGRES_PASSWORD");
    expect(second.changing).toBe(true);
    secrets.settleChange(APP, "POSTGRES_PASSWORD", "established");
    expect(secrets.revealSecret(APP, "POSTGRES_PASSWORD").value).toBe(
      second.next,
    );
  });
});
