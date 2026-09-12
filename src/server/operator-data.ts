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
export const informationContentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("deployment"),
    repositoryUrl: z.url().regex(/^https:\/\//),
    revision: z.string().regex(/^[0-9a-f]{7,64}$/),
    image: z.string().min(1).max(300),
    server: z.string().min(1).max(200),
    changes: z.array(z.string().min(1).max(500)).max(10).default([]),
  }),
  z.strictObject({
    kind: z.literal("application-access"),
    mode: z.enum(["private", "public"]),
    server: z.string().min(1).max(200),
    localPort: z.number().int().min(1024).max(65535).optional(),
    remotePort: z.number().int().min(1).max(65535).optional(),
  }),
]);
export type InformationContent = z.infer<typeof informationContentSchema>;
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
      content: informationContentSchema.optional(),
      url: z
        .url()
        .regex(/^https?:\/\//)
        .optional(),
    })
    .superRefine((value, context) => {
      const content = value.content;
      if (content?.kind !== "application-access") return;
      if (!value.url)
        context.addIssue({
          code: "custom",
          path: ["url"],
          message: "Application access requires its browser URL.",
        });
      if (content.mode === "private") {
        if (!content.localPort || !content.remotePort)
          context.addIssue({
            code: "custom",
            path: ["content"],
            message: "Private SSH access requires localPort and remotePort.",
          });
        if (value.url && URL.canParse(value.url)) {
          const url = new URL(value.url);
          if (
            url.hostname !== "127.0.0.1" ||
            Number(url.port || (url.protocol === "https:" ? 443 : 80)) !==
              content.localPort
          )
            context.addIssue({
              code: "custom",
              path: ["url"],
              message:
                "Private access URL must use 127.0.0.1 and the declared localPort.",
            });
        }
      }
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
