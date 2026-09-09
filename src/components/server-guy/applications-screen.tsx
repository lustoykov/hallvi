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
  protection: string;
}

export function ApplicationsScreen({
  applications,
  piReady,
  preview = false,
  hrefFor = (id) => `/applications/${id}`,
}: {
  applications: ApplicationListItem[];
  piReady: boolean;
  preview?: boolean;
  hrefFor?: (id: string) => string;
}) {
  return (
    <ApplicationsHome
      applications={applications.map((item) => ({
        ...item,
        href: hrefFor(item.id),
      }))}
      piReady={piReady}
      preview={preview}
    />
  );
}
