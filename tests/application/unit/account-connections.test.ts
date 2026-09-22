import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateAccountConnections } from "../../../scripts/migrate-account-connections.mjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { githubConnectionPath } from "../../../src/server/github-connection";
import { accountFile } from "../../../src/server/pi-configuration";

// Where a connection to the owner's account is kept decides whether two
// checkouts share one login or each copy a login that dies when the other
// renews. It follows the ChatGPT login: the account directory when one is
// named, otherwise the controller's own configuration.

afterEach(() => vi.unstubAllEnvs());

describe("connections live with the account", () => {
  it("shares the GitHub, Hetzner and Cloudflare connections through the account directory", () => {
    vi.stubEnv("HALLVI_CONFIG_DIR", "/tmp/hallvi-test/one/config");
    vi.stubEnv("HALLVI_PI_CONFIG_DIR", "/tmp/hallvi-test/account");
    expect(githubConnectionPath()).toBe(
      "/tmp/hallvi-test/account/github-connection.json",
    );
    expect(accountFile("hetzner-connection.json")).toBe(
      "/tmp/hallvi-test/account/hetzner-connection.json",
    );
    expect(accountFile("cloudflare-connection.json")).toBe(
      "/tmp/hallvi-test/account/cloudflare-connection.json",
    );
  });

  it("keeps a controller with only its own configuration directory isolated", () => {
    vi.stubEnv("HALLVI_CONFIG_DIR", "/tmp/hallvi-test/one/config");
    vi.stubEnv("HALLVI_PI_CONFIG_DIR", "");
    expect(githubConnectionPath()).toBe(
      "/tmp/hallvi-test/one/config/github-connection.json",
    );
  });
});

it("preserves installed connections on upgrade without overwriting or resurrecting a shared login", () => {
  const root = mkdtempSync(join(tmpdir(), "hallvi-account-upgrade-"));
  const config = join(root, "config");
  const account = join(root, "account");
  mkdirSync(config);
  mkdirSync(account);
  try {
    writeFileSync(join(config, "github-connection.json"), '"legacy-login"', {
      mode: 0o600,
    });
    writeFileSync(join(config, "hetzner-connection.json"), '"old-provider"', {
      mode: 0o600,
    });
    writeFileSync(join(account, "hetzner-connection.json"), "null", {
      mode: 0o600,
    });
    migrateAccountConnections(config, account);
    expect(readFileSync(join(account, "github-connection.json"), "utf8")).toBe(
      '"legacy-login"',
    );
    expect(existsSync(join(config, "github-connection.json"))).toBe(false);
    expect(readFileSync(join(account, "hetzner-connection.json"), "utf8")).toBe(
      "null",
    );
    expect(existsSync(join(config, "hetzner-connection.json"))).toBe(true);
    writeFileSync(join(account, "github-connection.json"), '"renewed-login"');
    migrateAccountConnections(config, account);
    expect(readFileSync(join(account, "github-connection.json"), "utf8")).toBe(
      '"renewed-login"',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
