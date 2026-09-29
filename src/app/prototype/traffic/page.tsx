import { notFound } from "next/navigation";

import { TrafficPreview } from "./traffic-preview";

export const dynamic = "force-dynamic";

/**
 * Traffic on invented numbers, in the real shell and pages, until the
 * collector's routes exist. Development only.
 */
export default function TrafficPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TrafficPreview />;
}
