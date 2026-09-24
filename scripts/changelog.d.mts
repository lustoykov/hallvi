export interface ChangelogRelease {
  version: string;
  date: string | null;
  /** The section's Markdown, without its heading. */
  notes: string;
}

export function releases(markdown: string): ChangelogRelease[];

export function releaseNotes(
  markdown: string,
  version: string,
  revision: string,
): string;
