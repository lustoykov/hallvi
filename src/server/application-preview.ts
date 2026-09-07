import { randomUUID } from "node:crypto";
import {
  acceptedAcceptanceChecks,
  activeConformanceProposal,
  currentContract,
  getConformanceRun,
  insertActivity,
  listApplicationPreviews,
  saveApplicationPreview,
  updateConformanceRun,
  withTransaction,
} from "./db";
import {
  dockerConformanceExecutor,
  type ExecutionOutcome,
} from "./conformance-executor";
import { discoverExecutionEnvironment, dockerClientFor } from "./docker";
import { CONFORMANCE_DEFINITION } from "./conformance-definition";
import { loadApplication } from "./workspaces";
import type { ApplicationPreview, ConformanceRunRecord } from "./types";

export function previewForRun(runId: string) {
  return listApplicationPreviews().find((item) => item.runId === runId) ?? null;
}
function boundToCurrent(preview: ApplicationPreview) {
  const { current } = loadApplication(preview.applicationId);
  const run = getConformanceRun(preview.runId);
  const contract = currentContract(preview.applicationId);
  const proposal = activeConformanceProposal(current.id);
  return (
    current.phaseKey === "make-launch-ready" &&
    run?.contractId === contract?.id &&
    run?.proposalId === proposal?.id &&
    run?.source.commitSha === proposal?.candidate?.sha &&
    run?.acceptanceChecksId ===
      acceptedAcceptanceChecks(preview.applicationId)?.id &&
    run?.definitionVersion === CONFORMANCE_DEFINITION.version
  );
}
export function applicationPreviewView(
  applicationId: string,
): ApplicationPreview | null {
  const preview = listApplicationPreviews(applicationId)[0];
  if (!preview) return null;
  const current = boundToCurrent(preview);
  const expired = Date.now() >= Date.parse(preview.expiresAt);
  const run = getConformanceRun(preview.runId);
  const failedStart =
    preview.status === "starting" &&
    run &&
    !["queued", "running", "passed"].includes(run.status);
  return {
    ...preview,
    ...(failedStart ? { summary: run.summary } : {}),
    status: failedStart
      ? "failed"
      : !current
        ? "stale"
        : expired && ["ready", "starting"].includes(preview.status)
          ? "expired"
          : preview.status,
    url: current && !expired && preview.status === "ready" ? preview.url : null,
    confirmationCurrent:
      current &&
      Boolean(preview.confirmedAt) &&
      run?.status === "passed" &&
      run.imageDigest === preview.imageDigest &&
      !["failed", "stale"].includes(preview.status),
  };
}
export function recordPreviewRequest(run: ConformanceRunRecord) {
  const existing = listApplicationPreviews(run.applicationId).find((item) =>
    ["starting", "ready"].includes(item.status),
  );
  if (existing)
    throw new Error("Stop the existing preview before starting another.");
  return saveApplicationPreview({
    id: randomUUID(),
    applicationId: run.applicationId,
    runId: run.id,
    status: "starting",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    url: null,
    containerId: null,
    imageDigest: null,
    confirmedAt: null,
    summary:
      "Building and verifying the candidate. Its preview will open only after the checks pass.",
  });
}
export async function recordPreviewOutcome(
  run: ConformanceRunRecord,
  outcome: ExecutionOutcome,
) {
  const preview = previewForRun(run.id);
  if (!preview) return;
  const ready =
    preview.status === "starting" &&
    run.status === "passed" &&
    outcome.preview &&
    boundToCurrent(preview);
  saveApplicationPreview({
    ...preview,
    status: ready
      ? "ready"
      : preview.status === "starting"
        ? "failed"
        : preview.status,
    url: ready ? outcome.preview!.url : null,
    containerId: ready ? outcome.preview!.containerId : null,
    imageDigest: outcome.imageDigest,
    summary: ready
      ? "The verified application is running with disposable test data. Open it and try its main workflow before confirming."
      : "The preview did not complete. Review the run results, correct the problem and try again.",
  });
  if (!ready) await dockerConformanceExecutor().cleanupLeftovers([run.id]);
}
export async function stopApplicationPreview(
  applicationId: string,
  id: string,
  reason: "stopped" | "expired" | "stale" = "stopped",
) {
  const preview = listApplicationPreviews(applicationId).find(
    (item) => item.id === id,
  );
  if (!preview) throw new Error("Preview not found for this application.");
  updateConformanceRun(preview.runId, ["queued", "running"], {
    status: "cancelled",
    summary: "Preview stopped by its owner.",
    finishedAt: new Date().toISOString(),
  });
  saveApplicationPreview({
    ...preview,
    status: reason,
    url: null,
    summary:
      reason === "stale"
        ? "The selected revision or checks changed. Start a new preview."
        : "Preview stopped. Its records remain in history.",
  });
  await dockerConformanceExecutor().cleanupLeftovers([preview.runId]);
  return applicationPreviewView(applicationId);
}
export async function confirmApplicationPreview(
  applicationId: string,
  id: string,
) {
  const preview = applicationPreviewView(applicationId);
  if (
    !preview ||
    preview.id !== id ||
    preview.status !== "ready" ||
    !preview.containerId
  )
    throw new Error(
      "Open a current, running preview before confirming the application.",
    );
  const client = dockerClientFor(await discoverExecutionEnvironment());
  if (
    !client ||
    !(await client.inspectContainer(preview.containerId)).State.Running
  )
    throw new Error(
      "The preview is no longer running. Start it again before confirming.",
    );
  return withTransaction(() => {
    const latest = applicationPreviewView(applicationId);
    if (!latest || latest.id !== id || latest.status !== "ready")
      throw new Error("The preview changed while confirming. Review it again.");
    if (latest.confirmationCurrent) return latest;
    const run = getConformanceRun(latest.runId)!;
    if (run.status !== "passed" || run.imageDigest !== latest.imageDigest)
      throw new Error("The preview has no matching successful verification.");
    saveApplicationPreview({
      ...latest,
      confirmedAt: new Date().toISOString(),
    });
    insertActivity(
      run.workspaceId,
      "application-preview-confirmed",
      "Application preview confirmed",
      `You confirmed ${run.source.commitSha.slice(0, 8)} using image ${run.imageDigest}. This is local verification, not production health.`,
    );
    return applicationPreviewView(applicationId);
  });
}

/** Runs in the worker: stale and expired previews lose their containers. */
export async function sweepApplicationPreviews(restart = false) {
  for (const preview of listApplicationPreviews()) {
    if (!["ready", "starting"].includes(preview.status)) continue;
    if (
      restart ||
      !boundToCurrent(preview) ||
      Date.now() >= Date.parse(preview.expiresAt)
    ) {
      await stopApplicationPreview(
        preview.applicationId,
        preview.id,
        restart ? "stopped" : !boundToCurrent(preview) ? "stale" : "expired",
      );
      continue;
    }
    const run = getConformanceRun(preview.runId);
    if (
      preview.status === "starting" &&
      run &&
      !["queued", "running"].includes(run.status)
    ) {
      saveApplicationPreview({
        ...preview,
        status: "failed",
        url: null,
        summary: run.summary,
      });
      await dockerConformanceExecutor().cleanupLeftovers([preview.runId]);
      continue;
    }
    if (preview.status === "ready" && preview.containerId) {
      const client = dockerClientFor(await discoverExecutionEnvironment());
      const running =
        client &&
        (await client
          .inspectContainer(preview.containerId)
          .then((state) => state.State.Running)
          .catch(() => false));
      if (!running) {
        saveApplicationPreview({
          ...preview,
          status: "failed",
          url: null,
          summary:
            "The preview stopped responding. Start a new preview before confirming.",
        });
        await dockerConformanceExecutor().cleanupLeftovers([preview.runId]);
      }
    }
  }
}
