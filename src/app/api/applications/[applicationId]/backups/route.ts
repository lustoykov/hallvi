import { z } from "zod";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import { applicationDeployment } from "@/server/deployment-store";
import { refreshScheduledBackups } from "@/server/scheduled-backup-host";
import { scheduledProtectionFor } from "@/server/scheduled-backup-store";
import {
  backupSelectionSchema,
  proposeBackupOperation,
} from "@/server/scheduled-backup-operations";
import {
  publicOperation,
  startChange,
  retryOperation,
} from "@/server/operation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.strictObject({
  action: z.enum([
    "refresh-backups",
    "configure-backups",
    "run-backup",
    "test-restore",
  ]),
  policy: backupSelectionSchema.optional(),
});
export function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const input = await parseJsonRequest(request, schema);
    const { applicationId } = await context.params;
    const record = applicationDeployment(applicationId);
    if (!record)
      return Response.json({ error: "Deployment not found." }, { status: 404 });
    if (input.action === "refresh-backups") {
      await refreshScheduledBackups(record);
      return { protection: scheduledProtectionFor(record) };
    }
    const operation = proposeBackupOperation(
      applicationId,
      input.action,
      input.policy,
    );
    // Clicking the named action is authority for this bounded operation. The
    // worker owns execution, so closing the page does not abandon the run.
    return {
      operation:
        operation.state === "proposed"
          ? publicOperation(startChange(operation.id, operation.updatedAt))
          : operation.state === "failed"
            ? publicOperation(retryOperation(operation.id, operation.updatedAt))
            : operation,
    };
  });
}
