import type { Transcript } from "@/server/pi-transcript";
import type { ExecutionRecord } from "@/server/operator-execution";

/** Synthetic history: three calls per reply, mixed output sizes. */
export function longHistory(
  chatId: string,
  applicationId: string,
  calls = 240,
) {
  const transcript: Transcript = {
    status: "idle",
    messages: [],
    calls: {},
    said: [],
  };
  const executions: ExecutionRecord[] = [];
  for (let i = 0; i < calls; i++) {
    const turn = Math.floor(i / 3);
    const replyId = `reply:${turn}`;
    const at = new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString();
    if (i % 3 === 0) {
      transcript.messages.push({
        id: `asked:${turn}`,
        chatId,
        role: "user",
        body: `Inspect stage ${turn}.`,
        source: "user",
        status: "delivered",
        createdAt: at,
        revision: 0,
      });
      transcript.messages.push({
        id: replyId,
        chatId,
        role: "assistant",
        body:
          `Recorded stage ${turn}. ` +
          "The recorded checks describe this observation. ".repeat(16),
        source: "pi",
        status: "completed",
        createdAt: at,
        finishedAt: at,
        revision: 0,
      });
    }
    const toolCallId = `call:${i}`;
    const output =
      `Evidence ${i}: ` +
      "container running; probe HTTP 200; recorded observation\n".repeat(
        i % 20 === 0 ? 370 : 75,
      ) +
      `END-${i}`;
    transcript.calls[toolCallId] = {
      replyId,
      sequence: i % 3,
      tool: i % 3 === 0 ? "read" : "server_bash",
      args:
        i % 3 === 0
          ? { path: `logs/stage-${turn}.txt` }
          : { command: `printf 'stage ${i}'`, intent: `Check stage ${i}` },
      at,
      result: { text: output, failed: false, at },
    };
    if (i % 3 !== 0)
      executions.push({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        applicationId,
        chatId,
        runId: replyId,
        toolCallId,
        tool: "server_bash",
        target: "qa@192.0.2.1:22",
        input: `printf 'stage ${i}'`,
        mode: "bypass",
        status: "succeeded",
        output,
        createdAt: at,
        finishedAt: at,
        exitCode: 0,
      });
  }
  return { transcript, executions };
}
