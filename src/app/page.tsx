import { OperatorShell } from "@/components/server-guy/operator-shell";
import { getPhaseOneOperatorView } from "@/server/phase-one";

export const dynamic = "force-dynamic";

export default function Home() {
  return <OperatorShell initialView={getPhaseOneOperatorView()} />;
}
