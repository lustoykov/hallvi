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
import { readdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
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
for (const app of existsSync(operatorDir) ? readdirSync(operatorDir) : []) {
  const dir = join(operatorDir, app, "ssh");
  const key = join(dir, "id_ed25519");
  if (!existsSync(key)) continue;
  renameSync(key, `${key}.retired`);
  renameSync(`${key}.pub`, `${key}.pub.retired`);
  execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", `server-guy-${app.slice(0, 8)}-rotated`, "-f", key], { stdio: "pipe" });
  const print = execFileSync("ssh-keygen", ["-lf", `${key}.pub`], { encoding: "utf8" }).trim();
  fresh.push(readFileSync(`${key}.pub`, "utf8").trim());
  done.push(`ssh ${app.slice(0, 8)} → ${print.split(" ")[1]}`);
}

// Replace authorized_keys wholesale: the old public keys go, so a retired
// private key opens nothing even if the file it was in is read later.
if (fresh.length) {
  execFileSync("docker", ["exec", "-i", container, "sh", "-c",
    "mkdir -p /root/.ssh && cat > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys"],
    { input: `${fresh.join("\n")}\n`, stdio: ["pipe", "pipe", "pipe"] });
  done.push(`authorized_keys replaced with ${fresh.length} rotated keys`);
}

// ---- 2. The secret store ---------------------------------------------------
// The AES key and the ciphertexts it decrypts were pushed together, so the
// five values must be treated as plaintext. A new key makes the exposed
// ciphertexts undecryptable; the requests stay so Pi can ask again, with the
// values cleared rather than carried across.
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
  done.push(`${file.slice(0, 8)} → ${held.map((i) => i.name).join(", ")} cleared, requests kept`);
}
done.push(`${cleared} values cleared; they must be supplied again through the masked field`);

const report = `# Rig credential rotation\n\nRun ${new Date().toISOString()} against container \`${container}\`.\n\n${done.map((line) => `- ${line}`).join("\n")}\n\nNo key or secret value was printed, by this script or into this file.\n`;
writeFileSync(join(state, "rotation.md"), report);
console.log(report);
