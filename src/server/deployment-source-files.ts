import { fetchRepositoryFile, fetchRepositoryTree } from "./github-inspection";
import { TAR_LIMITS } from "./tar";

/** Planning evidence is not a source bundle and must never be executed. */
export interface DeploymentSourceFiles {
  paths: string[];
  read(path: string): Promise<string>;
}

export async function deploymentSourceFiles(
  repository: string,
  revision: string,
  token: string,
  signal: AbortSignal,
): Promise<DeploymentSourceFiles> {
  const tree = await fetchRepositoryTree(
    repository,
    revision,
    token,
    signal,
    TAR_LIMITS.entries,
  );
  if (tree.truncated)
    throw new Error(
      "The repository file listing is incomplete; deployment inspection needs a complete listing.",
    );
  const files = tree.entries.filter((entry) => entry.type === "blob");
  return {
    paths: files.map((entry) => entry.path),
    async read(path) {
      const entry = files.find((file) => file.path === path);
      if (!entry)
        throw new Error("The file is absent from the selected revision.");
      const file = await fetchRepositoryFile(
        repository,
        revision,
        path,
        token,
        {
          signal,
          size: entry.size,
        },
      );
      if (file.binary)
        throw new Error("The selected file is binary, not source text.");
      return (
        file.content + (file.truncated ? "\n[File content truncated]" : "")
      );
    },
  };
}
