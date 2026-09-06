import { ExecutionSetupScreen } from "@/components/server-guy/execution-setup-screen";
import { getExecutionSetupStatus } from "@/server/execution-setup";

export const dynamic = "force-dynamic";

export default async function ExecutionSetupPage() {
  return (
    <ExecutionSetupScreen
      initialStatus={await getExecutionSetupStatus(false)}
    />
  );
}
