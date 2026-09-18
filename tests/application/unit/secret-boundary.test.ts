// What a command can hand back.
//
// The store keeps the value; these are the four ways it could leave anyway.
// The stored record was already clean before this test existed — the hole was
// the copy handed to the model, which is the one reader that can repeat it
// into a conversation, a saved record, and every artifact made from either.

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const APP = "11111111-1111-4111-8111-111111111111";
const VALUE = "correct-horse-battery-staple";
const HANDLE = "{{secret:ADMIN_PASSWORD}}";

let secrets: typeof import("@/server/application-secrets");

beforeEach(async () => {
  process.env.HALLVI_CONFIG_DIR = mkdtempSync(join(tmpdir(), "hv-bound-"));
  secrets = await import("@/server/application-secrets");
  secrets.requestSecret(APP, { name: "ADMIN_PASSWORD", why: "Needed." });
  secrets.establishSecret(APP, "ADMIN_PASSWORD", VALUE);
});

afterEach(() => {
  delete process.env.HALLVI_CONFIG_DIR;
});

/** The redaction the execution layer applies to every string that leaves. */
const clean = (text: string) => secrets.redactHeldSecrets(APP, text);

describe("a command that prints its own secret", () => {
  it("has the value replaced in what it printed", () => {
    const printed = execFileSync(
      "bash",
      [
        "-c",
        `${secrets.secretEnvironment(APP, ["ADMIN_PASSWORD"])}printf 'admin=%s\\n' "$ADMIN_PASSWORD"`,
      ],
      { encoding: "utf8" },
    );
    expect(printed).toContain(VALUE);
    expect(clean(printed)).toBe(`admin=${HANDLE}\n`);
  });

  it("has it replaced in a nested tool result, not only the top level", () => {
    // The result handed to the model is walked rather than stringified, so a
    // field nobody thought to check cannot carry it through.
    const result = {
      output: `env: ${VALUE}`,
      exitCode: 0,
      nested: { lines: [`also ${VALUE}`], count: 1 },
    };
    const walked = JSON.parse(clean(JSON.stringify(result)));
    expect(JSON.stringify(walked)).not.toContain(VALUE);
    expect(walked.nested.lines[0]).toBe(`also ${HANDLE}`);
    expect(walked.exitCode).toBe(0);
  });

  it("has it replaced in a failure message", () => {
    const said = `psql: connection to "postgres://u:${VALUE}@db" refused`;
    expect(clean(said)).not.toContain(VALUE);
    expect(clean(said)).toContain(HANDLE);
  });
});

describe("the value reaches the process exactly", () => {
  const hostile = `p a$s'"; touch /tmp/no; echo \`x\` \\ ünï`;

  it("survives a shell round trip byte for byte", () => {
    secrets.requestSecret(APP, { name: "HOSTILE", why: "x" });
    secrets.establishSecret(APP, "HOSTILE", hostile);
    const printed = execFileSync(
      "bash",
      [
        "-c",
        `${secrets.secretEnvironment(APP, ["HOSTILE"])}printf %s "$HOSTILE"`,
      ],
      { encoding: "utf8" },
    );
    expect(printed).toBe(hostile);
  });

  it("exports several at once, each intact", () => {
    secrets.requestSecret(APP, { name: "SECOND_VALUE", why: "x" });
    secrets.establishSecret(APP, "SECOND_VALUE", "second's value");
    const prologue = secrets.secretEnvironment(APP, [
      "ADMIN_PASSWORD",
      "SECOND_VALUE",
    ]);
    const printed = execFileSync(
      "bash",
      ["-c", `${prologue}printf '%s|%s' "$ADMIN_PASSWORD" "$SECOND_VALUE"`],
      { encoding: "utf8" },
    );
    expect(printed).toBe(`${VALUE}|second's value`);
  });
});

describe("what is written down", () => {
  it("keeps the value out of the arguments a record would store", () => {
    // What the execution record stores is the tool's parameters: the command
    // Pi wrote and the names it asked for. Neither holds a value.
    const stored = JSON.stringify({
      command: 'psql -c "select 1"',
      secrets: ["ADMIN_PASSWORD"],
    });
    expect(stored).not.toContain(VALUE);
    expect(clean(stored)).toBe(stored);
  });
});
