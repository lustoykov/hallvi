// A credential change against a real database, because the failure this
// guards cannot be reproduced in memory.
//
// The dangerous moment in a password change is between the two steps: the
// service has taken the new password and the application's configuration has
// not. In memory both steps are function calls and either can be made to
// fail. In reality only the database can say which password it now accepts,
// and the whole point of the fix is that the controller stops guessing and
// asks it. So this runs PostgreSQL, changes its password for real, breaks the
// step after it, and then asks.
//
// Opt in with HALDUR_DOCKER_TESTS=1 on a host with a reachable Docker
// Engine. It creates one throwaway container, uses synthetic values only, and
// removes it afterwards. Nothing outside that container is touched.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as secrets from "../../../src/server/application-secrets";

const APP = "3f1f0f7a-5b2f-4f6a-9d2e-6b9a6f1c2d40";
const IMAGE = "postgres:16-alpine";
const NAME = "POSTGRES_PASSWORD";

let container = "";
let directory = "";
let saved: string | undefined;

/**
 * Runs psql inside the container as the `postgres` role with `password`.
 *
 * Over the container's own network address rather than its loopback, because
 * the image's pg_hba trusts `127.0.0.1` unconditionally: a test that connected
 * there would accept every password and prove nothing about authentication.
 * The `host all all all scram-sha-256` rule is the one that actually asks.
 */
function psql(password: string, statement: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-e",
      `PGPASSWORD=${password}`,
      // Through the environment, not spliced into the shell word, for the
      // same reason the product does it: a value is data and never syntax.
      "-e",
      `SG_STATEMENT=${statement}`,
      container,
      "sh",
      "-c",
      `psql -h "$(hostname -i)" -U postgres -tAc "$SG_STATEMENT"`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** Whether the database lets this password in at all. */
function accepts(password: string) {
  try {
    return psql(password, "select 1") === "1";
  } catch {
    return false;
  }
}

describe.skipIf(process.env.HALDUR_DOCKER_TESTS !== "1")(
  "a credential change against a real PostgreSQL",
  () => {
    beforeAll(() => {
      directory = mkdtempSync(join(tmpdir(), "sg-credential-change-"));
      saved = process.env.HALDUR_CONFIG_DIR;
      process.env.HALDUR_CONFIG_DIR = directory;
      container = execFileSync(
        "docker",
        [
          "run",
          "--rm",
          "--detach",
          // No published port: nothing outside Docker can reach it.
          "--env",
          "POSTGRES_PASSWORD=the-first-password",
          IMAGE,
        ],
        { encoding: "utf8" },
      ).trim();
      const deadline = Date.now() + 60_000;
      for (;;) {
        try {
          execFileSync(
            "docker",
            ["exec", container, "pg_isready", "-U", "postgres"],
            {
              stdio: "ignore",
            },
          );
          break;
        } catch {
          if (Date.now() > deadline)
            throw new Error("PostgreSQL never became ready.");
          execFileSync("sleep", ["1"]);
        }
      }
    }, 120_000);

    afterAll(() => {
      if (container)
        try {
          execFileSync("docker", ["rm", "--force", container], {
            stdio: "ignore",
          });
        } catch {
          // Already gone.
        }
      if (saved === undefined) delete process.env.HALDUR_CONFIG_DIR;
      else process.env.HALDUR_CONFIG_DIR = saved;
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    beforeEach(() => {
      // Put the database and the store back in step: the controller holds
      // exactly the password the database takes, supplied by the owner. A
      // previous case may have left the database on either of its values, so
      // find the one that works rather than assuming.
      const working = ["the-first-password", ...heldValues()].find(accepts);
      if (!working) throw new Error("No held password opens the database.");
      psql(working, "alter role postgres password 'the-first-password'");
      rmSync(join(directory, "secrets"), { recursive: true, force: true });
      secrets.requestSecret(APP, {
        name: NAME,
        why: "PostgreSQL role password.",
      });
      secrets.establishSecret(APP, NAME, "the-first-password");
    });

    /** Every value the store holds for this name, current and outgoing. */
    function heldValues() {
      try {
        return secrets
          .secretEnvironment(APP, [NAME])
          .split("\n")
          .filter((row) => row.startsWith("export "))
          .map((row) =>
            row.slice(row.indexOf("'") + 1, -1).replace(/'\\''/g, "'"),
          );
      } catch {
        return [];
      }
    }

    /** Whichever value the store currently holds, for putting things back. */
    function currentValue() {
      const line = secrets
        .secretEnvironment(APP, [NAME])
        .split("\n")
        .find((row) => row.startsWith(`export ${NAME}=`))!;
      return line.slice(`export ${NAME}='`.length, -1).replace(/'\\''/g, "'");
    }

    it("keeps the password the database accepted when the next step fails", () => {
      const change = secrets.beginChange(APP, NAME);

      // Step one, for real: the database takes the new password, authenticated
      // with the old one exactly as Pi would.
      psql(change.previous, `alter role postgres password '${change.next}'`);
      expect(accepts(change.next)).toBe(true);
      expect(accepts(change.previous)).toBe(false);

      // Step two fails. Pi does not know which password the service has.
      expect(() =>
        execFileSync("docker", ["exec", container, "sh", "-c", "exit 7"], {
          stdio: "ignore",
        }),
      ).toThrow();

      // The honest outcome. Nothing is discarded.
      secrets.settleChange(
        APP,
        NAME,
        "unresolved",
        "The role password was changed; writing the application's configuration failed.",
      );

      // Both values are still held, so the one the database actually accepts
      // is still there to be found.
      const environment = secrets.secretEnvironment(APP, [NAME]);
      expect(environment).toContain(`export ${NAME}='${change.next}'`);
      expect(environment).toContain(
        `export ${NAME}_PREVIOUS='${change.previous}'`,
      );

      // And now the controller asks the database rather than guessing.
      expect(accepts(change.next)).toBe(true);
      secrets.settleChange(
        APP,
        NAME,
        "established",
        "psql authenticated with the new value.",
      );
      expect(secrets.changeInFlight(APP, NAME)).toBe(false);
      expect(accepts(currentValue())).toBe(true);
    }, 120_000);

    it("locks the application out if it reverts a password the database took", () => {
      // This is the counterfactual the unresolved outcome exists to prevent,
      // and the reason reverting needs proof rather than being the default
      // answer to "I am not sure". It is exactly what the old tool
      // description told Pi to do after a part-way failure.
      const change = secrets.beginChange(APP, NAME);
      psql(change.previous, `alter role postgres password '${change.next}'`);

      secrets.settleChange(
        APP,
        NAME,
        "reverted",
        "Assumed the change did not land.",
      );

      // The store now holds a password the database refuses, and the one it
      // accepts has been deleted. Recovery from here needs superuser access
      // the controller no longer has.
      expect(accepts(currentValue())).toBe(false);
      expect(accepts(change.next)).toBe(true);
      expect(secrets.secretEnvironment(APP, [NAME])).not.toContain("_PREVIOUS");
    }, 120_000);
  },
);
