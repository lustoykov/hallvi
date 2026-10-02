// Q1: after reopening a storage whose process was SIGKILLed mid-tool-call,
// which calls start the scheduler?
// One crashed database (A interrupted mid-call of a non-replay-safe tool, B
// idle) is copied once per call under test.
// Per call: inspect().scheduling before and after, and whether anything
// actually ran (transcript grew, a request reached the model, a tool executed).
import { join } from "node:path";
import { defineExtension, watchEvents } from "@earendil-works/pi-durable";
import {
  context,
  copyDb,
  crash,
  freshDir,
  look,
  makeHost,
  sleep,
  timeout,
} from "./probe-restart-lib.mjs";

const dir = freshDir("q1");
const master = join(dir, "master.sqlite");
const crashed = await crash(dir, master, "A=tool:slow_unsafe,B=idle");
console.log(
  `crasher pid ${crashed.pid} killed: ${JSON.stringify(crashed.exit)}`,
);
const A = crashed.conversations.A;
const B = crashed.conversations.B;
const runTask = A.liveWhileRunning.live.run.taskId;
console.log(
  `A: conversation ${A.id}, submission ${A.submission}, run task ${runTask}; B: conversation ${B.id}`,
);

const ignore = (promise) =>
  promise.catch((error) => `rejected: ${error?.name ?? error}`);
const calls = {
  "Harness.open() only": async () => {},
  "harness.root()": async (h) => void (await h.root(context)),
  "harness.conversation(id)": async (h) =>
    void (await h.conversation(A.id, context)),
  "harness.inspect()": async (h) => void (await h.inspect(context)),
  "harness.getTask(id)": async (h) => void (await h.getTask(runTask, context)),
  "harness.taskGraph()": async (h) => (await h.taskGraph(context)).dispose(),
  "harness.usage()": async (h) => void (await h.usage(context)),
  "conversation.viewState()": async (h, a) =>
    (await a.viewState(context)).dispose(),
  "conversation.watch()+start": async (h, a) => {
    const watch = await a.watch(context);
    watch.start(async () => {});
  },
  "watchEvents()+start": async (h, a) => {
    const stream = await watchEvents(h, a.id, context);
    stream.start(async () => {});
  },
  "conversation.context()/entries()/agent()": async (h, a) => {
    await a.context(context);
    await a.entries({}, 10, undefined, context);
    await a.agent(context);
  },
  "harness.submission(id) + status()": async (h) =>
    void (await (await h.submission(A.submission, context)).status(context)),
  "conversation.configure()": async (h, a) =>
    a.configure({ instructions: "x" }, context),
  "conversation.commit(noop)": async (h, a) =>
    a.commit(() => undefined, context),
  "harness.createConversation()": async (h) =>
    void (await h.createConversation(
      { ownership: { kind: "ownerless" } },
      context,
    )),
  "harness.abortTask(runTask)": async (h) =>
    void (await h.abortTask(runTask, context)),
  "harness.abortSubmission(id)": async (h) =>
    void (await h.abortSubmission(A.submission, context)),
  "submission.abort()": async (h) =>
    void (await (await h.submission(A.submission, context)).abort(context)),
  "registry.install(new extension)": async (h, a, b, host) =>
    host.registry.install(defineExtension({ name: "late" })),
  "harness.resume()": async (h) => h.resume(),
  "submission.wait()": async (h) =>
    void ignore((await h.submission(A.submission, context)).wait(timeout(300))),
  "conversation.submit() to A itself": async (h, a) =>
    void (await a.submit({ type: "input", content: "more" }, context)),
  "conversation.submit() to B (other)": async (h, a, b) =>
    void (await b.submit({ type: "input", content: "hi B" }, context)),
  "conversation.reset()": async (h, a) => a.reset(undefined, context),
  "conversation.compact()": async (h, a) =>
    void (await a.compact(undefined, context)),
  "conversation.abort() on A": async (h, a) => a.abort(context),
  "conversation.abort() on B (other)": async (h, a, b) => b.abort(context),
  "conversation.waitForIdle() on B": async (h, a, b) =>
    void ignore(b.waitForIdle(timeout(300))),
  "harness.waitForIdle()": async (h) =>
    void ignore(h.waitForIdle(timeout(300))),
  "harness.waitForTask(runTask)": async (h) =>
    void ignore(h.waitForTask(runTask, timeout(300))),
};

const rows = [];
let n = 0;
for (const [name, call] of Object.entries(calls)) {
  const file = join(dir, `copy-${n++}.sqlite`);
  copyDb(master, file);
  const host = makeHost(dir, { holdMs: 0 });
  const effectsBefore = host.effects().length;
  const modelBefore = host.modelCalls().length;
  const harness = await host.open(file);
  await sleep(50);
  const before = (await harness.inspect(context)).scheduling;
  const a = await harness.conversation(A.id, context);
  const b = await harness.conversation(B.id, context);
  const entriesBefore = (await look(harness, a)).entries;
  let error = "";
  try {
    await call(harness, a, b, host);
  } catch (thrown) {
    error = ` threw ${thrown?.message ?? thrown}`;
  }
  await sleep(400);
  const after = await look(harness, a);
  rows.push({
    call: name + error,
    before,
    after: after.scheduling,
    "A entries": `${entriesBefore}->${after.entries}`,
    "model requests": host.modelCalls().length - modelBefore,
    "tool executions": host.effects().length - effectsBefore,
    "A run still open": after.live?.run !== undefined,
  });
  await harness.close(context);
}
console.table(rows);
console.log(
  "starts scheduler:",
  rows.filter((row) => row.after === "running").map((row) => row.call),
);
console.log(
  "does NOT start scheduler:",
  rows.filter((row) => row.after === "paused").map((row) => row.call),
);
