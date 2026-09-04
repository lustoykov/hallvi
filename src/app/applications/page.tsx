import { ApplicationsScreen } from "@/components/server-guy/applications-screen";
import { listApplicationSummaries } from "@/server/phase-one";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  return <ApplicationsScreen applications={listApplicationSummaries()} piReady={(await getPiSetupStatus()).ready} />;
}
