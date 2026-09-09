// The Settings projection of the controller host's execution environment:
// the last engine check, and the state of an image preparation started from
// the page. Preparation runs in this process and reports its progress; the
// page polls while it is running.
import { CONFORMANCE_DEFINITION } from "./conformance-definition";
import { lastKnownEnvironment } from "./conformance-executor";
import {
  checkExecutionEnvironment,
  prepareExecutionEnvironment,
} from "./phase-three";
import type { ExecutionEnvironmentStatus } from "./types";

export interface ExecutionSetupStatus {
  environment: ExecutionEnvironmentStatus | null;
  preparation: {
    running: boolean;
    message: string | null;
    error: string | null;
    finishedAt: string | null;
  };
  images: { runner: string; database: string };
  docs: { install: string; getDocker: string };
}

const preparation: ExecutionSetupStatus["preparation"] = {
  running: false,
  message: null,
  error: null,
  finishedAt: null,
};

export async function getExecutionSetupStatus(
  refresh: boolean,
): Promise<ExecutionSetupStatus> {
  const environment = refresh
    ? await checkExecutionEnvironment()
    : (lastKnownEnvironment() ?? (await checkExecutionEnvironment()));
  return {
    environment,
    preparation: { ...preparation },
    images: {
      runner: CONFORMANCE_DEFINITION.runnerImage,
      database: CONFORMANCE_DEFINITION.databaseImage,
    },
    docs: {
      install: "https://docs.docker.com/engine/install/",
      getDocker: "https://docs.docker.com/get-started/get-docker/",
    },
  };
}

/** Starts image preparation once; a second request reports the running one. */
export async function requestPreparation(): Promise<ExecutionSetupStatus> {
  if (!preparation.running) {
    preparation.running = true;
    preparation.message = "Checking the engine";
    preparation.error = null;
    preparation.finishedAt = null;
    void prepareExecutionEnvironment((message) => {
      preparation.message = message;
    })
      .then((status) => {
        preparation.error = status.verified
          ? null
          : `The engine is ${status.state}; nothing was prepared.`;
      })
      .catch((error) => {
        preparation.error =
          error instanceof Error ? error.message : "Preparation failed.";
      })
      .finally(() => {
        preparation.running = false;
        preparation.finishedAt = new Date().toISOString();
        preparation.message = null;
      });
  }
  return getExecutionSetupStatus(false);
}
