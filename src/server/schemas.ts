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

/** Images the owner attaches to a message, as the model reads them. */
export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export const MAX_IMAGES = 4;
/**
 * Base64 characters per image: about 1.8 MB of image, so four fit under the
 * 10 MB a request may carry through the proxy.
 */
export const MAX_IMAGE_CHARACTERS = 2_500_000;

export const sendChatMessageRequestSchema = z
  .strictObject({
    message: z
      .string({ error: "Write a message first." })
      .trim()
      .max(5_000, "Keep this message under 5,000 characters."),
    requestKey: z.uuid({ error: "A unique request key is required." }),
    /** After Pi's current work, or into it at its next step. */
    delivery: z.enum(["next", "steer"]).optional(),
    images: z
      .array(
        z.strictObject({
          mimeType: z.enum(IMAGE_TYPES, {
            error: "Attach a PNG, JPEG, WebP or GIF image.",
          }),
          data: z
            .base64()
            .max(MAX_IMAGE_CHARACTERS, "Attach images under 1.8 MB each."),
        }),
      )
      .max(MAX_IMAGES, `Attach at most ${MAX_IMAGES} images.`)
      .optional(),
  })
  .refine((input) => input.message || input.images?.length, {
    error: "Write a message first.",
  });

/** A message with its images is far larger than any other request. */
export const MAX_MESSAGE_REQUEST_CHARACTERS =
  MAX_IMAGES * MAX_IMAGE_CHARACTERS + 16_384;

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
const tooLarge = (max: number) =>
  `Keep the request body under ${max.toLocaleString("en-US")} characters.`;

function firstIssue(error: z.ZodError) {
  return (
    error.issues[0]?.message ?? "The input did not match the required schema."
  );
}

export async function parseJsonRequest<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxCharacters = MAX_JSON_REQUEST_CHARACTERS,
): Promise<z.output<T>> {
  // All JSON mutation routes share this boundary, including simple text/plain
  // POSTs.
  assertSameOrigin(request);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxCharacters) {
    throw new RequestValidationError(tooLarge(maxCharacters));
  }

  const text = await request.text();
  if (text.length > maxCharacters) {
    throw new RequestValidationError(tooLarge(maxCharacters));
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
