import { removeCancelledDeploymentFiles } from "@/server/deployment-files";
import { db } from "@/server/db";
import {
  applicationDeployment,
  cancelDeployment,
} from "@/server/deployment-store";
import { OperationConflictError } from "@/server/operation-store";
import { getDeployment } from "@/server/deployment-store";
import { acceptUnknownCommand } from "@/server/command-checks";
import { z } from "zod";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import {
  ATTESTATION_INPUT,
  cancelOperation,
  operation,
  publicOperation,
  retryOperation,
  startChange,
} from "@/server/operation-store";

export const runtime = "nodejs";
const schema = z.strictObject({
  action: z.enum(["approve", "retry", "cancel"]),
  updatedAt: z.string().datetime(),
  inputs: z.record(z.string(), z.string().max(2000)).default({}),
});
export function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; operationId: string }> },
) {
  return handle(async () => {
    const input = await parseJsonRequest(request, schema);
    const { applicationId, operationId } = await context.params;
    const record = operation(operationId);
    if (!record || record.applicationId !== applicationId)
      return Response.json({ error: "Operation not found." }, { status: 404 });
    if (
      record.command?.type === "deployment" &&
      input.action === "cancel" &&
      record.state === "queued"
    ) {
      const cancelled = db().transaction(
        () => {
          const latest = operation(operationId);
          if (
            !latest ||
            latest.updatedAt !== input.updatedAt ||
            latest.state !== "queued"
          )
            throw new OperationConflictError();
          const deployment = applicationDeployment(applicationId);
          if (
            !deployment ||
            deployment.id !== record.source.id ||
            deployment.status !== "deploy-queued" ||
            deployment.serverCreateAttempted ||
            deployment.serverId
          )
            throw new OperationConflictError();
          cancelDeployment(deployment);
          return { operation: publicOperation(operation(operationId)!) };
        },
        { behavior: "immediate" },
      );
      removeCancelledDeploymentFiles(record.source.id);
      return cancelled;
    }
    if (record.command?.type === "deployment")
      throw new Error(
        "Use the deployment card so source, current pricing and protected inputs are checked together.",
      );
    const { [ATTESTATION_INPUT]: attestation, ...others } = input.inputs;
    if (
      Object.keys(others).length ||
      (attestation !== undefined && input.action !== "cancel")
    )
      throw new Error(
        "This operation does not accept protected inputs. None were saved.",
      );
    const result =
      input.action === "approve"
        ? startChange(record.id, input.updatedAt)
        : input.action === "cancel"
          ? cancelOperation(record.id, input.updatedAt, attestation)
          : retryOperation(record.id, input.updatedAt);
    // The owner's decision to run a release is the one that may accept a
    // held command's unknown outcome on its deployment.
    if (
      input.action !== "cancel" &&
      result.command?.type === "release-deployment"
    ) {
      const deployment = getDeployment(result.command.scope.deploymentId);
      if (deployment)
        acceptUnknownCommand(deployment, {
          title: `${input.action}: ${result.title}`,
          operationId: result.id,
        });
    }
    return { operation: publicOperation(result) };
  });
}
