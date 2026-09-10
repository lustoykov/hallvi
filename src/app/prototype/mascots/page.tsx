import { notFound } from "next/navigation";

import { MascotConcepts } from "@/components/server-guy/mascot-concepts/mascot-concepts";

export const dynamic = "force-dynamic";

/**
 * Mascot concept exploration. Development only: six characters, their
 * expressions for each application state, and working motion examples.
 */
export default function PrototypeMascotsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MascotConcepts />;
}
