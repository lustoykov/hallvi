import { PiSetupScreen } from "@/components/hallvi/pi-setup-screen";
import { ModelSettingsPrototype } from "@/components/hallvi/model-settings-prototype";
import { PrototypeSwitcher } from "@/components/hallvi/model-settings-prototype/switcher";
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
    state?: string;
  }>;
}) {
  const [initialStatus, params] = await Promise.all([
    getPiSetupStatus(),
    searchParams,
  ]);
  // PROTOTYPE — ?variant=A|B|C (default A), ?variant=current for today's page.
  const variant = typeof params.variant === "string" ? params.variant : "A";
  const state = typeof params.state === "string" ? params.state : "none";
  if (variant !== "current" && process.env.NODE_ENV !== "production")
    return (
      <ModelSettingsPrototype
        variant={variant}
        state={state}
        status={initialStatus}
      />
    );
  return (
    <>
      <PiSetupScreen
        initialStatus={initialStatus}
        // Checked against the records here, so the only thing a query string
        // can do is name a conversation that exists.
        returnTo={(await setupReturnDestination(params)) ?? undefined}
      />
      <PrototypeSwitcher variant={variant} state={state} />
    </>
  );
}
