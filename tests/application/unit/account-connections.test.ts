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
