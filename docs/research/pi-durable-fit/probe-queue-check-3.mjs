// Skeptic check 3: the queue stranded by a failed run. Does anything other than
// a new user message drain it (time, resume(), a restart, a passive write)?
// What do whenBusy:"reject" and conversation.abort() do to an idle conversation
// that still has queued items?
import { defineEntry } from "@earendil-works/pi-durable";
import {
  checkPath,
  context,
  FAUX_MODEL,
  fauxAssistantMessage,
  gate,
  InboxDoc,
  LiveDoc,
  open,
  openNodeSqliteStorage,
  recording,
  show,
  sleep,
  transcript,
  until,
} from "./probe-queue-check-lib.mjs";

const failing = (hold) => async (transcriptContext, options) => {
  await hold.step(transcriptContext, options);
  return fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage: "boom (scripted)",
  });
};

/** Leave a conversation idle with two queued follow-ups behind a failed run. */
async function strand(storage, responsesAfter = []) {
  const hold = gate("unused");
  const opened = await open(storage, [failing(hold), ...responsesAfter], {
    retry: { enabled: false },
  });
  const root = await opened.harness.root(context, {
    agent: { model: FAUX_MODEL },
  });
  const first = await root.submit(
    { type: "input", content: "first (will fail)", requestId: "s-first" },
    context,
  );
  await until(() => hold.seen.length === 1, "model call");
  const q1 = await root.submit(
    { type: "input", content: "queued-1", requestId: "s-q1" },
    context,
  );
  const q2 = await root.submit(
    { type: "input", content: "queued-2", requestId: "s-q2" },
    context,
  );
  hold.release();
  const failed = await first.wait(context);
  await opened.harness.waitForIdle(context);
  return { ...opened, root, q1, q2, failed };
}
const inboxIds = async (harness, root) =>
  (await harness.snapshot(InboxDoc, root.id, context)).items.map(
    (item) => `${item.id}:${item.mode}`,
  );

console.log("== A. time, resume() and a restart do not drain a stranded queue");
{
  const path = await checkPath("strand.sqlite");
  let { harness, faux, root, failed } = await strand(
    await openNodeSqliteStorage(path),
  );
  show("failed run", `${failed.status}/${failed.reason}`);
  show("inbox right after the failure", await inboxIds(harness, root));
  await sleep(400);
  harness.resume();
  await harness.waitForIdle(context);
  show(
    "inbox 400 ms later, after resume() + waitForIdle()",
    await inboxIds(harness, root),
  );
  show("model calls", faux.state.callCount);
  await harness.close(context);
  const seen = [];
  ({ harness, faux } = await open(
    await openNodeSqliteStorage(path),
    [recording("r1", seen), recording("r2", seen)],
    {
      retry: { enabled: false },
    },
  ));
  root = await harness.root(context);
  harness.resume();
  await harness.waitForIdle(context);
  await sleep(300);
  show(
    "inbox after close + reopen + resume() + 300 ms",
    await inboxIds(harness, root),
  );
  show(
    "inspect().submissions",
    (await harness.inspect(context)).submissions.map(
      (s) => `${s.id} ${s.requestId} ${s.status}`,
    ),
  );
  show(
    "live.run",
    String((await harness.snapshot(LiveDoc, root.id, context))?.run),
  );
  show("model calls after reopen", faux.state.callCount);
  // wait() on a stranded submission "asks for progress" - does it get any?
  const q1 = await harness.submission(
    (
      await root.commit(
        (tx) => tx.submissionByRequest(root.id, "s-q1"),
        context,
      )
    ).id,
    context,
  );
  const waited = await Promise.race([
    q1.wait(context),
    sleep(500).then(() => "STILL queued after wait() for 500 ms"),
  ]);
  show("wait() on the stranded follow-up", waited);
  await harness.close(context).catch((error) => show("close", String(error)));
}

console.log(
  "\n== B. a passive write submission kicks the stranded queue (without a new user message)",
);
{
  const Kick = defineEntry("hallvi.kick");
  const seen = [];
  const { harness, faux, root, q1, q2 } = await strand(
    new (await import("./probe-queue-check-lib.mjs")).MemoryStorage(),
    [recording("k1", seen), recording("k2", seen)],
  );
  show("inbox before", await inboxIds(harness, root));
  const kick = await root.submit(
    { type: "write", entry: { kind: Kick.kind, data: { why: "drain" } } },
    context,
  );
  show("write record", await kick.wait(context));
  show("q1 wait()", await q1.wait(context));
  show("q2 wait()", await q2.wait(context));
  await harness.waitForIdle(context);
  show("model calls", faux.state.callCount);
  show("user messages each later call saw", seen);
  show("transcript", await transcript(root));
  await harness.close(context);
}

console.log(
  "\n== C. whenBusy:'reject' on an idle conversation with a stranded queue: no ConversationBusy",
);
{
  const seen = [];
  const { harness, faux, root, q1, q2 } = await strand(
    new (await import("./probe-queue-check-lib.mjs")).MemoryStorage(),
    [recording("c1", seen), recording("c2", seen), recording("c3", seen)],
  );
  let onlyIfIdle;
  try {
    onlyIfIdle = await root.submit(
      { type: "input", content: "ONLY-IF-IDLE", whenBusy: "reject" },
      context,
    );
    show("threw?", "no - admitted");
  } catch (error) {
    show("threw", `${error.constructor.name}: ${error.message}`);
  }
  if (onlyIfIdle) {
    show(
      "its status right after submit",
      (await onlyIfIdle.status(context)).status,
    );
    show("inbox right after", await inboxIds(harness, root));
    show("only-if-idle wait()", await onlyIfIdle.wait(context));
    show("q1 / q2", [
      (await q1.wait(context)).answer,
      (await q2.wait(context)).answer,
    ]);
    await harness.waitForIdle(context);
    show(
      "order the model saw new user messages (last message of each call)",
      seen.map((messages) => messages.at(-1)),
    );
    show("model calls", faux.state.callCount);
  }
  await harness.close(context);
}

console.log(
  "\n== D. conversation.abort() on an idle conversation clears the stranded queue",
);
{
  const { harness, root, q1, q2 } = await strand(
    new (await import("./probe-queue-check-lib.mjs")).MemoryStorage(),
    [],
  );
  show("inbox before", await inboxIds(harness, root));
  await root.abort(context);
  show("inbox after abort()", await inboxIds(harness, root));
  show(
    "q1 / q2",
    [await q1.status(context), await q2.status(context)].map(
      (r) => `${r.status}/${r.reason}`,
    ),
  );
  await harness.close(context);
}

console.log(
  "\n== E. the same stranding after an ABORTED run? (conversation.abort() sweeps, so only writes remain)",
);
{
  const hold = gate("unused");
  const { harness, faux } = await open(
    new (await import("./probe-queue-check-lib.mjs")).MemoryStorage(),
    [hold.step],
  );
  const root = await harness.root(context, { agent: { model: FAUX_MODEL } });
  await root.submit({ type: "input", content: "running" }, context);
  await until(() => hold.seen.length === 1, "model call");
  const q = await root.submit({ type: "input", content: "queued" }, context);
  // Stop only the run's task (the "stop" button on one run), not the whole
  // conversation.
  const live = await harness.snapshot(LiveDoc, root.id, context);
  show(
    "abortTask(run task)",
    await harness.abortTask(live.run.taskId, context),
  );
  await harness.waitForIdle(context);
  show("queued follow-up after abortTask()", (await q.status(context)).status);
  show("inbox", await inboxIds(harness, root));
  show("model calls", faux.state.callCount);
  await harness.close(context);
}
