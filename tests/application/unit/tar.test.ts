import { describe, expect, it } from "vitest";

import {
  normalizeTarPath,
  readTar,
  TarValidationError,
  writeTar,
} from "../../../src/server/tar";

describe("tar reader and writer", () => {
  it("round-trips files with parent directories owned by the workload user", () => {
    const archive = writeTar([
      { path: "app/main.py", content: Buffer.from("print(1)\n") },
      { path: "README.md", content: Buffer.from("# hi\n") },
      { path: "bin/run.sh", content: Buffer.from("#!/bin/sh\n"), mode: 0o755 },
    ]);
    const entries = readTar(archive);
    expect(entries.map((entry) => [entry.path, entry.type])).toEqual([
      ["app", "directory"],
      ["bin", "directory"],
      ["app/main.py", "file"],
      ["README.md", "file"],
      ["bin/run.sh", "file"],
    ]);
    expect(entries.find((entry) => entry.path === "bin/run.sh")?.mode).toBe(
      0o755,
    );
    expect(
      entries.find((entry) => entry.path === "app/main.py")?.content.toString(),
    ).toBe("print(1)\n");
    // Owner fields are the workload uid, never the controller's.
    expect(archive.subarray(108, 115).toString("ascii")).toBe("0001750");
  });

  it("writes and reads paths longer than the ustar name field through pax headers", () => {
    const long = `${"deeply/".repeat(20)}file.txt`;
    const entries = readTar(
      writeTar([{ path: long, content: Buffer.from("x") }]),
    );
    expect(entries.at(-1)?.path).toBe(long);
  });

  it("strips the archive's top-level directory like a GitHub tarball", () => {
    const archive = writeTar([
      {
        path: "owner-repo-abc123/pyproject.toml",
        content: Buffer.from("[project]"),
      },
      { path: "owner-repo-abc123/app/main.py", content: Buffer.from("") },
    ]);
    expect(
      readTar(archive, { stripComponents: 1 })
        .filter((entry) => entry.type === "file")
        .map((entry) => entry.path),
    ).toEqual(["pyproject.toml", "app/main.py"]);
  });

  it("rejects links, absolute paths and traversal before anything is materialized", () => {
    const block = (name: string, type: string) => {
      const header = Buffer.alloc(512, 0);
      header.write(name, 0, "utf8");
      header.write("0000644", 100, "ascii");
      header.write("00000000000", 124, "ascii");
      header.write(type, 156, "ascii");
      header.write("ustar", 257, "ascii");
      header.write("        ", 148, "ascii");
      let sum = 0;
      for (const byte of header) sum += byte;
      header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
      return Buffer.concat([header, Buffer.alloc(1024, 0)]);
    };
    expect(() => readTar(block("evil", "2"))).toThrow(TarValidationError);
    expect(() => readTar(block("evil", "1"))).toThrow(/Links/);
    expect(() => readTar(block("/etc/passwd", "0"))).toThrow(/Absolute/);
    expect(() => readTar(block("../outside", "0"))).toThrow(/Unsafe/);
    expect(normalizeTarPath("./a/b", 0)).toBe("a/b");
    expect(() => normalizeTarPath("a/./b", 0)).toThrow(/Unsafe/);
    expect(() => normalizeTarPath("a/../b", 0)).toThrow(/Unsafe/);
    expect(normalizeTarPath("root/", 1)).toBeNull();
  });
});
