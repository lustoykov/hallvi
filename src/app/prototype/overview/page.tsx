import { notFound } from "next/navigation";

import { OverviewPreview } from "./overview-preview";

export const dynamic = "force-dynamic";

/**
 * PROTOTYPE · prototype/overview-directions · throwaway.
 * Five directions for a deployed application's Overview, in the real shell
 * and page on invented numbers. Development only.
 */
export default function OverviewPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OverviewPreview />;
}
