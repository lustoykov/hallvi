import { notFound } from "next/navigation";

import { KitHarness } from "@/components/server-guy/architecture-prototype/kit-harness";

export const dynamic = "force-dynamic";

/** Bench for the exploded-server 3D styles. Development only. */
export default function AnatomyKitsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitHarness />;
}
