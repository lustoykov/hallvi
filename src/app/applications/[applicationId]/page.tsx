import { notFound } from "next/navigation";

import { OperatorShell } from "@/components/hallvi/operator-shell";
import { NotFoundError } from "@/server/applications";
import { listApplications, getMessage } from "@/server/db";
import { getOperatorView } from "@/server/operator-view";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{
    chat?: string | string[];
    message?: string | string[];
  }>;
}) {
  const [{ applicationId }, { chat, message }] = await Promise.all([
    params,
    searchParams,
  ]);
  let view;
  try {
    view = getOperatorView(
      applicationId,
      typeof chat === "string"
        ? chat
        : typeof message === "string"
          ? getMessage(message)?.chatId
          : undefined,
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
      demo={Boolean(process.env.HALLVI_QA_ROOT)}
      applications={listApplications().map(
        ({ id, repositoryOwner, repositoryName }) => ({
          id,
          repositoryOwner,
          repositoryName,
        }),
      )}
      // `npm run dev` starts a Drizzle Studio on this database and names its
      // port here, so the Database link cannot point at another checkout's.
      studioPort={Number(process.env.HALLVI_STUDIO_PORT) || undefined}
      initialView={view}
      initialPiSetup={await getPiSetupStatus()}
    />
  );
}
