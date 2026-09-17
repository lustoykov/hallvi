import { describe, expect, it } from "vitest";

import { pulse } from "../../../src/components/haldur/streaming-output";
import type { ExecutionRecord } from "../../../src/server/operator-execution";

const at = (iso: string) => Date.parse(iso);
const execution = (over: Partial<ExecutionRecord> = {}): ExecutionRecord => ({
  id: "e1",
  applicationId: "a1",
  chatId: "c1",
  runId: "r1",
  tool: "server_bash",
  target: "root@1.2.3.4:22",
  input: '{"command":"docker compose build"}',
  mode: "pi-decides",
  status: "running",
  output: "",
  createdAt: "2026-09-13T12:00:00.000Z",
  ...over,
});

describe("a running command's clock", () => {
  it("says how long it has been running", () => {
    expect(pulse(execution(), at("2026-09-13T12:00:42.000Z"))).toBe(
      "running 42s",
    );
    expect(pulse(execution(), at("2026-09-13T12:06:12.000Z"))).toBe(
      "running 6m 12s",
    );
  });

  it("says how long it has been quiet once the silence is real", () => {
    const item = execution({ outputAt: "2026-09-13T12:02:32.000Z" });
    // Two seconds after a line is the gap between lines, not a silence.
    expect(pulse(item, at("2026-09-13T12:02:34.000Z"))).toBe("running 2m 34s");
    expect(pulse(item, at("2026-09-13T12:06:12.000Z"))).toBe(
      "running 6m 12s · quiet for 3m 40s",
    );
  });

  it("claims no silence it cannot measure", () => {
    // No output has arrived at all, so there is no last line to count from.
    expect(pulse(execution(), at("2026-09-13T12:09:00.000Z"))).toBe(
      "running 9m 0s",
    );
    // Before the client clock is running, it says nothing rather than zero.
    expect(pulse(execution(), 0)).toBeNull();
  });
});
