export interface RecordedRelease {
  id: string;
  title: string;
  revision: string;
  at: string;
  outcome: "deployed" | "failed" | "attempted";
}
export function projectRecords(
  information: Record<string, unknown>[] | undefined,
  applicationId: string,
): {
  release: { running: RecordedRelease | null; latest: RecordedRelease } | null;
  access: { url: string; mode: "private" | "public" } | null;
  checkedAt: string | null;
};
