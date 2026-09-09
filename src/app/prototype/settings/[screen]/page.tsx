import { notFound } from "next/navigation";

import { ConnectionsScreen } from "@/components/server-guy/connections-screen";
import { referenceConnections } from "@/components/server-guy/reference/screens";

export const dynamic = "force-dynamic";

/**
 * Settings in the reference. Connections is the designed home for every
 * provider; the existing ChatGPT, GitHub and Execution screens run as they
 * are on the same development server, in their not-connected states.
 */
export default async function PrototypeSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const [{ screen }, { state }] = await Promise.all([params, searchParams]);
  if (screen !== "connections") notFound();
  return (
    <ConnectionsScreen
      connections={referenceConnections(
        typeof state === "string" ? state : "connected",
      )}
      prototype
    />
  );
}
