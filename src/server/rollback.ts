import { z } from "zod";
import type { DeploymentRecord } from "./deployment-types";
import { releaseIdentityHolds, releaseOf } from "./deployment-release";
import { establishedRuntime } from "./deployment-runtime";
import { currentFacts, releaseFacts, stateOwners } from "./release-facts";
import type { ReleaseScope } from "./release-scope";

/** Retain observed images before a later deployment replaces runtime facts. */
export function rememberVerifiedImages(record: DeploymentRecord) {
  const lifecycle = record.lifecycle;
  const verified = lifecycle?.runtime.lastVerified;
  if (!lifecycle || lifecycle.runtime.state !== "verified" || !verified) return;
  if (releaseOf(record)?.id !== verified.releaseId) return;
  const artifacts = (lifecycle.verifiedImages ??= []);
  if (!artifacts.some((a) => a.attemptId === verified.attemptId))
    artifacts.push({
      attemptId: verified.attemptId,
      releaseId: verified.releaseId,
      hostId: verified.hostId,
      checkedAt: verified.checkedAt,
      images: structuredClone(verified.images),
    });
}

export function rollbackSelection(
  record: DeploymentRecord,
  releaseId: string,
  compatibilityEvidence: string,
): NonNullable<ReleaseScope["rollback"]> {
  z.string()
    .regex(/^[0-9a-f]{64}$/)
    .parse(releaseId);
  const evidence = compatibilityEvidence.trim();
  if (!evidence || evidence.length > 5000)
    throw new Error(
      "Explain why the earlier code can use the current data before proposing rollback.",
    );
  const release = record.lifecycle?.releases.find((r) => r.id === releaseId);
  const verified = record.lifecycle?.verifiedImages?.findLast(
    (a) => a.releaseId === releaseId && a.hostId === record.lifecycle!.host.id,
  );
  if (!release || !releaseIdentityHolds(release) || !verified)
    throw new Error(
      "No previously verified images are recorded for this release on this host.",
    );
  // An observed-but-broken current release may return to verified images.
  if (releaseId === establishedRuntime(record.lifecycle!.runtime)?.releaseId)
    throw new Error("This release is already the current runtime.");
  const facts = releaseFacts(release);
  // Rollback never downgrades a service that owns persistent data: the
  // earlier code runs against the current data and its current owners.
  const current = currentFacts(record);
  const owners = new Set([
    ...stateOwners(facts),
    ...(current ? stateOwners(current) : []),
  ]);
  const images = Object.fromEntries(
    facts.services.map(({ name }) => {
      const image = owners.has(name)
        ? record.serviceImages?.[name]
        : verified.images[name];
      if (!image || !/^sha256:[0-9a-f]{64}$/.test(image))
        throw new Error(`The verified image for ${name} is unavailable.`);
      return [name, image];
    }),
  );
  return {
    releaseId,
    attemptId: verified.attemptId,
    images,
    compatibilityEvidence: evidence,
  };
}
