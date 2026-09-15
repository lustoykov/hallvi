// Asking the internet what it can see.
//
// The probes themselves need the internet, and are exercised against a real
// published name rather than here. What is worth pinning down without a
// network is the boundary: this module answers one question — what an
// outsider gets — and a loopback address cannot answer it, however plausible
// the reading would look in a record afterwards.

import { afterEach, describe, expect, it, vi } from "vitest";

import { checkPublicAccess, publicUrlReachable } from "@/server/public-access";

afterEach(() => vi.unstubAllGlobals());

describe("what it refuses to check", () => {
  it("will not call a loopback URL a public one, and says what to use", async () => {
    await expect(
      checkPublicAccess({ url: "http://127.0.0.1:8080" }),
    ).rejects.toThrow(/open_server_port/);
  });

  it("refuses a private address just as firmly as localhost", async () => {
    for (const host of ["10.0.0.4", "192.168.1.9", "172.16.3.2", "localhost"])
      await expect(
        checkPublicAccess({ url: `https://${host}/` }),
      ).rejects.toThrow(/not reachable from the internet/);
  });

  it("refuses an expected address that is not an address", async () => {
    await expect(
      checkPublicAccess({ expectAddress: "app.example.com", ports: [5432] }),
    ).rejects.toThrow(/not an IP address/);
  });

  it("asks for something to check", async () => {
    await expect(checkPublicAccess({})).rejects.toThrow(/url to check/);
  });

  it("will not try a port without a machine to try it against", async () => {
    await expect(checkPublicAccess({ ports: [5432] })).rejects.toThrow(
      /no address was resolved/,
    );
  });
});

describe("whether a published address still answers", () => {
  it("is an answer from the address itself, not from it being public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, body: null }) as unknown as Response),
    );
    expect(await publicUrlReachable("https://app.example.com")).toBe(true);
  });

  it("counts a server error as not answering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 502, body: null }) as unknown as Response),
    );
    expect(await publicUrlReachable("https://app.example.com")).toBe(false);
  });

  // A sign-in page is the application answering. Requiring 200 would report
  // every protected application as down.
  it("counts a redirect to a login page as answering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 302, body: null }) as unknown as Response),
    );
    expect(await publicUrlReachable("https://app.example.com")).toBe(true);
  });

  it("says no when the request fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );
    expect(await publicUrlReachable("https://app.example.com")).toBe(false);
  });

  it("never reports a controller-only URL as a working public address", async () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    expect(await publicUrlReachable("http://127.0.0.1:8080")).toBe(false);
    expect(fetched).not.toHaveBeenCalled();
  });
});
