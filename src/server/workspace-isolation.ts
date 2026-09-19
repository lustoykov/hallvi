import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { DockerClient, resolveDockerEndpoint } from "./docker";
import { piConfigDir } from "./pi-configuration";

/**
 * Where Pi works on the repository copy: directly on this computer (the
 * default) or in a local Docker container the owner chose for isolation.
 * One choice for the installation; it never changes by itself.
 */
export const workspaceIsolationSchema = z.strictObject({
  isolation: z.enum(["direct", "docker"]),
});
export type WorkspaceIsolation = z.infer<
  typeof workspaceIsolationSchema
>["isolation"];

function settingPath() {
  return join(piConfigDir(), "workspace.json");
}

/**
 * The saved choice. No file means the default; an unreadable file is an
 * error rather than the default, because reading a Docker choice as "direct"
 * would be the silent fallback this setting exists to prevent.
 */
export function workspaceIsolation(): WorkspaceIsolation {
  let text: string;
  try {
    text = readFileSync(settingPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "direct";
    throw error;
  }
  const parsed = workspaceIsolationSchema.safeParse(
    (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success)
    throw new Error(
      "The workspace setting could not be read. Choose where Pi works again in Settings → Workspace.",
    );
  return parsed.data.isolation;
}

export function saveWorkspaceIsolation(isolation: WorkspaceIsolation) {
  mkdirSync(piConfigDir(), { recursive: true, mode: 0o700 });
  const temporary = `${settingPath()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ isolation }), { mode: 0o600 });
  renameSync(temporary, settingPath());
}

/** Why the local Docker Engine cannot be used right now, or null if it can. */
export async function dockerProblem(): Promise<string | null> {
  const endpoint = resolveDockerEndpoint();
  if (!endpoint) return "No local Docker Engine was found.";
  if (endpoint.kind !== "unix")
    return `Docker is configured for ${endpoint.url}, which is not a local socket.`;
  try {
    const response = await new DockerClient(endpoint.path).request("/_ping", {
      timeoutMs: 3_000,
    });
    return response.status < 400
      ? null
      : `The Docker Engine at ${endpoint.path} answered with status ${response.status}.`;
  } catch (error) {
    return `Docker is not answering at ${endpoint.path} (${error instanceof Error ? error.message : String(error)}).`;
  }
}

/** The setting and, when Docker is chosen, whether it can be used now. */
export async function workspaceSettingStatus() {
  let isolation: WorkspaceIsolation;
  try {
    isolation = workspaceIsolation();
  } catch (error) {
    return {
      isolation: null,
      problem: (error as Error).message,
      dockerProblem: await dockerProblem(),
    };
  }
  const docker = await dockerProblem();
  return {
    isolation,
    problem: isolation === "docker" ? docker : null,
    dockerProblem: docker,
  };
}
export type WorkspaceSettingStatus = Awaited<
  ReturnType<typeof workspaceSettingStatus>
>;
