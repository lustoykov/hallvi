import type { ApplicationListItem } from "@/components/server-guy/applications-screen";
import { listApplications } from "./db";
import { listInformation } from "./saved-information";
export function listApplicationItems(): ApplicationListItem[] {
  return listApplications().map((application) => {
    const records = listInformation(application.id);
    return {
      id: application.id,
      name: application.name,
      source: `${application.repositoryOwner}/${application.repositoryName}`,
      condition: { tone: "muted", text: "Open application" },
      stack: "",
      protection: "",
      attention: records.filter(
        (r) => r.presentation?.role === "recommendation",
      ).length,
    };
  });
}
