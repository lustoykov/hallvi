import { z } from "zod";

const name = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
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
  name,
  target,
  kind: z.enum(["database", "files"]),
  sqlite: z.string().max(250).nullable(),
});
export const configMountSchema = z.strictObject({
  name,
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
export const composeServiceSchema = z.strictObject({
  name: name.refine(
    (n) => !["app", "postgres"].includes(n),
    "Reserved service name",
  ),
  image: imageReferenceSchema,
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
