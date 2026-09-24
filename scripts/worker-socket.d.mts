// Types for the plain-Node module the application, launchers and tests share.
export function workerSocketPath(databasePath: string): string;
export function holdWorker(
  databasePath: string,
  minutes?: number,
): Promise<{ held: boolean; busy: number; until: number } | null>;
