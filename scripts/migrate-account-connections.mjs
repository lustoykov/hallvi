import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";

/** Run by the installed launcher before either child can renew a login.
 * An existing shared connection (including a saved disconnect) always wins.
 * Publish a complete file atomically, without overwriting an existing account.
 */
export function migrateAccountConnections(config, account) {
  if (resolve(config) === resolve(account)) return;
  for (const name of [
    "github-connection.json",
    "hetzner-connection.json",
    "cloudflare-connection.json",
  ]) {
    const source = join(config, name);
    const target = join(account, name);
    if (!existsSync(source) || existsSync(target)) continue;
    mkdirSync(account, { recursive: true, mode: 0o700 });
    const temporary = join(account, `connection-upgrade-${randomUUID()}.tmp`);
    try {
      copyFileSync(source, temporary, constants.COPYFILE_EXCL);
      chmodSync(temporary, 0o600);
      linkSync(temporary, target);
      unlinkSync(source);
    } catch (error) {
      if (error.code !== "EEXIST")
        throw new Error(
          "Could not move saved account connections to the account directory.",
        );
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}
