import { ApplicationsHome } from "./home/applications-home";

/** One application as the list shows it, derived from saved records. */
export interface ApplicationListItem {
  id: string;
  name: string;
  source: string;
  condition: {
    tone: "live" | "warn" | "bad" | "muted";
    text: string;
    nextStep?: string;
  };
  /** "Web · PostgreSQL 16 · 3 jobs" or "Not deployed yet". */
  stack: string;
  /**
   * The recorded access URL, including its protocol and port.
   * Reference data may use a hostname.
   */
  address?: string | null;
}

export function ApplicationsScreen({
  applications,
  piReady,
}: {
  applications: ApplicationListItem[];
  piReady: boolean;
}) {
  return (
    <ApplicationsHome
      applications={applications.map((item) => ({
        ...item,
        href: `/applications/${item.id}`,
      }))}
      piReady={piReady}
    />
  );
}
