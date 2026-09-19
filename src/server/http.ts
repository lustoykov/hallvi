import { NextResponse } from "next/server";

import {
  ExistingApplicationConflictError,
  NotFoundError,
} from "./applications";
import { PiUnavailableError } from "./pi";
import { WorkerRefusal, WorkerUnavailableError } from "./worker-link";

function statusFor(error: unknown) {
  if (error instanceof ExistingApplicationConflictError) return 409;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof PiUnavailableError) return 503;
  if (error instanceof WorkerUnavailableError) return 503;
  if (error instanceof WorkerRefusal && error.code !== "failed") return 409;
  return 400;
}

/**
 * Runs a Route Handler body. Return a Response to choose the status yourself;
 * any other value is sent as JSON with 200. Thrown errors become `{ error }`
 * with a status derived from the error class.
 */
export async function handle(work: () => unknown): Promise<Response> {
  try {
    const result = await work();
    return result instanceof Response ? result : NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Hallvi could not complete that request.",
      },
      { status: statusFor(error) },
    );
  }
}
