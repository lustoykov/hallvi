import { notFound } from "next/navigation";

import { OperatorShell } from "@/components/hallvi/operator-shell";
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
    view = await getOperatorView(
      applicationId,
      typeof chat === "string" ? chat : undefined,
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  // This dynamic server page takes the clock snapshot; the client receives
  // the same value for hydration instead of reading its own clock on mount.
  // eslint-disable-next-line react-hooks/purity
  const initialNow = Date.now();
  return (
    <OperatorShell
      key={applicationId}
      initialNow={initialNow}
      initialSection={
        typeof chat === "string" || typeof message === "string"
          ? null
          : "overview"
      }
      // Only the QA fixture runs under a fixture root: its repositories are
      // synthetic, so GitHub links are shown but never followed.
      demo={Boolean(process.env.HALLVI_QA_ROOT)}
      applications={(await listApplications()).map(
        ({ id, name, repositoryOwner, repositoryName }) => ({
          id,
          name,
          repositoryOwner,
          repositoryName,
        }),
      )}
      // `npm run dev` starts a Drizzle Studio on this database and names its
      // port here, so the Database link cannot point at another checkout's.
      studioPort={Number(process.env.HALLVI_STUDIO_PORT) || undefined}
      initialView={JSON.stringify(view)}
      initialPiSetup={await getPiSetupStatus()}
    />
  );
}
