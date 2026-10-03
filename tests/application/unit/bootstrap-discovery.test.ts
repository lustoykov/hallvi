import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

// Exercise the actual shell bootstrap with fixture HTTP responses, a tiny
// archive and an installer that writes only a test marker. It never contacts
// GitHub or touches an installation. Signature checks use real OpenSSL or
// the current Node runtime through the archive's fixture shim.
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-bootstrap-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it.each(["default", "custom", "bad-signature"])(
  "discovers pinned signed assets through %s bootstrap source",
  (mode) => {
    const version = "0.1.1-alpha.10";
    const folder = `hallvi-${version}-darwin-arm64`;
    const name = `${folder}.tgz`;
    const base = `https://releases.test/releases/download/v${version}`;
    const bin = join(root, "bin");
    mkdirSync(bin);
    mkdirSync(join(root, folder));
    writeFileSync(
      join(root, folder, "install.sh"),
      '#!/bin/sh\nprintf "fixture installer reached\\n" > "$HALLVI_BOOTSTRAP_MARKER"\n',
    );
    // Stock macOS uses the archive's Node fallback for Ed25519 verification.
    // Keep that path real without putting a full Node binary in every archive.
    mkdirSync(join(root, folder, "node/bin"), { recursive: true });
    writeFileSync(
      join(root, folder, "node/bin/node"),
      '#!/bin/sh\nexec "$HALLVI_BOOTSTRAP_NODE" "$@"\n',
      { mode: 0o755 },
    );
    mkdirSync(join(root, folder, "scripts"));
    copyFileSync(
      "scripts/release-trust.mjs",
      join(root, folder, "scripts/release-trust.mjs"),
    );
    execFileSync("tar", ["-czf", join(root, name), "-C", root, folder]);
    const archive = readFileSync(join(root, name));
    const key = generateKeyPairSync("ed25519");
    const bytes = Buffer.from(
      `${JSON.stringify(
        {
          hallviRelease: 1,
          channel: "alpha",
          version,
          revision: "a".repeat(40),
          schemaVersion: 18,
          releasedAt: "2026-09-29T21:00:00Z",
          notes: `https://releases.test/releases/tag/v${version}`,
          packages: {
            "darwin-arm64": {
              file: name,
              url: `${base}/${name}`,
              size: archive.length,
              sha256: createHash("sha256").update(archive).digest("hex"),
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(join(root, "hallvi-release.json"), bytes);
    const signingKey =
      mode === "bad-signature"
        ? generateKeyPairSync("ed25519").privateKey
        : key.privateKey;
    writeFileSync(
      join(root, "hallvi-release.json.sig"),
      sign(null, bytes, signingKey).toString("base64"),
    );
    const release = {
      tag_name: `v${version}`,
      assets: [
        {
          name: "hallvi-release.json",
          browser_download_url: `${base}/hallvi-release.json`,
        },
        {
          name: "hallvi-release.json.sig",
          browser_download_url: `${base}/hallvi-release.json.sig`,
        },
      ],
    };
    writeFileSync(join(root, "latest.json"), JSON.stringify(release));
    // An official list request reproduces the old ordering bug. No alpha.9
    // assets are served, so selecting its manifest cannot reach the installer.
    writeFileSync(
      join(root, "listing.json"),
      JSON.stringify(
        [9, 8, 10].map((number) => ({
          ...release,
          tag_name: `v0.1.1-alpha.${number}`,
          assets: release.assets.map((asset) => ({
            ...asset,
            browser_download_url: asset.browser_download_url.replace(
              "alpha.10",
              `alpha.${number}`,
            ),
          })),
        })),
      ),
    );
    writeFileSync(join(root, "custom.json"), JSON.stringify([release]));
    writeFileSync(join(bin, "id"), '#!/bin/sh\nprintf "501\\n"\n', {
      mode: 0o755,
    });
    writeFileSync(
      join(bin, "uname"),
      '#!/bin/sh\ncase "$1" in -s) echo Darwin;; -m) echo arm64;; esac\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "curl"),
      `#!/bin/sh
url=$2
printf '%s\\n' "$url" >> "$HALLVI_BOOTSTRAP_REQUESTS"
case "$url" in
  https://api.github.com/repos/lustoykov/hallvi/releases/latest) file=latest.json ;;
  https://api.github.com/repos/lustoykov/hallvi/releases?per_page=20) file=listing.json ;;
  https://fixture.test/custom) file=custom.json ;;
  ${base}/hallvi-release.json) file=hallvi-release.json ;;
  ${base}/hallvi-release.json.sig) file=hallvi-release.json.sig ;;
  ${base}/${name}) file=${name} ;;
  *) exit 22 ;;
esac
cp "$HALLVI_BOOTSTRAP_FIXTURE/$file" "$4"
`,
      { mode: 0o755 },
    );
    const marker = join(root, "installed-marker");
    const requests = join(root, "requests");
    const result = spawnSync("sh", ["scripts/bootstrap.sh"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TMPDIR: root,
        HALLVI_RELEASE_SOURCE:
          mode === "custom" ? "https://fixture.test/custom" : "",
        HALLVI_RELEASE_KEY: Buffer.from(
          key.publicKey.export({ type: "spki", format: "der" }),
        )
          .subarray(-32)
          .toString("base64"),
        HALLVI_BOOTSTRAP_FIXTURE: root,
        HALLVI_BOOTSTRAP_REQUESTS: requests,
        HALLVI_BOOTSTRAP_MARKER: marker,
        HALLVI_BOOTSTRAP_NODE: process.execPath,
      },
    });
    const fetched = readFileSync(requests, "utf8").trim().split("\n");
    expect(fetched.slice(0, 3)).toEqual([
      mode === "custom"
        ? "https://fixture.test/custom"
        : "https://api.github.com/repos/lustoykov/hallvi/releases/latest",
      `${base}/hallvi-release.json`,
      `${base}/hallvi-release.json.sig`,
    ]);
    if (mode === "bad-signature") {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("not signed by the Hallvi release key");
      expect(existsSync(marker)).toBe(false);
      // OpenSSL rejects before download; the Node fallback must unpack first.
      if (result.stdout.includes("check runs after unpacking")) {
        expect(fetched[3]).toBe(`${base}/${name}`);
      } else {
        expect(fetched).not.toContain(`${base}/${name}`);
      }
    } else {
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(marker, "utf8")).toBe("fixture installer reached\n");
      expect(fetched[3]).toBe(`${base}/${name}`);
    }
  },
);
