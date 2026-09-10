import { notFound } from "next/navigation";

import { MascotConcepts } from "@/components/server-guy/mascot-concepts/mascot-concepts";

export const dynamic = "force-dynamic";

/**
 * Mascot family exploration. Development only: Little Server and five
 * cousins in the same style, their expressions for each application state,
 * and working motion examples.
 */
export default function PrototypeMascotsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MascotConcepts />;
}
