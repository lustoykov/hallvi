import { expect, it } from "vitest";
import { projectTranscript } from "@/server/pi-transcript";

// What Pi holds of a conversation, written out by hand in the shapes its
// durable runtime stores: entries with the message inside, and its record of
// each message it was handed.
let next = 1;
const user = (text: string, at: number, placedBy?: number) => ({
  id: next++,
  conversationId: 1,
  kind: "pi.user",
  ...(placedBy && { byTaskId: placedBy }),
  model: [{ role: "user", content: [{ type: "text", text }], timestamp: at }],
});
const assistant = (
  stopReason: string,
  content: object[],
  at: number,
  errorMessage?: string,
) => ({
  id: next++,
  conversationId: 1,
  kind: "pi.assistant",
  byTaskId: 900,
  model: [
    { role: "assistant", content, stopReason, errorMessage, timestamp: at },
  ],
});
const says = (text: string) => ({ type: "text", text });
const calls = (id: string) => ({
  type: "toolCall",
  id,
  name: "server_bash",
  arguments: {},
});
const result = (toolCallId: string, at: number) => ({
  id: next++,
  conversationId: 1,
  kind: "pi.tool-result",
  byTaskId: 901,
  model: [
    {
      role: "toolResult",
      toolCallId,
      content: [{ type: "text", text: "ok" }],
      isError: false,
      timestamp: at,
    },
  ],
});
const record = (requestId: string, entry: { id: number }, rest: object) => ({
  id: next++,
  conversationId: 1,
  type: "input",
  requestId,
  entry: entry.id,
  ...rest,
});
const read = (over: object, working = false) =>
  projectTranscript(
    "chat",
    {
      entries: [],
      submissions: [],
      live: {},
      inbox: { items: [] },
      tasks: 0,
      ...over,
    } as never,
    working,
  );
const lines = (transcript: ReturnType<typeof read>) =>
  transcript.messages.map((m) =>
    `${m.id} ${m.status} ${m.operationId} ${m.body}`.trim(),
  );

it("puts a steer in the work it joined, however many steps later, and what Pi read next in work of its own", () => {
  const first = user("deploy it", 1);
  const steer = user("use staging", 4, 900);
  const second = user("one more", 7, 900);
  const follow = user("then the logs", 9, 900);
  const also = user("and the disk", 9, 900);
  const answer = assistant("stop", [says("deployed")], 8);
  const last = assistant("stop", [says("both read")], 10);
  const transcript = read({
    entries: [
      first,
      assistant("toolUse", [calls("c1")], 2),
      result("c1", 3),
      steer,
      assistant("toolUse", [calls("c2")], 5),
      result("c2", 6),
      second,
      answer,
      // A steer and a follow-up that both waited when Pi finished: taken
      // from its queue together, written with one time.
      follow,
      also,
      last,
    ],
    submissions: [
      record("first", first, { status: "done", answer: answer.id }),
      record("steer", steer, { status: "done", answer: answer.id }),
      record("second", second, { status: "done", answer: answer.id }),
      record("follow", follow, { status: "done", answer: last.id }),
      record("also", also, { status: "done", answer: last.id }),
    ],
  });
  expect(
    transcript.messages
      .filter((m) => m.role === "user")
      .map((m) => [m.id, m.operationId]),
  ).toEqual([
    ["first", "first"],
    ["steer", "first"],
    ["second", "first"],
    ["follow", "follow"],
    ["also", "follow"],
  ]);
  expect(transcript.operations).toMatchObject({
    first: { status: "completed" },
    follow: { status: "completed" },
  });
});

it("says a reply was stopped even when Pi had written nothing, each stopped message by itself", () => {
  const one = user("restart it", 1);
  const two = user("never mind, check it", 2);
  const transcript = read({
    entries: [one, two],
    submissions: [
      record("one", one, { status: "unanswered", reason: "aborted" }),
      record("two", two, { status: "unanswered", reason: "aborted" }),
    ],
  });
  expect(lines(transcript)).toEqual([
    "one delivered one restart it",
    "reply:one cancelled one",
    "two delivered two never mind, check it",
    "reply:two cancelled two",
  ]);
});

it("dates the reply Pi is working on from the message it answers until its first words arrive", () => {
  const asked = user("how is it?", 1_700_000_000_000);
  const state = {
    entries: [asked],
    submissions: [record("asked", asked, { status: "placed" })],
    live: {
      run: { taskId: 900, inputs: [asked.id + 1] },
      generation: { attempt: 1 },
    },
    tasks: 1,
  };
  const running = read(state, true).messages.at(-1)!;
  expect(running).toMatchObject({
    id: "reply:asked",
    status: "running",
    operationId: "asked",
    startedAt: new Date(1_700_000_000_000).toISOString(),
  });
  // Nobody is running it: the same reply, under the same id, interrupted.
  expect(read(state).messages.at(-1)).toMatchObject({
    id: "reply:asked",
    status: "interrupted",
  });
});

it("shows what Pi wrote last: an attempt it gave up on is neither said twice nor a call it made", () => {
  const asked = user("how is the disk?", 1);
  const answer = assistant("stop", [says("The disk is half full.")], 4);
  const transcript = read({
    entries: [
      asked,
      // Cut by an interruption, then by a provider error: both are entries.
      assistant("aborted", [says("The disk is"), calls("never")], 2),
      assistant("error", [says("The di")], 3, "overloaded"),
      answer,
    ],
    submissions: [
      record("asked", asked, { status: "done", answer: answer.id }),
    ],
  });
  expect(transcript.messages.at(-1)).toMatchObject({
    status: "completed",
    body: "The disk is half full.",
    failure: undefined,
  });
  expect(transcript.said.map((each) => each.text)).toEqual([
    "The disk is half full.",
  ]);
  expect(transcript.calls).toEqual({});

  // An answer cut at its length limit while it was asking for a call: Pi
  // never ran it, so it is not a call that was stopped.
  const cut = user("restart it", 5);
  const long = assistant("length", [says("I will restart"), calls("c9")], 6);
  expect(
    read({
      entries: [cut, long],
      submissions: [record("cut", cut, { status: "done", answer: long.id })],
    }).calls,
  ).toEqual({});
});
