// PROTOTYPE — seeds a running QA fixture with the applications the shell
// prototype is judged on. Everything goes through the real HTTP routes; only
// the fixture's Pi replies, GitHub and runner are synthetic.
//
//   node tests/browser/qa-fixture.mjs 3210 success ready
//   node src/components/server-guy/prototype/seed-fixture.mjs 3210 <state dir>
//
// The state dir is `state` in the manifest line the fixture prints.
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const port = Number(process.argv[2] ?? 3210);
const STATE = process.argv[3];
if (!STATE) throw new Error("Pass the fixture's state directory.");
const BASE = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function json(path, init) {
  const response = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
async function poll(fn, label, timeout = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await sleep(1500);
  }
  throw new Error(`timeout waiting for ${label}`);
}
const view = (id, chat) =>
  json(`/api/applications/${id}${chat ? `?chat=${chat}` : ""}`);
const post = (path, body = {}) =>
  json(path, { method: "POST", body: JSON.stringify(body) });
const send = (id, chat, message) =>
  post(`/api/applications/${id}/chats/${chat}/messages`, {
    message,
    requestKey: randomUUID(),
  });
const settled = (current) =>
  !current.messages.some(
    (message) => message.status === "queued" || message.status === "running",
  );

async function toPhaseTwo(name, approvalMode) {
  const created = await post("/api/applications", {
    repositoryUrl: `https://github.com/qa/${name}`,
    approvalMode,
  });
  const id = created.application.id;
  await poll(
    async () => (await view(id)).workspace.status === "ready",
    `${name} phase 1`,
  );
  const two = await post(`/api/applications/${id}/phases/inspect-app`);
  await poll(async () => {
    const current = await view(id, two.selectedChatId);
    return current.contract && settled(current) ? current : null;
  }, `${name} contract`);
  return { id, chat: two.selectedChatId };
}
async function toPhaseThree(name, approvalMode) {
  const two = await toPhaseTwo(name, approvalMode);
  const three = await post(
    `/api/applications/${two.id}/phases/make-launch-ready`,
  );
  return { id: two.id, phaseTwoChat: two.chat, chat: three.selectedChatId };
}
async function continueWithServerGuy(app, name) {
  await post(`/api/applications/${app.id}/conformance/continue`);
  await poll(async () => {
    const current = await view(app.id, app.chat);
    return settled(current) && current.conformance?.proposal ? current : null;
  }, `${name} proposal`);
}

writeFileSync(
  `${STATE}/conformance-scenario.json`,
  JSON.stringify({ docker: "ready" }),
);
writeFileSync(`${STATE}/github-scenario.json`, "{}");
const seeded = {};

// Phase 2 with a v1 → v2 revision (a source-only change on health.path).
{
  const app = await toPhaseTwo("fastapi-app", "pi-decides");
  await send(app.id, app.chat, "contract: correct /health");
  await poll(async () => {
    const current = await view(app.id, app.chat);
    return current.contract?.version === 2 && settled(current) ? current : null;
  }, "fastapi-app v2");
  seeded.phaseTwo = app;
}
// Phase 3: staged change and proposed behavior checks, waiting on you.
{
  const app = await toPhaseThree("fastapi-p3-nohealth", "always-ask");
  await continueWithServerGuy(app, "fastapi-p3-nohealth");
  seeded.phaseThreeProposed = app;
}
// Phase 3: the first proposal replaced by a second one.
{
  const name = "fastapi-nohealth-replaced";
  const app = await toPhaseThree(name, "always-ask");
  await continueWithServerGuy(app, name);
  const first = (await view(app.id, app.chat)).conformance.proposal.id;
  await send(app.id, app.chat, "conformance: propose-only");
  await poll(async () => {
    const current = await view(app.id, app.chat);
    return settled(current) && current.conformance?.proposal?.id !== first
      ? current
      : null;
  }, `${name} second proposal`);
  seeded.phaseThreeReplaced = app;
}
// Phase 3 taken all the way: accepted, approved, granted, published, merged
// (scripted), verified.
{
  const name = "fastapi-nohealth-done";
  const app = await toPhaseThree(name, "always-ask");
  await continueWithServerGuy(app, name);
  const root = `/api/applications/${app.id}/conformance`;
  let current = await view(app.id, app.chat);
  await post(
    `${root}/acceptance/${current.conformance.proposedAcceptance.id}/accept`,
  );
  await post(`${root}/proposals/${current.conformance.proposal.id}/approve`);
  await post(`${root}/grant`);
  await post(`${root}/proposals/${current.conformance.proposal.id}/publish`);
  writeFileSync(
    `${STATE}/github-scenario.json`,
    JSON.stringify({ mergePull: 1, mergeMethod: "squash" }),
  );
  await post(`${root}/refresh`);
  current = await view(app.id, app.chat);
  if (!current.conformance.proposal.candidate)
    throw new Error(`${name}: no candidate after refresh`);
  await post(`${root}/verify`);
  await poll(async () => {
    const latest = await view(app.id, app.chat);
    const run = latest.conformance.latestCandidateRun;
    return run && run.status !== "queued" && run.status !== "running"
      ? latest
      : null;
  }, `${name} verify`);
  seeded.phaseThreeDone = app;
}

for (const [key, app] of Object.entries(seeded))
  console.log(`${key}: ${BASE}/applications/${app.id}?variant=C`);
