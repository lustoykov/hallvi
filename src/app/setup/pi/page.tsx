import { PiSetupScreen } from "@/components/haldur/pi-setup-screen";
import { getPiSetupStatus } from "@/server/pi-setup";
import { setupReturnDestination } from "@/server/setup-return";

export const dynamic = "force-dynamic";

export default async function PiSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    application?: string | string[];
    chat?: string | string[];
  }>;
}) {
  const [initialStatus, params] = await Promise.all([
    getPiSetupStatus(),
    searchParams,
  ]);
  return (
    <PiSetupScreen
      initialStatus={initialStatus}
      // Checked against the records here, so the only thing a query string
      // can do is name a conversation that exists.
      returnTo={setupReturnDestination(params) ?? undefined}
    />
  );
}
