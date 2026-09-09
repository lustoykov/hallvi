import { runOperationWorker } from "./server/operation-worker";
import { PiWorkerDrainError, runPiWorker } from "./server/pi-worker";
import { shutdownTracing } from "./server/tracing";

import { runDeploymentWorker } from "./server/deployment-worker";

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => controller.abort());
Promise.all([
  runPiWorker(controller.signal),
  runOperationWorker(controller.signal),
  runDeploymentWorker(controller.signal),
])
  .catch((error) => {
    controller.abort();
    console.error(
      error instanceof Error ? error.message : "The Pi worker could not start.",
    );
    if (error instanceof PiWorkerDrainError) process.exit(1);
    process.exitCode = 1;
  })
  .finally(shutdownTracing);
