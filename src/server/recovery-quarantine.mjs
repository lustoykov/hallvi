import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Restores are evidence copies until an operator explicitly activates them. */
export function assertOutsideRecoveryQuarantine(
  database,
  config = process.env.SERVER_GUY_CONFIG_DIR ??
    join(process.cwd(), ".server-guy"),
) {
  const databaseFile = resolve(database);
  const configDirectory = resolve(config);
  for (const root of [
    dirname(
      existsSync(databaseFile) ? realpathSync(databaseFile) : databaseFile,
    ),
    existsSync(configDirectory)
      ? realpathSync(configDirectory)
      : configDirectory,
  ]) {
    if (existsSync(join(root, "RECOVERY_QUARANTINE"))) {
      throw new Error(
        "This is a quarantined controller restore. Review recovery paths, credentials, and pending operations before activating it.",
      );
    }
  }
}
