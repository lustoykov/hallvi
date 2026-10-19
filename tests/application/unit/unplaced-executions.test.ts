// Calls no message holds are drawn after the latest message. Those from a
// history Pi no longer reads must not bury the reply being written.

import { describe, expect, it } from "vitest";

import { unplacedExecutions } from "@/components/hallvi/chat-pane";
import type { OperatorView } from "@/server/types";

type View = Pick<OperatorView, "messages" | "executions">;

const message = (source: "hallvi" | "user", createdAt: string) =>
  ({ id: createdAt, source, createdAt }) as View["messages"][number];
const call = (id: string, status: string, createdAt: string) =>
  ({ id, status, createdAt }) as NonNullable<View["executions"]>[number];

describe("calls drawn after the latest message", () => {
  it("leaves out finished calls from before the history Pi reads", () => {
    const view: View = {
      messages: [
        message("hallvi", "2026-09-24T11:22:00.000Z"),
        message("user", "2026-10-08T16:41:00.000Z"),
      ],
      executions: [
        call("old", "succeeded", "2026-10-01T19:20:00.000Z"),
        call("old-waiting", "awaiting-approval", "2026-10-01T19:21:00.000Z"),
        call("new", "succeeded", "2026-10-08T16:42:00.000Z"),
      ],
    };
    expect(unplacedExecutions(view)?.map((record) => record.id)).toEqual([
      "old-waiting",
      "new",
    ]);
  });

  it("keeps every call while Pi has written nothing", () => {
    const executions = [call("only", "succeeded", "2026-10-01T19:20:00.000Z")];
    expect(
      unplacedExecutions({
        messages: [message("hallvi", "2026-10-08T16:41:00.000Z")],
        executions,
      }),
    ).toBe(executions);
  });
});
