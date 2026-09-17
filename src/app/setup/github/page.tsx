import { GithubSetupScreen } from "@/components/haldur/github-setup-screen";
import { getGithubSetupStatus } from "@/server/github-setup";
import { setupReturnDestination } from "@/server/setup-return";

export const dynamic = "force-dynamic";
export default async function GithubSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    application?: string | string[];
    chat?: string | string[];
  }>;
}) {
  const [initialStatus, params] = await Promise.all([
    getGithubSetupStatus(),
    searchParams,
  ]);
  return (
    <GithubSetupScreen
      initialStatus={initialStatus}
      returnToAdd={params.from === "add"}
      returnTo={setupReturnDestination(params) ?? undefined}
    />
  );
}
