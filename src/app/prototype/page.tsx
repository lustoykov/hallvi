import { notFound } from "next/navigation";

import { ReferenceIndex } from "@/components/server-guy/reference/reference-index";

export const dynamic = "force-dynamic";

/** The inventory of reference screens and scenarios. Development only. */
export default function PrototypeIndexPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReferenceIndex />;
}
