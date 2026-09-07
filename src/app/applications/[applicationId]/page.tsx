import { notFound } from "next/navigation";

import { OperatorShell } from "@/components/server-guy/operator-shell";
import { ShellPrototype } from "@/components/server-guy/prototype/shell-prototype";
import { listApplications } from "@/server/db";
import { getOperatorView, NotFoundError } from "@/server/phase-one";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{
    chat?: string | string[];
    phase?: string | string[];
    /** PROTOTYPE: `?variant=A|B|C` renders the shell prototype instead. */
    variant?: string | string[];
  }>;
}) {
  const [{ applicationId }, { chat, phase, variant }] = await Promise.all([
    params,
    searchParams,
  ]);
  let view;
  try {
    view = getOperatorView(
      applicationId,
      typeof chat === "string" ? chat : undefined,
      phase === "start" ||
        phase === "inspect-app" ||
        phase === "make-launch-ready"
        ? phase
        : undefined,
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  // PROTOTYPE (throwaway): the shell variants, never in production builds.
  if (typeof variant === "string" && process.env.NODE_ENV !== "production")
    return (
      <ShellPrototype
        key={`${applicationId}:${variant}`}
        piSetup={await getPiSetupStatus()}
        variant={variant}
        view={view}
      />
    );
  return (
    <OperatorShell
      key={applicationId}
      applications={listApplications().map(
        ({ id, repositoryOwner, repositoryName }) => ({
          id,
          repositoryOwner,
          repositoryName,
        }),
      )}
      initialView={view}
      initialPiSetup={await getPiSetupStatus()}
    />
  );
}
