import { isControllerHost } from "./controller-origin";
import { z } from "zod";

export const createApplicationRequestSchema = z.strictObject({
  requestKey: z.uuid({ error: "A unique creation request key is required." }),
  name: z.string().trim().min(1).max(120).optional(),
  repositoryUrl: z
    .string({ error: "Enter a GitHub repository URL." })
    .trim()
    .min(1, "Enter a GitHub repository URL.")
    .max(2_048, "Keep the GitHub repository URL under 2,048 characters."),
});

export const createChatRequestSchema = z.strictObject({
  title: z
    .string({ error: "Chat title must be text." })
    .trim()
    .max(120, "Keep the Chat title under 120 characters.")
    .optional(),
});

export const sendChatMessageRequestSchema = z.strictObject({
  message: z
    .string({ error: "Write a message first." })
    .trim()
    .min(1, "Write a message first.")
    .max(5_000, "Keep this message under 5,000 characters."),
  requestKey: z.uuid({ error: "A unique request key is required." }),
  /** After Pi's current work, or into it at its next step. */
  delivery: z.enum(["next", "steer"]).optional(),
});

export class RequestValidationError extends Error {}

export const removeApplicationRequestSchema = z.strictObject({
  repository: z.string().min(1).max(2_048),
});

export const disconnectPiRequestSchema = z.strictObject({
  confirm: z.literal("disconnect"),
});

/**
 * Reject cross-origin browser mutations. Origin-less local clients remain
 * supported.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const destination = new URL(request.url);
  // Next normalizes loopback request URLs to localhost. The incoming Host still
  // identifies the browser's destination (e.g. 127.0.0.1:3000); don't trust
  // X-Forwarded-Host.
  const host = request.headers.get("host");
  if (!isControllerHost(host ?? destination.host))
    throw new RequestValidationError(
      "This controller only accepts loopback hosts.",
    );
  if (host) destination.host = host;
  if (origin && origin !== destination.origin) {
    throw new RequestValidationError("Cross-origin requests are not allowed.");
  }
}

const MAX_JSON_REQUEST_CHARACTERS = 16_384;

function firstIssue(error: z.ZodError) {
  return (
    error.issues[0]?.message ?? "The input did not match the required schema."
  );
}

export async function parseJsonRequest<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  // All JSON mutation routes share this boundary, including simple text/plain
  // POSTs.
  assertSameOrigin(request);
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_JSON_REQUEST_CHARACTERS
  ) {
    throw new RequestValidationError(
      "Keep the request body under 16,384 characters.",
    );
  }

  const text = await request.text();
  if (text.length > MAX_JSON_REQUEST_CHARACTERS) {
    throw new RequestValidationError(
      "Keep the request body under 16,384 characters.",
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new RequestValidationError("Request body must be valid JSON.");
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    throw new RequestValidationError(firstIssue(result.error));
  }
  return result.data;
}
