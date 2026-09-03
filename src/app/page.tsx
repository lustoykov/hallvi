import { OperatorShell } from "@/components/server-guy/operator-shell";
import { getPhaseOneOperatorView } from "@/server/phase-one";
import { getPiSetupStatus } from "@/server/pi-setup";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (
    <OperatorShell
      initialPiSetup={await getPiSetupStatus()}
      initialView={getPhaseOneOperatorView()}
    />
  );
}
