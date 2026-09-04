import { PiSetupScreen } from "@/components/server-guy/pi-setup-screen";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function PiSetupPage() {
  const initialStatus = await getPiSetupStatus();
  return <PiSetupScreen initialStatus={initialStatus} />;
}
