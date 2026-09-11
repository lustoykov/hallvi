import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as database from "../../../src/server/db";
import * as runs from "../../../src/server/pi-runs";
import { acquireWorkerLock } from "../../../src/server/pi-worker";
import { openNativeChatSession } from "../../../src/server/pi-sessions";
import { pushTestDatabase } from "../../test-database";

// These are disposable-process fixtures, never production hooks. The provider
// pauses only after the actual SDK has executed propose_decision and supplied
// its pending tool result. The runner pauses around the real final transaction.
const providerFixture = `
import { createAssistantMessageEventStream, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
export * from './pi-configuration-real';
globalThis.fetch = async () => { throw new Error('Network forbidden in crash fixture'); };
const text = message => typeof message.content === 'string' ? message.content : message.content.filter(part => part.type === 'text').map(part => part.text).join('');
function streamSynthetic(model, context) {
  const stream = createAssistantMessageEventStream();
  const userIndex = context.messages.findLastIndex(message => message.role === 'user');
  const user = text(context.messages[userIndex]);
  const results = context.messages.slice(userIndex + 1).filter(message => message.role === 'toolResult');
  const old = context.messages.slice(0, userIndex);
  const runContext = old.filter(message => message.role === 'user').map(message => {
    try { return JSON.parse(text(message)); } catch { return null; }
  }).findLast(value => value?.runId);
  const message = {role:'assistant',api:model.api,provider:model.provider,model:model.id,timestamp:Date.now(),content:[],stopReason:'stop',
    usage:{input:10,output:1,cacheRead:0,cacheWrite:0,totalTokens:11,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
  let tool;
  if (user.startsWith('priority: ') && !results.length) tool = {type:'toolCall',id:randomUUID(),name:'propose_decision',arguments:{kind:'launch-priority',value:user.slice(10)}};
  if (user === 'inspect-history' && !results.length) tool = {type:'toolCall',id:randomUUID(),name:'search_decisions',arguments:{}};
  stream.push({type:'start',partial:message});
  if (tool) {
    message.content = [tool]; message.stopReason = 'toolUse';
    stream.push({type:'toolcall_start',contentIndex:0,partial:message});
    stream.push({type:'toolcall_end',contentIndex:0,toolCall:tool,partial:message});
    stream.push({type:'done',reason:'toolUse',message});
    return stream;
  }
  if (process.env.CRASH_FIXTURE_STAGE === 'proposal' && user.startsWith('priority: ')) {
    const pending = results.find(result => result.toolName === 'propose_decision');
    if (!pending || pending.isError || JSON.parse(text(pending)).status !== 'pending, not saved') throw new Error('Proposal was not staged by the real tool');
    process.send?.({type:'proposal-staged'});
    return stream;
  }
  const current = results.findLast(result => result.toolName === 'search_decisions');
  const answer = user === 'inspect-history' ? JSON.stringify({
    previousStatus:runContext?.previousAttempt?.status,
    previousOutcome:runContext?.previousAttempt?.savedOutcome,
    pendingHistory:old.some(message => message.role === 'toolResult' && message.toolName === 'propose_decision' && text(message).includes('pending, not saved')),
    finalHistory:old.some(message => message.role === 'assistant' && text(message) === 'Synthetic final answer after the staged proposal.'),
    savedCount:current ? JSON.parse(text(current)).activeCount : null,
  }) : 'Synthetic final answer after the staged proposal.';
  message.content = [{type:'text',text:answer}];
  stream.push({type:'text_start',contentIndex:0,partial:message});
  stream.push({type:'text_delta',contentIndex:0,delta:answer,partial:message});
  stream.push({type:'text_end',contentIndex:0,content:answer,partial:message});
  stream.push({type:'done',reason:'stop',message});
  return stream;
}
export async function configuredPiRuntime(sdk) {
  const root = process.env.CRASH_FIXTURE_ROOT;
  if (!root) throw new Error('Missing disposable crash-fixture root');
  const modelRuntime = await sdk.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,modelsStorePath:join(root,'models.json'),refreshOnCreate:false,allowModelNetwork:false});
  modelRuntime.registerProvider('server-guy-crash-fixture',{api:'server-guy-crash-fixture',apiKey:'SYNTHETIC-NO-NETWORK',baseUrl:'https://invalid.test',streamSimple:streamSynthetic,
    models:[{id:'synthetic',name:'Synthetic',reasoning:false,input:['text'],contextWindow:200000,maxTokens:2048,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]});
  return {configuration:{reasoningEffort:'off'},modelRuntime,model:modelRuntime.getModel('server-guy-crash-fixture','synthetic')};
}
`;

const runnerFixture = `
import { askPi } from './src/server/pi.ts';
import { acquireWorkerLock } from './src/server/pi-worker.ts';
import { claimNextPiRun, completePiRun, recordPiCall } from './src/server/pi-runs.ts';
import { buildPiRunContext } from './src/server/pi-run-context.ts';
import { loadChat } from './src/server/applications.ts';
import { listMessages } from './src/server/db.ts';
// Keep the acquired handle explicitly reachable throughout every pause.
globalThis.crashFixtureWorkerRelease = acquireWorkerLock();
setInterval(() => {}, 1000);
const run = claimNextPiRun();
if (!run) throw new Error('Expected queued fixture Run');
loadChat(run.applicationId, run.chatId);
const user = listMessages(run.chatId).find(message => message.id === run.userMessageId);
const reply = await askPi({run,userMessage:user.body,runContext:buildPiRunContext(run)},{onModelCall:()=>recordPiCall(run.id)});
if (process.env.CRASH_FIXTURE_STAGE === 'native-final') {
  process.send?.({type:'native-final'});
  await new Promise(() => {});
}
completePiRun(run.id, reply);
process.send?.({type:'sqlite-success'});
await new Promise(() => {});
`;

let root: string;
let copy: string;
let applicationId: string;
let chatId: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "server-guy-crash-boundaries-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(database.databasePath());
  copy = join(root, "app");
  mkdirSync(copy);
  cpSync("src", join(copy, "src"), { recursive: true });
  cpSync(
    join(copy, "src/server/pi-configuration.ts"),
    join(copy, "src/server/pi-configuration-real.ts"),
  );
  writeFileSync(join(copy, "src/server/pi-configuration.ts"), providerFixture);
  writeFileSync(join(copy, "crash-runner.mjs"), runnerFixture);
  symlinkSync(
    join(process.cwd(), "node_modules"),
    join(copy, "node_modules"),
    "dir",
  );
});
beforeEach(() => {
  database.db().$client.exec("DELETE FROM applications");
  const application = database.insertApplication({
    name: "Crash boundary",
    repositoryUrl: "https://github.com/qa/crash",
    repositoryOwner: "qa",
    repositoryName: "crash",
  });
  applicationId = application.id;
  chatId = database.insertChat(applicationId, "Main").id;
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function start(
  stage: "proposal" | "native-final" | "sqlite-success" | "restart",
) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      stage === "restart" ? "src/worker.ts" : "crash-runner.mjs",
    ],
    {
      cwd: copy,
      env: {
        ...process.env,
        CRASH_FIXTURE_ROOT: root,
        CRASH_FIXTURE_STAGE: stage,
        PI_CODING_AGENT_DIR: join(root, "pi"),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let output = "";
  const events: string[] = [];
  child.stdout!.on("data", (data) => {
    output += data;
  });
  child.stderr!.on("data", (data) => {
    output += data;
  });
  child.on("message", (message) => {
    if (message && typeof message === "object" && "type" in message)
      events.push(String(message.type));
  });
  return { child, events, output: () => output };
}
async function stop(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = once(child, "close");
    child.kill("SIGKILL");
    await closed;
  }
}
function nativeText() {
  return readFileSync(
    join(root, "pi-sessions", applicationId, `${chatId}.jsonl`),
    "utf8",
  );
}

it.each(["proposal", "native-final", "sqlite-success"] as const)(
  "recovers truthfully after a real process crash at %s without replaying staged or saved Decisions",
  async (stage) => {
    const accepted = runs.sendChatMessage(
      applicationId,
      chatId,
      `priority: Retain evidence at ${stage}`,
      randomUUID(),
    );
    const initial = start(stage);
    let restarted: ReturnType<typeof start> | undefined;
    try {
      const barrier = stage === "proposal" ? "proposal-staged" : stage;
      await vi.waitFor(
        () => {
          expect(initial.output()).not.toContain("Error:");
          expect(initial.events).toContain(barrier);
        },
        { timeout: 12_000 },
      );
      expect(() => acquireWorkerLock()).toThrow("already running");
      if (stage === "proposal") {
        await expect(
          openNativeChatSession(applicationId, chatId),
        ).rejects.toMatchObject({ code: "busy" });
      } else {
        // askPi has settled and disposed before the final commit barrier.
        // Native writes have stopped; the worker execution slot remains held.
        const settled = await openNativeChatSession(applicationId, chatId);
        settled.release();
      }
      const before = nativeText();
      const sessionId = JSON.parse(before.split("\n")[0]).id;
      expect(before).toContain("pending, not saved");
      expect(
        before.includes("Synthetic final answer after the staged proposal."),
      ).toBe(stage !== "proposal");
      const success = stage === "sqlite-success";
      expect(runs.getPiRun(accepted.run.id)).toMatchObject({
        status: success ? "succeeded" : "running",
        piCalls: 2,
      });
      expect(database.listActiveDecisions(applicationId)).toHaveLength(
        success ? 1 : 0,
      );
      expect(
        database
          .listActivity(applicationId)
          .filter((event) => event.kind === "decision-recorded"),
      ).toHaveLength(success ? 1 : 0);
      expect(database.listMessages(chatId).at(-1)).toMatchObject({
        status: success ? "completed" : "running",
        body: success
          ? "Synthetic final answer after the staged proposal."
          : "",
      });
      const decisionsBefore = database.listActiveDecisions(applicationId);
      const activityBefore = database.listActivity(applicationId);
      await stop(initial.child);
      const release = acquireWorkerLock();
      release();
      const reopened = await openNativeChatSession(applicationId, chatId);
      expect(reopened.sessionManager.getSessionId()).toBe(sessionId);
      reopened.release();
      restarted = start("restart");
      await vi.waitFor(
        () => expect(restarted!.output()).toContain("Pi worker ready"),
        { timeout: 10_000 },
      );
      expect(runs.getPiRun(accepted.run.id)).toMatchObject({
        status: success ? "succeeded" : "interrupted",
        piCalls: 2,
      });
      expect(database.listActiveDecisions(applicationId)).toEqual(
        decisionsBefore,
      );
      // Startup preserves domain Activity and saved native conversation.
      expect(database.listActivity(applicationId)).toEqual(activityBefore);
      expect(runs.chatRunSnapshot(applicationId, chatId)).not.toHaveProperty(
        "executions",
      );
      expect(nativeText()).toBe(before);
      const next = runs.sendChatMessage(
        applicationId,
        chatId,
        "inspect-history",
        randomUUID(),
      );
      await vi.waitFor(
        () => expect(runs.getPiRun(next.run.id)?.status).toBe("succeeded"),
        { timeout: 10_000 },
      );
      const reply = JSON.parse(database.listMessages(chatId).at(-1)!.body);
      expect(reply).toMatchObject({
        previousStatus: success ? "succeeded" : "interrupted",
        pendingHistory: true,
        finalHistory: stage !== "proposal",
        savedCount: success ? 1 : 0,
      });
      expect(reply.previousOutcome).toContain(
        success ? "were committed" : "none were committed",
      );
      expect(database.listActiveDecisions(applicationId)).toEqual(
        decisionsBefore,
      );
      expect(
        database
          .listMessages(chatId)
          .filter(
            (message) =>
              message.body === `priority: Retain evidence at ${stage}`,
          ),
      ).toHaveLength(1);
      const entries = nativeText()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const proposalCalls = entries.flatMap((entry) =>
        entry.type === "message" && entry.message.role === "assistant"
          ? entry.message.content.filter(
              (part: { type: string; name?: string }) =>
                part.type === "toolCall" && part.name === "propose_decision",
            )
          : [],
      );
      expect(proposalCalls).toHaveLength(1);
      expect(JSON.parse(nativeText().split("\n")[0]).id).toBe(sessionId);
      expect(existsSync(join(root, "config", "pi-settings.json"))).toBe(false);
    } finally {
      await stop(initial.child);
      if (restarted) await stop(restarted.child);
    }
  },
  35_000,
);
