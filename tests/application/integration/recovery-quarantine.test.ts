import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { assertOutsideRecoveryQuarantine } from "../../../src/server/recovery-quarantine.mjs";

it("blocks restored database or configuration before controller startup", () => {
  const root = mkdtempSync(join(tmpdir(), "sg-quarantine-"));
  const database = join(root, "database", "server-guy.db");
  const config = join(root, "config");
  mkdirSync(join(root, "database"));
  mkdirSync(config);
  try {
    expect(() =>
      assertOutsideRecoveryQuarantine(database, config),
    ).not.toThrow();
    const marker = join(root, "database", "RECOVERY_QUARANTINE");
    writeFileSync(marker, "Review before activation");
    expect(() => assertOutsideRecoveryQuarantine(database, config)).toThrow(
      "quarantined",
    );
    writeFileSync(database, "fixture");
    const alias = join(root, "alias.db");
    symlinkSync(database, alias);
    expect(() => assertOutsideRecoveryQuarantine(alias, config)).toThrow(
      "quarantined",
    );
    rmSync(marker);
    writeFileSync(
      join(config, "RECOVERY_QUARANTINE"),
      "Review before activation",
    );
    expect(() => assertOutsideRecoveryQuarantine(database, config)).toThrow(
      "quarantined",
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

it("refuses schema preparation, stamping and Drizzle against a quarantined file", () => {
  const root = mkdtempSync(join(tmpdir(), "sg-quarantine-migration-"));
  const database = join(root, "server-guy.db");
  const original = Buffer.from("evidence must remain untouched");
  writeFileSync(database, original);
  writeFileSync(join(root, "RECOVERY_QUARANTINE"), "Review first");
  try {
    for (const args of [
      ["scripts/prepare-db.mjs"],
      ["scripts/stamp-db.mjs"],
      ["--import", "tsx", "-e", "require('./drizzle.config.ts')"],
    ]) {
      const result = spawnSync(process.execPath, args, {
        env: { ...process.env, SERVER_GUY_DB_PATH: database },
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("quarantined");
      expect(readFileSync(database)).toEqual(original);
    }
  } finally {
    rmSync(root, { recursive: true });
  }
});
