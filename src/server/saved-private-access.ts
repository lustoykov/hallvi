import { z } from "zod";
import { currentAccessRecord } from "./access-record";
import { listInformation } from "./saved-information";
import { operatorSettings, type executionContext } from "./operator-execution";
import { openServerPort, privateAccessPortAllowed } from "./private-access";
import type { OperatorSettings, SavedInformation } from "./operator-data";

export const privateAccessArguments = z.union([
  z.strictObject({
    remotePort: z.number().int().min(1).max(65535),
    localPort: z.number().int().min(1024).max(65535).optional(),
  }),
  z.strictObject({
    accessRecordId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
  }),
]);

/** Eligibility reads saved configuration; it never opens or probes anything. */
export function reconnectEligible(
  record: SavedInformation | undefined,
  host: OperatorSettings["host"],
) {
  const content = record?.presentation?.content;
  if (
    !record?.establishedAt ||
    record.retiredAt ||
    !host ||
    content?.kind !== "application-access" ||
    content.mode !== "private" ||
    content.server !== host.address ||
    !currentAccessRecord([record], record.applicationId)
  )
    return false;
  const url = new URL(record.presentation!.url!);
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    privateAccessPortAllowed(content.localPort!)
  );
}

async function resolve(
  applicationId: string,
  reference: { accessRecordId: string; expectedUpdatedAt: string },
) {
  const [records, settings] = await Promise.all([
    listInformation(applicationId),
    operatorSettings(applicationId),
  ]);
  const record = currentAccessRecord(records, applicationId);
  if (
    record?.id !== reference.accessRecordId ||
    record.updatedAt !== reference.expectedUpdatedAt
  )
    throw new Error(
      "The saved private route changed. Review it before reconnecting.",
    );
  if (!reconnectEligible(record, settings.host))
    throw new Error(
      "This saved private route does not match the attached server or allowed ports. Ask Pi to review private access.",
    );
  const content = record.presentation!.content!;
  if (content.kind !== "application-access")
    throw new Error("No private route.");
  return {
    host: settings.host!,
    url: record.presentation!.url!,
    options: { remotePort: content.remotePort!, localPort: content.localPort! },
  };
}

/** Both route forms use the existing permission and evidence wrapper. */
export async function executePrivateAccess(
  applicationId: string,
  execution: ReturnType<typeof executionContext>,
  input: unknown,
  toolCallId: string,
  signal?: AbortSignal,
) {
  const params = privateAccessArguments.parse(input);
  if (!("accessRecordId" in params))
    return execution.execute(
      "open_server_port",
      "Private access on the controller PC",
      params,
      () => openServerPort(applicationId, params, signal),
      false,
      toolCallId,
      signal,
    );
  const captured = await resolve(applicationId, params);
  const { address, user, port, provider, serverId } = captured.host;
  return execution.execute(
    "open_server_port",
    `Reconnect ${captured.url} through ${user}@${address}:${port}`,
    {
      ...params,
      server: { address, user, port, provider, serverId },
      ...captured.options,
      url: captured.url,
    },
    async () => {
      const current = await resolve(applicationId, params);
      if (JSON.stringify(current) !== JSON.stringify(captured))
        throw new Error(
          "The saved route or attached server changed. Review private access again.",
        );
      const result = await openServerPort(
        applicationId,
        current.options,
        signal,
        { host: captured.host, url: captured.url },
      );
      return {
        ...result,
        accessRecordId: params.accessRecordId,
        checkedAt: new Date().toISOString(),
        verifiedFrom:
          result.httpStatus === null
            ? "The connection opened, but the application did not answer this controller check. Report this access result; investigation requires a separate owner request."
            : `The controller received HTTP ${result.httpStatus} at the saved URL. Report the status; do not repair or change the route.`,
      };
    },
    false,
    toolCallId,
    signal,
  );
}
