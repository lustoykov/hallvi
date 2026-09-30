// PROTOTYPE — what each settings route renders while the redesign is being
// chosen: the new design by default, today's page with ?variant=current.

import { listApplications } from "@/server/db";
import { getPiSetupStatus } from "@/server/pi-setup";

import { SettingsPrototype } from ".";
import { PrototypeSwitcher, type SettingsPage } from "./switcher";

type Params = {
  variant?: string | string[];
  shell?: string | string[];
  state?: string | string[];
};
const one = (value: string | string[] | undefined, fallback: string) =>
  typeof value === "string" ? value : fallback;

export async function settingsPrototype(page: SettingsPage, params: Params) {
  if (process.env.NODE_ENV === "production") return null;
  const variant = one(params.variant, "A");
  const shell = one(params.shell, "tabs");
  const state = one(params.state, page === "workspace" ? "none" : "none");
  if (variant === "current")
    return {
      bar: (
        <PrototypeSwitcher
          page={page}
          variant={variant}
          shell={shell}
          state={state}
        />
      ),
    };
  const applications = (await listApplications()).map((application) => ({
    id: application.id,
    name: application.name,
    repository: `${application.repositoryOwner}/${application.repositoryName}`,
  }));
  return {
    page: (
      <SettingsPrototype
        page={page}
        shell={shell}
        state={state}
        status={await getPiSetupStatus()}
        applications={applications}
      />
    ),
  };
}
