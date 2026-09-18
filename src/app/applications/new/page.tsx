import { NewApplicationScreen } from "@/components/hallvi/new-application-screen";
import {
  currentGithubConnectionId,
  readGithubConnection,
} from "@/server/github-connection";

export const dynamic = "force-dynamic";

export default function NewApplicationPage() {
  const githubLogin = currentGithubConnectionId()
    ? (readGithubConnection()?.account.login ?? null)
    : null;
  return <NewApplicationScreen githubLogin={githubLogin} />;
}
