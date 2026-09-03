import { z } from "zod";

import { isApprovalMode } from "./types";
import type { ApprovalMode, PiReply } from "./types";

const approvalModeSchema = z.custom<ApprovalMode>(isApprovalMode, {
  error: "Choose a valid permission policy.",
});

export const createApplicationRequestSchema = z.strictObject({
  repositoryUrl: z
    .string({ error: "Enter a GitHub repository URL." })
    .trim()
    .min(1, "Enter a GitHub repository URL.")
    .max(2_048, "Keep the GitHub repository URL under 2,048 characters."),
  approvalMode: approvalModeSchema,
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
});

const piDecisionSchema = z.strictObject({
  kind: z.literal("launch-priority", {
    error: "Pi returned an unsupported Decision kind.",
  }),
  value: z
    .string({ error: "Pi returned a Decision without a text value." })
    .trim()
    .min(1, "Pi returned an empty Decision value.")
    .max(300, "Pi returned a Decision value longer than 300 characters."),
  replaces: z
    .uuid({ error: "Pi returned an invalid Decision replacement ID." })
    .optional(),
});

export const piReplySchema: z.ZodType<PiReply> = z.strictObject({
  message: z
    .string({ error: "Pi returned no user-facing message." })
    .trim()
    .min(1, "Pi returned no user-facing message.")
    .max(10_000, "Pi returned a message longer than 10,000 characters."),
  decisions: z
    .array(piDecisionSchema, { error: "Pi returned no valid Decisions array." })
    .max(20, "Pi returned more than 20 Decisions in one turn."),
});

export class RequestValidationError extends Error {}

const MAX_JSON_REQUEST_CHARACTERS = 16_384;

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "The input did not match the required schema.";
}

export async function parseJsonRequest<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_REQUEST_CHARACTERS) {
    throw new RequestValidationError("Keep the request body under 16,384 characters.");
  }

  const text = await request.text();
  if (text.length > MAX_JSON_REQUEST_CHARACTERS) {
    throw new RequestValidationError("Keep the request body under 16,384 characters.");
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

export function parsePiReplyValue(input: unknown): PiReply {
  const result = piReplySchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Pi returned an invalid structured reply: ${firstIssue(result.error)}`);
  }
  return result.data;
}
