import { WorkspaceSetupScreen } from "@/components/hallvi/workspace-setup-screen";
import { setupReturnDestination } from "@/server/setup-return";
import { workspaceSettingStatus } from "@/server/workspace-isolation";

export const dynamic = "force-dynamic";

export default async function WorkspaceSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    application?: string | string[];
    chat?: string | string[];
  }>;
}) {
  const [initialStatus, params] = await Promise.all([
    workspaceSettingStatus(),
    searchParams,
  ]);
  return (
    <WorkspaceSetupScreen
      initialStatus={initialStatus}
      returnTo={setupReturnDestination(params) ?? undefined}
    />
  );
}
