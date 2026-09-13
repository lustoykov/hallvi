import { describe, expect, it } from "vitest";

import { scanHostKey } from "../../../src/server/server-access";

const key = "1.2.3.4 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA\n";

describe("waiting for a new server's SSH to answer", () => {
  it("keeps asking while the machine is still booting", async () => {
    let attempts = 0;
    const keys = await scanHostKey("1.2.3.4", 22, undefined, {
      scan: async () => {
        attempts++;
        // What a booting Hetzner server actually does for the first minute.
        if (attempts < 3)
          throw new Error(
            "Command failed: ssh-keyscan -T 10 -p 22 -t ed25519 1.2.3.4\nwrite (1.2.3.4): Broken pipe",
          );
        return key;
      },
      waitMs: 500,
      intervalMs: 1,
    });
    expect(keys).toBe(key);
    expect(attempts).toBe(3);
  });

  it("treats an answer with no host key as not ready yet", async () => {
    let attempts = 0;
    const keys = await scanHostKey("1.2.3.4", 22, undefined, {
      scan: async () => (++attempts < 2 ? "" : key),
      waitMs: 500,
      intervalMs: 1,
    });
    expect(keys).toBe(key);
  });

  it("says what it was waiting for when it never answers", async () => {
    await expect(
      scanHostKey("1.2.3.4", 2222, undefined, {
        scan: async () => {
          throw new Error("Command failed: ssh-keyscan\nConnection refused");
        },
        waitMs: 5,
        intervalMs: 1,
      }),
    ).rejects.toThrow(
      /SSH did not answer at 1\.2\.3\.4:2222 while waiting for it: Connection refused/,
    );
  });

  it("stops when the turn is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      scanHostKey("1.2.3.4", 22, controller.signal, {
        scan: async () => key,
        waitMs: 500,
        intervalMs: 1,
      }),
    ).rejects.toThrow();
  });
});
