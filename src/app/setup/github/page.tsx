import { GithubSetupScreen } from "@/components/hallvi/github-setup-screen";
import { getGithubSetupStatus } from "@/server/github-setup";
import { settingsPrototype } from "@/components/hallvi/model-settings-prototype/route";
import { setupReturnDestination } from "@/server/setup-return";

export const dynamic = "force-dynamic";
export default async function GithubSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    application?: string | string[];
    chat?: string | string[];
    // PROTOTYPE
    variant?: string;
    shell?: string;
    state?: string;
  }>;
}) {
  const [initialStatus, params] = await Promise.all([
    getGithubSetupStatus(),
    searchParams,
  ]);
  const prototype = await settingsPrototype("github", params);
  if (prototype?.page) return prototype.page;
  return (
    <>
      <GithubSetupScreen
        initialStatus={initialStatus}
        returnToAdd={params.from === "add"}
        returnTo={(await setupReturnDestination(params)) ?? undefined}
      />
      {prototype?.bar}
    </>
  );
}
