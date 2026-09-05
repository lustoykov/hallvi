import { GithubSetupScreen } from "@/components/server-guy/github-setup-screen";
import { getGithubSetupStatus } from "@/server/github-setup";

export const dynamic = "force-dynamic";
export default async function GithubSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const [initialStatus, params] = await Promise.all([
    getGithubSetupStatus(),
    searchParams,
  ]);
  return (
    <GithubSetupScreen
      initialStatus={initialStatus}
      returnToAdd={params.from === "add"}
    />
  );
}
