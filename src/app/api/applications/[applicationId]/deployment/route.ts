import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { checkDeploymentSource } from "@/server/deployment-source";
import { z } from "zod";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import {
  DeploymentConflictError,
  deploymentExecutionState,
  cancelDeployment,
  applicationDeployment,
  requestDeployment,
  saveDeployment,
  deploymentMessage,
} from "@/server/deployment-store";
import {
  hetzner,
  hetznerConnectionId,
  smallestHostOffer,
} from "@/server/hetzner";
import {
  saveDeploymentInputs,
  collectDeploymentLogs,
} from "@/server/deployment-executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ applicationId: string }> };
export function GET(_request: Request, context: Context) {
  return handle(async () => ({
    deployment: applicationDeployment((await context.params).applicationId),
    connected: Boolean(hetznerConnectionId()),
  }));
}
const schema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("prepare"), chatId: z.uuid() }),
  z.strictObject({
    action: z.literal("approve"),
    deploymentId: z.uuid(),
    recommendationId: z.uuid(),
    maxMonthly: z.number().positive().max(100),
    inputs: z.record(z.string(), z.string().max(2000)),
  }),
  z.strictObject({
    action: z.enum(["retry", "logs", "cancel"]),
    deploymentId: z.uuid(),
  }),
]);
export function POST(request: Request, context: Context) {
  return handle(async () => {
    const input = await parseJsonRequest(request, schema);
    const { applicationId } = await context.params;
    if (input.action === "prepare")
      return { deployment: requestDeployment(applicationId, input.chatId) };
    const record = applicationDeployment(applicationId);
    if (!record || record.id !== input.deploymentId)
      throw new Error(
        "The deployment recommendation changed. Reload it before proceeding.",
      );
    if (input.action === "approve") {
      if (record.status !== "awaiting-approval") return { deployment: record };
      if (record.recommendationId !== input.recommendationId)
        throw new Error(
          "The recommendation changed. Review the latest configuration before approving.",
        );
      await checkDeploymentSource(record);
      const connectionId = hetznerConnectionId();
      if (!connectionId || !record.offer)
        throw new Error(
          "Connect Hetzner and prepare a priced recommendation first.",
        );
      const current = await smallestHostOffer(record.offer);
      if (
        current.serverType !== record.offer.serverType ||
        current.location !== record.offer.location ||
        current.monthly > input.maxMonthly ||
        current.currency !== record.offer.currency
      ) {
        record.offer = current;
        record.recommendationId = randomUUID();
        saveDeployment(record);
        throw new Error(
          "Hetzner pricing changed. Review the updated recommendation.",
        );
      }
      // Keep the authority check, input write and state transition together.
      // A stale approval must not replace the inputs of a newer recommendation.
      return db().transaction(
        () => {
          const latest = applicationDeployment(applicationId);
          if (latest?.status !== "awaiting-approval")
            return { deployment: latest };
          if (
            deploymentExecutionState(latest) !==
            deploymentExecutionState(record)
          )
            throw new DeploymentConflictError();
          if (hetznerConnectionId() !== connectionId)
            throw new Error(
              "Hetzner access changed. Review the recommendation again.",
            );
          saveDeploymentInputs(record, input.inputs);
          record.authority = {
            acceptedAt: new Date().toISOString(),
            connectionId,
            maxMonthly: input.maxMonthly,
          };
          record.status = "deploy-queued";
          saveDeployment(record);
          deploymentMessage(
            record,
            "The deployment recommendation is accepted. I’m preparing the host and deploying this exact revision; you can follow the work here.",
          );
          return { deployment: record };
        },
        { behavior: "immediate" },
      );
    } else if (input.action === "cancel") {
      if (
        !["failed", "awaiting-approval"].includes(record.status) ||
        record.serverId ||
        record.serverCreateAttempted
      )
        throw new Error(
          "A running or uncertain server cannot be removed by cancelling setup. Reconcile the deployment first.",
        );
      if (record.authority?.connectionId === hetznerConnectionId()) {
        const query = `?label_selector=${encodeURIComponent(`sg-deployment=${record.id}`)}`;
        const result = await hetzner<{ servers: unknown[] }>(
          `/servers${query}`,
        );
        if (result.servers.length)
          throw new Error(
            "A server exists for this deployment. Reconcile it before cancelling setup.",
          );
      }
      cancelDeployment(record);
      return { deployment: null };
    } else if (input.action === "retry") {
      if (record.status !== "failed")
        throw new Error("Only a stopped deployment can be retried.");
      record.status = record.authority ? "deploy-queued" : "queued";
      record.error = null;
      saveDeployment(record);
    } else {
      if (record.status !== "live")
        throw new Error(
          "Application logs become available after the first verified deployment.",
        );
      await collectDeploymentLogs(record, AbortSignal.timeout(30000));
    }
    return { deployment: record };
  });
}
