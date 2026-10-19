import { createHash } from "node:crypto";
import { clip, commandOf, essence } from "@/components/hallvi/execution-text";
import type { ActivityRecord } from "./pi-activity";
import type { ExecutionRecord } from "./operator-execution";
import type { ActivitySummary, ExecutionSummary } from "@/lib/call-detail";

const version = (values: unknown[]) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex");

/** Only the argument fields a closed row names, bounded to its measure. */
function rowArguments(stored: string) {
  try {
    const args = JSON.parse(stored) as Record<string, unknown>;
    const fields = [
      "intent",
      "command",
      "path",
      "file",
      "filePath",
      "pattern",
      "query",
      "title",
    ];
    return JSON.stringify(
      Object.fromEntries(
        fields.flatMap((key) =>
          typeof args?.[key] === "string" ? [[key, clip(args[key], 160)]] : [],
        ),
      ),
    );
  } catch {
    return clip(essence(commandOf(stored)), 140);
  }
}

export function executionSummary(record: ExecutionRecord): ExecutionSummary {
  // The failed reply names its last meaningful error outside the disclosure.
  const failure =
    record.status === "failed"
      ? (record.output
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !/^exit (status )?\d+$/i.test(line))
          .at(-1)
          ?.slice(0, 500) ?? "")
      : "";
  let observation = "";
  if (record.tool === "open_server_port" && record.status === "succeeded") {
    try {
      const { accessRecordId, url, checkedAt, httpStatus } = JSON.parse(
        record.output,
      );
      observation = JSON.stringify({
        accessRecordId,
        url,
        checkedAt,
        httpStatus,
      });
    } catch {
      /* An unrecorded HTTP observation stays unknown. */
    }
  }
  return {
    ...record,
    input: rowArguments(record.input),
    output: observation || failure,
    hasOutput: Boolean(record.output.trim()),
    detailVersion: version([record.input, record.output]),
  };
}

export function activitySummary(record: ActivityRecord): ActivitySummary {
  if (record.kind === "message") return record;
  return {
    ...record,
    args: rowArguments(record.args),
    preview: "",
    result: "",
    hasOutput: Boolean(record.preview.trim()),
    hasResult: Boolean(record.result.trim()),
    detailVersion: version([
      record.args,
      record.preview,
      record.result,
      record.truncated,
    ]),
  };
}
