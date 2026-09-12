import { z } from "zod";

export const operatorSettingsSchema = z.object({
  permissionMode: z.enum(["always-ask", "pi-decides", "bypass"]),
  host: z
    .object({
      address: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/),
      user: z.string().regex(/^[a-z_][a-z0-9_-]*$/),
      port: z.number().int().min(1).max(65535),
      privateKeyPath: z.string().startsWith("/"),
      knownHostsPath: z.string().startsWith("/"),
      provider: z.string().optional(),
      serverId: z.string().optional(),
      providerConnectionId: z.string().optional(),
    })
    .nullable(),
});
export type OperatorSettings = z.infer<typeof operatorSettingsSchema>;
export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "saved-information"; id: string }
  | { type: "execution"; id: string };
export const informationInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(10000),
  evidence: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("message"), id: z.uuid() }),
        z.object({ type: z.literal("execution"), id: z.uuid() }),
        z.object({
          type: z.literal("url"),
          url: z.url().regex(/^https?:\/\//),
        }),
      ]),
    )
    .default([]),
  establishedAt: z.iso.datetime().nullable().default(null),
  presentation: z
    .object({
      views: z
        .array(
          z.enum([
            "overview",
            "architecture",
            "deployment",
            "history",
            "processes",
            "database",
            "cache",
            "jobs",
            "storage",
            "backups",
            "logs",
            "monitoring",
            "domains",
            "cdn",
            "security",
            "variables",
          ]),
        )
        .min(1),
      role: z.enum(["recommendation", "status", "outcome"]),
      status: z.enum(["info", "verified", "failed", "warning"]).default("info"),
      checks: z
        .array(
          z.object({
            label: z.string(),
            status: z.enum(["passed", "failed", "info"]),
          }),
        )
        .default([]),
      nextStep: z.string().optional(),
      url: z
        .url()
        .regex(/^https?:\/\//)
        .optional(),
    })
    .nullable()
    .default(null),
});
export type InformationInput = z.infer<typeof informationInputSchema>;
export type SavedInformation = InformationInput & {
  id: string;
  applicationId: string;
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
};
export type ConversationStatus =
  "idle" | "working" | "awaiting-approval" | "interrupted";
