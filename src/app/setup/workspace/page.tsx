import { WorkspaceSetupScreen } from "@/components/hallvi/workspace-setup-screen";
import { settingsPrototype } from "@/components/hallvi/model-settings-prototype/route";
import { setupReturnDestination } from "@/server/setup-return";
import { workspaceSettingStatus } from "@/server/workspace-isolation";

export const dynamic = "force-dynamic";

export default async function WorkspaceSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    application?: string | string[];
    chat?: string | string[];
    // PROTOTYPE
    variant?: string;
    shell?: string;
    state?: string;
  }>;
}) {
  const [initialStatus, params] = await Promise.all([
    workspaceSettingStatus(),
    searchParams,
  ]);
  const prototype = await settingsPrototype("workspace", params);
  if (prototype?.page) return prototype.page;
  return (
    <>
      <WorkspaceSetupScreen
        initialStatus={initialStatus}
        returnTo={(await setupReturnDestination(params)) ?? undefined}
      />
      {prototype?.bar}
    </>
  );
}
