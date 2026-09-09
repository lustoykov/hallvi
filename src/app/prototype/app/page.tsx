import { notFound } from "next/navigation";

import { ReferenceShell } from "@/components/server-guy/reference/reference-shell";

export const dynamic = "force-dynamic";

/**
 * The application workspace reference. Development only: every value it
 * shows is invented, and nothing here touches a host or the database.
 */
export default async function PrototypeApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : undefined;
  };
  const scenario = one("scenario") === "rich" ? "rich" : "simple";
  const step = Number.parseInt(one("step") ?? "0", 10);
  return (
    <ReferenceShell
      key={scenario}
      scenarioId={scenario}
      initialStep={Number.isFinite(step) ? step : 0}
      initialSection={one("section") ?? null}
      initialChat={one("chat") ?? null}
    />
  );
}
