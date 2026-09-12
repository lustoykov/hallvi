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
/**
 * What a record can speak about. Bounded on purpose: these are the subjects
 * the Architecture page actually reads, plus the application itself. A kind
 * is added when a concrete view needs it, never in advance — a vocabulary
 * nothing consumes is a second representation waiting to disagree with the
 * first.
 *
 * Deferred with their destinations: `database` (a volume covers the stored
 * data Architecture draws), `domain`, `certificate`'s siblings, `value`,
 * `config-file`, `job`, `cache`, `cdn`, `backup-plan`.
 */
export const subjectKinds = [
  "application",
  "host",
  "process",
  "volume",
  "door",
  "certificate",
  "monitor",
  "access",
] as const;
export type SubjectKind = (typeof subjectKinds)[number];
export const refSchema = z.strictObject({
  kind: z.enum(subjectKinds),
  id: z.string().trim().min(1).max(120),
});
export type Ref = z.infer<typeof refSchema>;

/**
 * What kind of assertion a fact or check makes — which is what decides how
 * fast it ages (§3). "The host is in Helsinki" and "SSH answered" are both
 * about the same host and age nothing alike, so freshness belongs here and
 * not to the subject. Choosing the claim is semantic, so it is Pi's;
 * choosing the horizon is arithmetic, so it belongs to the component.
 */
export const claimKinds = [
  "identity",
  "configuration",
  "reachability",
  "liveness",
  "contents",
] as const;
export type Claim = (typeof claimKinds)[number];

/** How we know: watched it, were told it, or only intend it (§4). */
export const basisKinds = ["observed", "planned", "reported"] as const;
export type Basis = (typeof basisKinds)[number];

/** The pieces a map may draw (§5.1). */
export const partKinds = [
  "controller",
  "source",
  "gate",
  "tls",
  "host",
  "web",
  "private",
  "volume",
  "offsite",
  "monitor",
] as const;
export type PartKind = (typeof partKinds)[number];

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
  z.strictObject({
    kind: z.literal("topology"),
    /**
     * `plan` is what lets a pre-deployment screen draw the whole map in
     * ghost with every part planned; `observed` is a map Pi read back.
     */
    from: z.enum(["plan", "observed"]),
    /**
     * Composition, and only composition. A part carries what it is and what
     * it is for; its facts, its presence and its checks are read from the
     * records that state it, so the map has no second copy of them to
     * disagree with. It does not declare anything absent either: a design
     * may draw a placeholder where something could be, but only a record
     * stating that subject can say it is not there.
     */
    parts: z
      .array(
        z.strictObject({
          id: z.string().trim().min(1).max(120),
          kind: z.enum(partKinds),
          name: z.string().trim().min(1).max(120),
          role: z.string().trim().min(1).max(200),
          /** The same thing said without jargon, for a reader who needs it. */
          plain: z.string().trim().min(1).max(300),
          owner: z.string().trim().min(1).max(120).optional(),
        }),
      )
      .max(24),
    edges: z
      .array(
        z.strictObject({
          from: z.string().trim().min(1).max(120),
          to: z.string().trim().min(1).max(120),
          /**
           * `loopback` is not `public` and not the container network: the
           * current deployment is reached through an SSH tunnel to the
           * host's own loopback, and drawing that as public was wrong.
           */
          network: z.enum(["public", "private", "loopback", "disk"]),
          label: z.string().trim().min(1).max(80).optional(),
        }),
      )
      .max(48)
      .default([]),
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
      /**
       * Everything this record concerns: links, never replacement. Additive
       * and unordered — it is what "show me everything that touched this"
       * reads, so no element of it is privileged over another.
       */
      about: z.array(refSchema).max(12).optional(),
      /**
       * At most one subject whose **current state** this record asserts. A
       * record without it never becomes the current state of anything,
       * however many things it is about: a deployment is an event, not the
       * state of the four things it touched. A record that would state two
       * subjects is two records.
       *
       * `presence` lives here because only a record speaking for a subject
       * may say the subject is not there. Absence is written, never inferred
       * from silence — silence means nobody looked.
       */
      states: z
        .strictObject({
          ref: refSchema,
          presence: z.enum(["present", "absent"]),
        })
        .optional(),
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
            /**
             * Stable machine key, so a later partial observation replaces
             * this check without erasing the ones it did not mention.
             * Optional in the schema and required at save: the presentation
             * column is JSON read back by cast rather than by parse, so
             * every record written before the contract carries none.
             */
            key: z.string().trim().min(1).max(60).optional(),
            label: z.string(),
            status: z.enum(["passed", "failed", "info"]),
            claim: z.enum(claimKinds).optional(),
            basis: z.enum(basisKinds).optional(),
            /**
             * What was checked — which is also what gives the check its
             * lane, falling back to the subject the record speaks for.
             */
            about: refSchema.optional(),
            detail: z.string().trim().min(1).max(300).optional(),
            /** Seconds, when Pi knows the real horizon: a lease, an expiry. */
            freshFor: z.number().int().min(1).optional(),
            /**
             * Superseded by `about`. Still read, so the deployment already
             * on record keeps its Overview lanes.
             */
            subject: z
              .enum(["application", "backups", "server", "access"])
              .optional(),
          }),
        )
        .default([]),
      /**
       * The values a design lays out: a place, a size, a price, an identity.
       * Prose cannot be laid out, so anything a reader would scan — and
       * anything a destination view needs to draw — belongs here rather than
       * inside the body. A value is printed, never computed, and never
       * coloured: the card's one certainty is in its header, and these are
       * the facts that certainty is about.
       */
      facts: z
        .array(
          z.object({
            /** Stable machine key; see the note on a check's key. */
            key: z.string().trim().min(1).max(60).optional(),
            label: z.string().trim().min(1).max(40),
            value: z.string().trim().min(1).max(160),
            claim: z.enum(claimKinds).optional(),
            /** How we know: watched it, were told it, or only intend it. */
            basis: z.enum(basisKinds).optional(),
            /** An identifier reads better in the monospaced face. */
            mono: z.boolean().optional(),
            /** Seconds, when Pi knows the real horizon. */
            freshFor: z.number().int().min(1).optional(),
          }),
        )
        .max(10)
        // Optional, not defaulted: the presentation column is stored as JSON
        // and read back by cast rather than parse, so every record written
        // before this field existed has no facts at all. A reader must cope
        // with that, and the type should say so.
        .optional(),
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
