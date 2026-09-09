import { notFound } from "next/navigation";

import { ApplicationsScreen } from "@/components/server-guy/applications-screen";
import { referenceApplicationItems } from "@/components/server-guy/reference/screens";

export const dynamic = "force-dynamic";

export default async function PrototypeApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  return (
    <ApplicationsScreen
      applications={state === "empty" ? [] : referenceApplicationItems()}
      piReady={state !== "no-chatgpt"}
      hrefFor={(id) =>
        `/prototype/app?scenario=${id === "ref-status" ? "simple" : "rich"}&step=${id === "ref-status" ? 4 : 13}`
      }
    />
  );
}
