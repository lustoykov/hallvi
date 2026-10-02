// Hallvi-specific follow-ups to Q3/Q4, one sqlite file per conversation:
//  (i)  Stop after a restart with a BARE host: no model provider, no tools
//       installed (Hallvi's Stop needs no model login and no executable
//       tools). Does conversation.abort() still settle the interrupted work?
//  (ii) An interrupted conversation that also had a QUEUED follow-up: how it
//       looks before resume, and what Continue (resume) and Stop (abort) do
//       with the queued message.
import { join } from "node:path";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
  context,
  copyDb,
  crash,
  freshDir,
  look,
  makeHost,
  transcript,
} from "./probe-restart-lib.mjs";

const dir = freshDir("q6");
const toolFile = join(dir, "tool.sqlite");
const streamFile = join(dir, "stream.sqlite");
const tool = (await crash(dir, toolFile, "A=tool:slow_unsafe+followup"))
  .conversations.A;
const stream = (await crash(dir, streamFile, "S=long")).conversations.S;

const show = async (harness, label, submissions) => {
  const root = await harness.root(context);
  const seen = await look(harness, root);
  console.log(`-- ${label}: scheduling=${seen.scheduling}`);
  console.log(
    `   pi.live.run=${JSON.stringify(seen.live?.run)} pi.inbox=${JSON.stringify(seen.inbox)}`,
  );
  console.log(`   tasks=${JSON.stringify(seen.tasks)}`);
  for (const id of submissions) {
    const record = await (
      await harness.submission(id, context)
    ).status(context);
    console.log(
      `   submission #${id}: ${record.status}${record.reason ? `/${record.reason}` : ""}`,
    );
  }
  for (const line of await transcript(root))
    console.log(`   | ${line.slice(0, 170)}`);
};

console.log(
  "===== (i) Stop with a bare host (createModels() without providers, createRegistry() without tools) =====",
);
for (const [name, file, submissions] of [
  ["mid-tool + queued follow-up", toolFile, [tool.submission, tool.followup]],
  ["mid-stream", streamFile, [stream.submission]],
]) {
  const copy = join(dir, `stop-${name.replaceAll(/[^a-z]/g, "")}.sqlite`);
  copyDb(file, copy);
  const reports = [];
  const bare = await Harness.open(
    await openNodeSqliteStorage(copy),
    {
      models: createModels(),
      registry: createRegistry(),
      onReport: (error) => reports.push(String(error?.message ?? error)),
    },
    context,
  );
  console.log(`\n[${name}]`);
  await show(bare, "reopened, before Stop", submissions);
  const started = performance.now();
  await (await bare.root(context)).abort(context);
  console.log(
    `   abort() resolved in ${(performance.now() - started).toFixed(1)} ms; reports=${JSON.stringify(reports)}`,
  );
  await show(bare, "after Stop", submissions);
  await bare.close(context);
}

console.log("\n===== (ii) Continue with a queued follow-up =====");
const copy = join(dir, "continue.sqlite");
copyDb(toolFile, copy);
const host = makeHost(dir, { holdMs: 0 });
const before = host.modelCalls().length;
const harness = await host.open(copy);
await show(harness, "reopened, before Continue", [
  tool.submission,
  tool.followup,
]);
harness.resume();
await harness.waitForIdle(context);
await show(harness, "after resume() + waitForIdle()", [
  tool.submission,
  tool.followup,
]);
console.log("   model requests after resume:");
for (const request of host.modelCalls().slice(before))
  console.log(`     ${JSON.stringify(request.received).slice(0, 330)}`);
await harness.close(context);
