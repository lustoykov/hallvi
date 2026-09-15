import { RecoveryScreen } from "@/components/server-guy/recovery-screen";

export const dynamic = "force-dynamic";

/**
 * The copy of this controller the owner could come back from.
 *
 * Client-rendered because everything on it is an action — reading what would
 * go in, choosing a passphrase, writing the file — and none of it is state
 * worth rendering on the server.
 */
export default function RecoveryPage() {
  return <RecoveryScreen />;
}
