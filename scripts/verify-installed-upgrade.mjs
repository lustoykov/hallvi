// One release-runner journey: records written through the published baseline's
// APIs must survive replacement of its running service by the archive
// installer.
// Empty chat records require no model account or provider work.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareVersions } from "./release-source.mjs";
import { currentPlatform } from "./release-trust.mjs";

const settings = { permissionMode: "always-ask", host: null };
const applicationRecord = ({ id, name, repositoryUrl, createdAt }) => ({
  id,
  name,
  repositoryUrl,
  createdAt,
});
const chatRecord = ({ id, title, kind, createdAt, archivedAt }) => ({
  id,
  title,
  kind,
  createdAt,
  archivedAt,
});

export async function verifyInstalledUpgrade({
  phase,
  controller,
  manifest,
  pid,
  before,
}) {
  assert.ok(["seed", "verify"].includes(phase), "Use seed or verify.");
  const address = new URL(controller);
  assert.ok(
    address.protocol === "http:" && address.hostname === "127.0.0.1",
    "The installed controller must use its loopback address.",
  );
  assert.ok(Number.isInteger(pid) && pid > 0, "The service must be running.");
  const api = async (path, body) => {
    const response = await fetch(new URL(path, controller), {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Origin: address.origin },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    assert.ok(response.ok, `${path} returned HTTP ${response.status}.`);
    return response.json();
  };
  const release = await api("/api/hallvi/update");
  assert.deepEqual(
    release.installed,
    {
      kind: "installed",
      version: manifest.version,
      revision: manifest.revision,
      platform: currentPlatform(),
    },
    "The serving installation must match the verified release.",
  );

  if (phase === "seed") {
    const marker = randomUUID().slice(0, 8);
    const created = await api("/api/applications", {
      requestKey: randomUUID(),
      name: `Release upgrade ${marker}`,
      repositoryUrl: `https://github.com/qa/release-upgrade-${marker}`,
    });
    assert.ok(
      created.selectedChatId,
      "Application creation needs a main chat.",
    );
    const side = await api(
      `/api/applications/${created.application.id}/chats`,
      {
        title: `Before upgrade ${marker}`,
      },
    );
    assert.notEqual(side.selectedChatId, created.selectedChatId);
    await api(`/api/applications/${created.application.id}/operator`, settings);
    before = {
      controller,
      pid,
      version: manifest.version,
      application: applicationRecord(created.application),
      mainChatId: created.selectedChatId,
      sideChatId: side.selectedChatId,
      chats: side.chats
        .map(chatRecord)
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    assert.equal(before.chats.length, 2);
  } else {
    assert.equal(controller, before.controller, "The address must survive.");
    assert.ok(
      compareVersions(manifest.version, before.version) > 0,
      "The installed candidate must be newer than the baseline.",
    );
    assert.notEqual(pid, before.pid, "The native service was not replaced.");
  }

  const path = `/api/applications/${before.application.id}`;
  for (const chatId of [before.mainChatId, before.sideChatId]) {
    const view = await api(`${path}?chat=${chatId}`);
    assert.deepEqual(applicationRecord(view.application), before.application);
    assert.equal(view.selectedChatId, chatId);
    assert.deepEqual(
      view.chats.map(chatRecord).sort((a, b) => a.id.localeCompare(b.id)),
      before.chats,
    );
    assert.equal(view.worker?.alive, true, "Pi must read the retained chats.");
    assert.deepEqual(view.messages, [], "No model message was requested.");
  }
  assert.deepEqual(
    (await api(`${path}/operator?settingsOnly=1`)).settings,
    settings,
  );
  return before;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const [phase, manifestFile, recordFile] = process.argv.slice(2);
  assert.ok(
    manifestFile && recordFile,
    "Usage: verify-installed-upgrade.mjs seed|verify manifest.json records.json",
  );
  const cli = join(homedir(), ".local", "bin", "hallvi");
  const controller = execFileSync(cli, ["url"], { encoding: "utf8" }).trim();
  const printed = execFileSync(
    process.platform === "darwin" ? "launchctl" : "systemctl",
    process.platform === "darwin"
      ? ["print", `gui/${userInfo().uid}/com.hallvi`]
      : ["--user", "show", "hallvi.service", "--property=MainPID", "--value"],
    { encoding: "utf8" },
  );
  const pid = Number(
    process.platform === "darwin"
      ? /\bpid = (\d+)/.exec(printed)?.[1]
      : printed,
  );
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const result = await verifyInstalledUpgrade({
    phase,
    controller,
    manifest,
    pid,
    ...(phase === "verify"
      ? { before: JSON.parse(readFileSync(recordFile, "utf8")) }
      : {}),
  });
  if (phase === "seed")
    writeFileSync(recordFile, JSON.stringify(result, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  console.log(
    phase === "seed"
      ? `Seeded ${result.version}: application, main/side chats and Always ask.`
      : `Verified installer upgrade ${result.version} → ${manifest.version} (${manifest.revision}): service ${result.pid} → ${pid}; API records preserved.`,
  );
}
