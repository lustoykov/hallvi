import { runPiWorker } from "./server/pi-worker";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());
runPiWorker(controller.signal).catch((error) => {
  console.error(
    error instanceof Error ? error.message : "The Pi worker could not start.",
  );
  process.exitCode = 1;
});
