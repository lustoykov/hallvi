import { redirect } from "next/navigation";

import { ApplicationsScreen } from "@/components/hallvi/applications-screen";
import { listApplicationItems } from "@/server/application-list";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = listApplicationItems();
  // With nothing added yet, the welcome is the home: it says what Hallvi is
  // and takes the repository, instead of an empty list with a button to it.
  if (!applications.length) redirect("/applications/new");
  return (
    <ApplicationsScreen
      applications={applications}
      piReady={(await getPiSetupStatus()).ready}
    />
  );
}
