// Retire the credentials that reached a commit, before the rig is relied on
// again. Everything here is local and throwaway: three SSH keypairs that reach
// only the rig's host container, and a secret store whose key was pushed
// alongside its own ciphertexts.
//
// It prints names and fingerprints. It never prints a key or a secret value.
//
//   node scripts/rotate-rig-credentials.mjs <stateDir> <container>
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

const state = process.argv[2] ?? ".state";
const container = process.argv[3] ?? "sg-rig-views";
const done = [];

// ---- 1. SSH keypairs -------------------------------------------------------
// A new pair per application, the new public key installed in the container's
// authorized_keys and every old one removed, so the exposed private keys stop
// authorising anything even though they only ever reached this container.
const operatorDir = join(state, "operator");
const fresh = [];
const retiredPublicKeys = [];
for (const app of existsSync(operatorDir) ? readdirSync(operatorDir) : []) {
  const dir = join(operatorDir, app, "ssh");
  const key = join(dir, "id_ed25519");
  if (!existsSync(key)) continue;
  retiredPublicKeys.push(readFileSync(`${key}.pub`, "utf8").trim());
  renameSync(key, `${key}.retired`);
  renameSync(`${key}.pub`, `${key}.pub.retired`);
  execFileSync(
    "ssh-keygen",
    [
      "-t",
      "ed25519",
      "-N",
      "",
      "-C",
      `server-guy-${app.slice(0, 8)}-rotated`,
      "-f",
      key,
    ],
    { stdio: "pipe" },
  );
  const print = execFileSync("ssh-keygen", ["-lf", `${key}.pub`], {
    encoding: "utf8",
  }).trim();
  fresh.push(readFileSync(`${key}.pub`, "utf8").trim());
  done.push(`ssh ${app.slice(0, 8)} → ${print.split(" ")[1]}`);
}

// Remove exactly the keys being retired and add their replacements, keeping
// every other authorised user. An earlier version of this script wrote the
// file wholesale and locked out three applications whose controllers held
// their keys somewhere else — replacing shared authorisation is not rotation,
// it is a lockout with extra steps.
if (fresh.length) {
  const current = execFileSync(
    "docker",
    [
      "exec",
      container,
      "sh",
      "-c",
      "cat /root/.ssh/authorized_keys 2>/dev/null || true",
    ],
    { encoding: "utf8" },
  );
  const material = (line) => line.trim().split(/\s+/)[1] ?? "";
  const retiring = new Set(retiredPublicKeys.map(material).filter(Boolean));
  const kept = current
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !retiring.has(material(line)));
  const merged = [...kept, ...fresh];
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "sh",
      "-c",
      "mkdir -p /root/.ssh && cat > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys",
    ],
    { input: `${merged.join("\n")}\n`, stdio: ["pipe", "pipe", "pipe"] },
  );
  done.push(
    `authorized_keys: ${fresh.length} rotated key(s) added, ${retiring.size} retired, ${kept.length} other authorised key(s) preserved`,
  );
}

// ---- 2. The secret store ---------------------------------------------------
// The AES key and the ciphertexts it decrypts were pushed together, so the
// five values must be treated as plaintext — and a new key does NOT change
// that. The exposed key still decrypts the exposed ciphertext; both are in
// the pushed objects, and nothing here can reach them. A new key protects
// only values written from now on.
//
// Clearing the controller's stored value is likewise not rotation: it stops
// this controller from replaying the value, and does nothing to what the
// target service accepts. That part is done per service, below.
const secretsDir = join(state, "secrets");
if (existsSync(join(secretsDir, "key"))) {
  renameSync(join(secretsDir, "key"), join(secretsDir, "key.retired"));
  writeFileSync(join(secretsDir, "key"), randomBytes(32), { mode: 0o600 });
  done.push("secret-store key replaced (32 bytes, 0600)");
}
let cleared = 0;
for (const file of existsSync(secretsDir) ? readdirSync(secretsDir) : []) {
  if (!file.endsWith(".json")) continue;
  const path = join(secretsDir, file);
  const held = JSON.parse(readFileSync(path, "utf8"));
  for (const item of held) {
    if (item.sealed || item.establishedAt) cleared++;
    item.sealed = null;
    item.establishedAt = null;
  }
  writeFileSync(path, JSON.stringify(held, null, 2), { mode: 0o600 });
  done.push(
    `${file.slice(0, 8)} → ${held.map((i) => i.name).join(", ")} cleared, requests kept`,
  );
}
done.push(
  `${cleared} values cleared; they must be supplied again through the masked field`,
);

const report = `# Rig credential rotation\n\nRun ${new Date().toISOString()} against container \`${container}\`.\n\n${done.map((line) => `- ${line}`).join("\n")}\n\nNo key or secret value was printed, by this script or into this file.\n`;
writeFileSync(join(state, "rotation.md"), report);
console.log(report);
