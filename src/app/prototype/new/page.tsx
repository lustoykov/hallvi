import { notFound } from "next/navigation";

import { NewApplicationScreen } from "@/components/server-guy/new-application-screen";

export const dynamic = "force-dynamic";

export default async function PrototypeNewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  return (
    <NewApplicationScreen
      preview
      githubLogin={state === "no-github" ? null : "example"}
    />
  );
}
