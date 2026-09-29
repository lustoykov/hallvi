// One release-runner journey: records written through the published baseline's
// APIs must survive replacement of its running service by the archive
// installer.
// Hallvi's initial greetings require no model account or provider work.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
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
      messages: {},
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
    const onlyGreeting = "Only Hallvi's initial greeting is expected.";
    assert.equal(view.messages.length, 1, onlyGreeting);
    const { body, ...identity } = view.messages[0];
    assert.deepEqual(
      identity,
      {
        id: `greeting:${chatId}`,
        chatId,
        role: "assistant",
        source: "hallvi",
        status: "completed",
        createdAt: before.chats.find((chat) => chat.id === chatId).createdAt,
        revision: 0,
      },
      onlyGreeting,
    );
    assert.ok(typeof body === "string" && body.length > 0);
    assert.deepEqual(view.executions, [], "No execution was requested.");
    assert.deepEqual(view.piActivity, [], "No Pi activity was requested.");
    if (phase === "seed") before.messages[chatId] = view.messages;
    else
      assert.deepEqual(
        view.messages,
        before.messages[chatId],
        "The initial greeting must survive unchanged.",
      );
  }
  assert.deepEqual(
    (await api(`${path}/operator?settingsOnly=1`)).settings,
    settings,
  );
  return before;
}

export async function verifyInstalledRestart({ manifest, before, service }) {
  const controller = service.url();
  const oldPid = service.pid();
  assert.ok(Number.isInteger(oldPid) && oldPid > 0);
  const abort = new AbortController();
  const initialDeadline = setTimeout(
    () => abort.abort(new Error("No initial chat SSE snapshot in 15 seconds.")),
    15_000,
  );
  let reader;
  let draining;
  try {
    const response = await fetch(
      new URL(
        `/api/applications/${before.application.id}/chats/${before.mainChatId}/events`,
        controller,
      ),
      { signal: abort.signal, redirect: "error" },
    );
    assert.ok(response.ok);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/event-stream/,
    );
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("\n\n")) {
      const { done, value } = await reader.read();
      assert.equal(done, false, "Chat SSE ended before its first snapshot.");
      text += decoder.decode(value, { stream: true });
    }
    const frame = text.slice(0, text.indexOf("\n\n"));
    assert.ok(frame.startsWith("data: "));
    const snapshot = JSON.parse(frame.slice(6));
    assert.equal(snapshot.worker?.alive, true);
    assert.deepEqual(snapshot.messages, before.messages[before.mainChatId]);
    clearTimeout(initialDeadline);

    // No deadline may abort this reader while the restart is in progress.
    // Keep reading like an open page; native shutdown may close the stream.
    let streamClosed = false;
    draining = (async () => {
      try {
        while (!(await reader.read()).done) {
          // Consume snapshots/heartbeats without cancelling the connection.
        }
      } catch {
        // Native shutdown can reset this old connection.
      } finally {
        streamClosed = true;
      }
    })();
    await Promise.resolve();
    assert.equal(streamClosed, false, "Chat SSE must be open before restart.");
    console.log("Initial chat SSE read; restarting with its reader open.");
    const startedAt = Date.now();
    await service.restart();
    const elapsedMs = Date.now() - startedAt;
    const pid = service.pid();
    assert.notEqual(pid, oldPid, "Restart must replace the native service.");
    assert.equal(
      service.alive(oldPid),
      false,
      "The old service PID must exit.",
    );
    await verifyInstalledUpgrade({
      phase: "verify",
      controller: service.url(),
      manifest,
      pid,
      before,
    });
    assert.equal(
      streamClosed,
      true,
      "The old web SSE connection must end during native restart.",
    );
    return { oldPid, pid, elapsedMs };
  } finally {
    // Observe restart completion/failure before releasing our SSE reader.
    clearTimeout(initialDeadline);
    abort.abort();
    await reader?.cancel().catch(() => {});
    await draining;
  }
}

function nativeServicePid() {
  const printed = execFileSync(
    process.platform === "darwin" ? "launchctl" : "systemctl",
    process.platform === "darwin"
      ? ["print", `gui/${userInfo().uid}/com.hallvi`]
      : ["--user", "show", "hallvi.service", "--property=MainPID", "--value"],
    { encoding: "utf8" },
  );
  return Number(
    process.platform === "darwin"
      ? /\bpid = (\d+)/.exec(printed)?.[1]
      : printed,
  );
}

function restartInstalled(cli) {
  return new Promise((done, fail) => {
    const child = spawn(cli, ["restart"], { stdio: "inherit" });
    const deadline = setTimeout(() => {
      child.kill("SIGTERM");
      fail(
        new Error(
          "Installed hallvi restart exceeded 60 seconds with SSE open.",
        ),
      );
    }, 60_000);
    child.once("error", (error) => {
      clearTimeout(deadline);
      fail(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(deadline);
      if (code === 0) done();
      else
        fail(new Error(`Installed hallvi restart failed: ${code ?? signal}.`));
    });
  });
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const [phase, manifestFile, recordFile] = process.argv.slice(2);
  assert.ok(
    manifestFile && recordFile,
    "Usage: verify-installed-upgrade.mjs seed|verify|restart manifest.json records.json",
  );
  const cli = join(homedir(), ".local", "bin", "hallvi");
  const service = {
    url: () => execFileSync(cli, ["url"], { encoding: "utf8" }).trim(),
    pid: nativeServicePid,
    restart: () => restartInstalled(cli),
    alive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if (error.code === "ESRCH") return false;
        throw error;
      }
    },
  };
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const before =
    phase === "seed" ? undefined : JSON.parse(readFileSync(recordFile, "utf8"));
  if (phase === "restart") {
    const result = await verifyInstalledRestart({ manifest, before, service });
    console.log(
      `Verified native restart with SSE open in ${result.elapsedMs} ms: service ${result.oldPid} → ${result.pid}; API records preserved.`,
    );
  } else {
    const pid = service.pid();
    const result = await verifyInstalledUpgrade({
      phase,
      controller: service.url(),
      manifest,
      pid,
      before,
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
}
