import { z } from "zod";

export const serviceNameSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const target = z
  .string()
  .regex(/^\/(?!\/)(?!.*\.\.)(?!.*[\r\n])[A-Za-z0-9_./-]+$/)
  .max(250);
export const imageReferenceSchema = z
  .string()
  .regex(
    /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[0-9a-f]{64})$/,
  );
export const volumeMountSchema = z.strictObject({
  name: serviceNameSchema,
  target,
  kind: z.enum(["database", "files"]),
  readOnly: z.boolean().optional(),
  sqlite: z.string().max(250).nullable(),
});
export const configMountSchema = z.strictObject({
  name: serviceNameSchema,
  target,
  content: z.string().max(20000),
});
export const environmentSchema = z
  .array(
    z.strictObject({
      name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
      value: z.string().max(1000),
    }),
  )
  .max(30);
export const sourcePathSchema = z
  .string()
  .regex(/^(?!\/)(?!.*\.\.)(?!.*[\r\n])[A-Za-z0-9_./-]+$/);
export const sourceBuildSchema = z.strictObject({
  context: sourcePathSchema,
  dockerfile: sourcePathSchema,
  generatedDockerfile: z.string().max(12000).nullable().optional(),
});
export const composeServiceSchema = z.strictObject({
  name: serviceNameSchema.refine(
    (n) => !["app", "postgres"].includes(n),
    "Reserved service name",
  ),
  image: imageReferenceSchema.optional(),
  /** Reuse the exact image of another service. */
  imageFrom: serviceNameSchema.optional(),
  build: sourceBuildSchema.optional(),
  role: z.enum(["web", "worker", "broker", "service"]).optional(),
  /** Read-only readiness command inside this service, never the host. */
  healthCommand: z.array(z.string().min(1).max(500)).min(1).max(20).optional(),
  command: z.array(z.string().min(1).max(500)).max(20).nullable(),
  environment: environmentSchema,
  volumes: z.array(volumeMountSchema).max(8),
  configs: z.array(configMountSchema).max(8),
  port: z.number().int().min(1).max(65535).nullable(),
  healthPath: z
    .string()
    .regex(/^\/(?!\/)[^\s]*$/)
    .max(200)
    .nullable(),
  checks: z
    .array(
      z.strictObject({
        path: z
          .string()
          .regex(/^\/(?!\/)[^\s]*$/)
          .max(300),
        contains: z.string().min(1).max(300),
        jsonPath: z
          .string()
          .regex(/^[a-zA-Z0-9_.]+$/)
          .nullable(),
        equals: z.union([z.string(), z.number(), z.boolean()]).nullable(),
      }),
    )
    .max(5),
});

export const dependencySchema = z.strictObject({
  service: serviceNameSchema,
  needs: serviceNameSchema,
  condition: z.enum(["started", "healthy"]),
});
export const inputBindingSchema = z.strictObject({
  service: serviceNameSchema,
  variable: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  input: z
    .string()
    .regex(/^[A-Z_][A-Z0-9_]*$/)
    .optional(),
  connection: z.literal("postgres").optional(),
});
