import { notFound } from "next/navigation";

import { OperatorShell } from "@/components/server-guy/operator-shell";
import { listApplications } from "@/server/db";
import { getPhaseOneOperatorView, NotFoundError } from "@/server/phase-one";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({ params, searchParams }: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ chat?: string | string[] }>;
}) {
  const [{ applicationId }, { chat }] = await Promise.all([params, searchParams]);
  let view;
  try {
    view = getPhaseOneOperatorView(applicationId, typeof chat === "string" ? chat : undefined);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <OperatorShell
      key={applicationId}
      applications={listApplications().map(({ id, repositoryOwner, repositoryName }) => ({ id, repositoryOwner, repositoryName }))}
      initialView={view}
      initialPiSetup={await getPiSetupStatus()}
    />
  );
}
