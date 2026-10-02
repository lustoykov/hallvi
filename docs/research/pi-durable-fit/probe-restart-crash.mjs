// Child process that gets killed (SIGKILL) mid-run by the probes. Not meant to
// be run by hand, but it can be:
//   node probe-restart-crash.mjs <dir> <file.sqlite>
//     "A=tool:slow_unsafe,B=idle,S=long"
// The first conversation is the root; the others are ownerless conversations.
// Per conversation:
//   idle            one finished turn
//   tool:<name>     killed while <name> is mid-call (after its first output is
//                   committed)
//   long            killed while the model streams a long answer (after a
//                   partial is committed)
// A "+followup" suffix also queues a second input while the conversation is
// busy, before the kill.
import { context, look, makeHost, MODEL, sleep } from "./probe-restart-lib.mjs";

const [dir, file, spec] = process.argv.slice(2);
const wants = spec.split(",").map((part) => {
  const [name, rest] = part.split("=");
  const [what, extra] = rest.split("+");
  return { name, what, followup: extra === "followup" };
});
const host = makeHost(dir, {
  holdMs: 600_000,
  tokensPerSecond: wants.some((want) => want.what === "long") ? 60 : undefined,
});
const harness = await host.open(file);
const info = {};
const conversations = [];
for (const [index, want] of wants.entries()) {
  const conversation =
    index === 0
      ? await harness.root(context, { agent: { model: MODEL } })
      : await harness.createConversation(
          { ownership: { kind: "ownerless" }, agent: { model: MODEL } },
          context,
        );
  conversations.push({ ...want, conversation });
  if (want.what === "idle") {
    const submission = await conversation.submit(
      { type: "input", content: "hello" },
      context,
    );
    await submission.wait(context);
    info[want.name] = { id: conversation.id, submission: submission.id };
  }
}
for (const want of conversations) {
  if (want.what === "idle") continue;
  const submission = await want.conversation.submit(
    { type: "input", content: want.what, requestId: `req-${want.name}` },
    context,
  );
  info[want.name] = { id: want.conversation.id, submission: submission.id };
}
// Wait until every interrupted-to-be conversation has durable mid-state.
for (const want of conversations) {
  if (want.what === "idle") continue;
  const view = await want.conversation.viewState(context);
  for (;;) {
    const live = view.value.docs["pi.live"];
    const midTool = live?.tools?.some(
      (slot) => slot.status === "running" && (slot.output ?? "") !== "",
    );
    const partial = live?.generation?.message?.content?.[0]?.text ?? "";
    if (want.what.startsWith("tool:") ? midTool : partial.length > 80) break;
    await sleep(10);
  }
  view.dispose();
  if (want.followup) {
    const queued = await want.conversation.submit(
      { type: "input", content: "queued follow-up" },
      context,
    );
    info[want.name].followup = queued.id;
  }
  info[want.name].liveWhileRunning = await look(harness, want.conversation);
}
process.stdout.write(
  `READY ${JSON.stringify({ pid: process.pid, conversations: info })}\n`,
);
setInterval(() => {}, 1000); // stay alive, mid-run, until killed
