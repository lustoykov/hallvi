import { PiWorkerDrainError, runPiWorker } from "./server/pi-worker";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());
runPiWorker(controller.signal).catch((error) => {
  console.error(
    error instanceof Error ? error.message : "The Pi worker could not start.",
  );
  if (error instanceof PiWorkerDrainError) process.exit(1);
  process.exitCode = 1;
});
