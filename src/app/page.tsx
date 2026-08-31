import { OperatorShell } from "@/components/server-guy/operator-shell";
import { getPhaseOneView } from "@/server/phase-one";

export const dynamic = "force-dynamic";

export default function Home() {
  return <OperatorShell initialView={getPhaseOneView()} />;
}
