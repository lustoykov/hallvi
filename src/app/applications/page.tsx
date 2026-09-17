import { ApplicationsScreen } from "@/components/haldur/applications-screen";
import { listApplicationItems } from "@/server/application-list";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  return (
    <ApplicationsScreen
      applications={listApplicationItems()}
      piReady={(await getPiSetupStatus()).ready}
    />
  );
}
