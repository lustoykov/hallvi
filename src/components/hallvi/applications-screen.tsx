import { ApplicationsHome } from "./home/applications-home";

/**
 * One application as the list shows it: its condition in words, the stack
 * it records, and whether anything needs the user. Derived from records;
 * never a phase or a check count.
 */
export interface ApplicationListItem {
  id: string;
  name: string;
  source: string;
  condition: { tone: "live" | "warn" | "bad" | "muted"; text: string };
  /** "Web · PostgreSQL 16 · 3 jobs" or "Not deployed yet". */
  stack: string;
  attention: number;
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
