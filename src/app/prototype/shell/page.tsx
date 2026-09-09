import { notFound } from "next/navigation";

import { ShellVariants } from "@/components/server-guy/reference/shell-variants";

export const dynamic = "force-dynamic";

/**
 * Where the application identity belongs. Development only: the three
 * placements are the same component with a different `variant`, rendered
 * live so the choice is made by looking rather than by description.
 */
export default function PrototypeShellPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ShellVariants />;
}
