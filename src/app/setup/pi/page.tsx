import { PiSetupScreen } from "@/components/hallvi/pi-setup-screen";
import { settingsPrototype } from "@/components/hallvi/model-settings-prototype/route";
import { getPiSetupStatus } from "@/server/pi-setup";
import { setupReturnDestination } from "@/server/setup-return";

export const dynamic = "force-dynamic";

export default async function PiSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    application?: string | string[];
    chat?: string | string[];
    // PROTOTYPE — Settings → Model directions.
    variant?: string;
    shell?: string;
    state?: string;
  }>;
}) {
  const [initialStatus, params] = await Promise.all([
    getPiSetupStatus(),
    searchParams,
  ]);
  const prototype = await settingsPrototype("pi", params);
  if (prototype?.page) return prototype.page;
  return (
    <>
      <PiSetupScreen
        initialStatus={initialStatus}
        // Checked against the records here, so the only thing a query string
        // can do is name a conversation that exists.
        returnTo={(await setupReturnDestination(params)) ?? undefined}
      />
      {prototype?.bar}
    </>
  );
}
