import { WhatsNewScreen } from "@/components/hallvi/whats-new-screen";
import { changelog } from "@/server/hallvi-release";
import { setupReturnDestination } from "@/server/setup-return";

export const dynamic = "force-dynamic";

export default async function WhatsNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    application?: string | string[];
    chat?: string | string[];
  }>;
}) {
  return (
    <WhatsNewScreen
      releases={changelog()}
      // Opened from an application's sidebar, it goes back to that
      // conversation the way Settings does.
      returnTo={setupReturnDestination(await searchParams) ?? undefined}
    />
  );
}
