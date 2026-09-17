import {
  PiWorkerBusyError,
  PiWorkerDrainError,
  runPiWorker,
  WORKER_BUSY_EXIT,
} from "./server/pi-worker";
import { shutdownTracing } from "./server/tracing";
import { adoptLegacyEnvironment } from "../scripts/legacy-names.mjs";

adoptLegacyEnvironment();

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());
runPiWorker(controller.signal)
  .catch((error) => {
    controller.abort();
    console.error(
      error instanceof Error ? error.message : "The Pi worker could not start.",
    );
    if (error instanceof PiWorkerDrainError) process.exit(1);
    // A worker that stepped aside for a live one is not a failure to restart
    // into; its own exit code says which case this was.
    process.exitCode =
      error instanceof PiWorkerBusyError ? WORKER_BUSY_EXIT : 1;
  })
  .finally(shutdownTracing);
