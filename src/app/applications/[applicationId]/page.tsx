import { notFound } from "next/navigation";

import { OperatorShell } from "@/components/server-guy/operator-shell";
import { NotFoundError } from "@/server/applications";
import { listApplications } from "@/server/db";
import { getOperatorView } from "@/server/operator-view";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ chat?: string | string[] }>;
}) {
  const [{ applicationId }, { chat }] = await Promise.all([
    params,
    searchParams,
  ]);
  let view;
  try {
    view = getOperatorView(
      applicationId,
      typeof chat === "string" ? chat : undefined,
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <OperatorShell
      key={applicationId}
      // Only the QA fixture runs under a fixture root: its repositories are
      // synthetic, so GitHub links are shown but never followed.
      demo={Boolean(process.env.SERVER_GUY_QA_ROOT)}
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
