// Schema v14, called only by the offline, backed-up schema preparation
// command. Retires the phase, contract, conformance and publication workflow
// into retained application records, and converts retired deployment plans
// into native configurations once. Nothing here runs at application runtime:
// after it commits, no retired table, command or plan remains to be read.
import { createHash, randomUUID } from "node:crypto";

export const RETIRED_TABLES = [
  "phase_workspaces",
  "application_contracts",
  "conformance_proposals",
  "conformance_runs",
  "acceptance_checks",
  "publication_grants",
  "application_previews",
  "preparation_branches",
  "application_operation_processes",
];
const RETAINED_TABLES = [
  "applications",
  "chats",
  "messages",
  "pi_runs",
  "chat_summaries",
  "decisions",
  "observations",
  "activity_events",
  "deployments",
  "application_operations",
];
const RETIRED_COMMANDS = new Set([
  "start-preparation",
  "refresh-preparation",
  "publish-proposal",
  "publish-checkpoint",
  "refresh-candidate",
  "return-change",
  "grant-publication",
]);
const RETIRED_PRECONDITIONS = ["contract", "permissionPolicy"];
/** The recovery input the runtime reads before releasing a retired hold. */
export const ATTESTATION_INPUT = "What you verified";
const DATABASE_PASSWORD = "SERVER_GUY_DATABASE_PASSWORD";
const JSON_COLUMNS = {
  phase_workspaces: ["deliverable_evidence"],
  application_contracts: ["body_json"],
  conformance_proposals: [
    "changes_json",
    "mapping_json",
    "approval_json",
    "publication_json",
    "external_json",
    "candidate_json",
    "verification_json",
  ],
  conformance_runs: ["source_json", "configuration_json", "results_json"],
  acceptance_checks: ["steps_json", "evidence_json"],
  publication_grants: ["verified_permissions_json"],
  application_previews: ["record"],
  preparation_branches: ["record"],
};

// Exact v14 DDL of the tables whose foreign keys must be rebuilt, so the
// following schema push finds nothing to change.
const REBUILT = {
  chats: {
    columns: [
      ["id", null],
      ["application_id", null],
      ["title", null],
      ["created_at", null],
      ["archived_at", "NULL"],
      ["native_session_id", "NULL"],
    ],
    sql: `(
	\`id\` text PRIMARY KEY NOT NULL,
	\`application_id\` text NOT NULL,
	\`title\` text NOT NULL,
	\`created_at\` text NOT NULL,
	\`archived_at\` text,
	\`native_session_id\` text,
	FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
    indexes: [],
  },
  pi_runs: {
    columns: [
      ["id", null],
      ["application_id", null],
      ["chat_id", null],
      ["user_message_id", null],
      ["assistant_message_id", null],
      ["request_key", null],
      ["retry_of_id", "NULL"],
      ["status", null],
      ["revision", "0"],
      ["error", "NULL"],
      ["pi_calls", "0"],
      ["created_at", null],
      ["started_at", "NULL"],
      ["finished_at", "NULL"],
    ],
    sql: `(
	\`id\` text PRIMARY KEY NOT NULL,
	\`application_id\` text NOT NULL,
	\`chat_id\` text NOT NULL,
	\`user_message_id\` text NOT NULL,
	\`assistant_message_id\` text NOT NULL,
	\`request_key\` text NOT NULL,
	\`retry_of_id\` text,
	\`status\` text NOT NULL,
	\`revision\` integer DEFAULT 0 NOT NULL,
	\`error\` text,
	\`pi_calls\` integer DEFAULT 0 NOT NULL,
	\`created_at\` text NOT NULL,
	\`started_at\` text,
	\`finished_at\` text,
	FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`chat_id\`) REFERENCES \`chats\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`user_message_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`assistant_message_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
    indexes: [
      "CREATE INDEX `idx_pi_runs_chat` ON `pi_runs` (`chat_id`)",
      "CREATE INDEX `idx_pi_runs_queue` ON `pi_runs` (`status`,`created_at`)",
      "CREATE UNIQUE INDEX `pi_runs_assistant_message_id_unique` ON `pi_runs` (`assistant_message_id`)",
      "CREATE UNIQUE INDEX `pi_runs_chat_id_request_key_unique` ON `pi_runs` (`chat_id`,`request_key`)",
      "CREATE UNIQUE INDEX `pi_runs_retry_of_id_unique` ON `pi_runs` (`retry_of_id`)",
    ],
  },
  activity_events: {
    sql: `(
	\`id\` text PRIMARY KEY NOT NULL,
	\`application_id\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`summary\` text NOT NULL,
	\`detail\` text NOT NULL,
	\`created_at\` text NOT NULL,
	FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
    indexes: [
      'CREATE INDEX `idx_activity_application` ON `activity_events` (`application_id`,"created_at" desc)',
    ],
  },
};
const OPERATIONS_DDL = [
  `CREATE TABLE \`application_operations\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`application_id\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`state\` text NOT NULL,
	\`body\` text NOT NULL,
	FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade
)`,
  "CREATE INDEX `operation_application` ON `application_operations` (`application_id`)",
  `CREATE UNIQUE INDEX \`one_working_change_per_application\` ON \`application_operations\` (\`application_id\`) WHERE "application_operations"."kind" = 'change' AND "application_operations"."state" = 'working'`,
];

const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const tableNames = (database) =>
  new Set(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((row) => row.name),
  );
const columnNames = (database, table) =>
  database
    .prepare(`PRAGMA table_info(${quote(table)})`)
    .all()
    .map((column) => column.name);
const count = (database, table) =>
  database.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).get().n;
const short = (value) => (value ? String(value).slice(0, 12) : "unknown");

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

// Legacy release identity: sha256 of the canonical {repository, revision,
// plan}. Used only here, to validate history before the plan is retired.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function legacyReleaseId(repository, revision, plan) {
  return createHash("sha256")
    .update(JSON.stringify(canonical({ repository, revision, plan })))
    .digest("hex");
}

// A frozen port of the retired plan renderer. Private values render as
// sentinels and become ${NAME} references, exactly as the retired
// workspace export did, so literal text keeps the renderer's $$ escaping.
function renderPlan(plan, revision, id, password, supplied) {
  const literal = (value) => value.replaceAll("$", () => "$$");
  const logging = {
    driver: "json-file",
    options: { "max-size": "10m", "max-file": "3" },
  };
  const environment = Object.fromEntries(
    (plan.environment ?? []).map((item) => [item.name, item.value]),
  );
  if (!plan.inputBindings) Object.assign(environment, supplied);
  const connection = {
    url: `${plan.postgres?.scheme ?? "postgresql"}://serverguy:${password}@postgres:5432/application`,
    host: "postgres",
    port: "5432",
    database: "application",
    username: "serverguy",
    password,
  };
  if (plan.postgres?.variable)
    environment[plan.postgres.variable] = connection.url;
  const imageOf = (name, visited = new Set()) => {
    if (visited.has(name))
      throw new Error("Image references must not form a cycle.");
    visited.add(name);
    if (name === "app") return plan.image ?? `server-guy-${id}:${revision}`;
    const service = (plan.services ?? []).find((item) => item.name === name);
    if (!service) throw new Error(`Image refers to unknown service ${name}.`);
    if (service.imageFrom) return imageOf(service.imageFrom, visited);
    if (service.image) return service.image;
    if (service.build) return `server-guy-${id}-${name}:${revision}`;
    throw new Error(`Service ${name} has no image or build.`);
  };
  const builds = [
    ...(!plan.image
      ? [
          {
            name: "app",
            context: plan.context,
            dockerfile: plan.dockerfile,
            generatedDockerfile: plan.generatedDockerfile,
          },
        ]
      : []),
    ...(plan.services ?? []).flatMap((service) =>
      service.build ? [{ name: service.name, ...service.build }] : [],
    ),
  ];
  const volumes = plan.postgres ? { database: {} } : {};
  const mount = (service) => {
    const result = [];
    for (const volume of service.volumes ?? []) {
      volumes[volume.name] = {};
      result.push({
        type: "volume",
        source: volume.name,
        target: volume.target,
        ...(volume.readOnly ? { read_only: true } : {}),
      });
    }
    for (const config of service.configs ?? [])
      result.push({
        type: "bind",
        source: `./configs/${service.name}-${config.name}`,
        target: config.target,
        read_only: true,
      });
    return result;
  };
  const services = {
    app: {
      image: imageOf("app"),
      restart: "unless-stopped",
      ports: [{ target: plan.port, published: "80", protocol: "tcp" }],
      environment: Object.fromEntries(
        Object.entries(environment).map(([key, value]) => [
          key,
          literal(value),
        ]),
      ),
      labels: { "server-guy.revision": revision, "server-guy.deployment": id },
      ...(plan.command ? { command: plan.command.map(literal) } : {}),
      ...(plan.postgres
        ? { depends_on: { postgres: { condition: "service_healthy" } } }
        : {}),
      logging,
    },
  };
  if (plan.postgres)
    services.postgres = {
      image: `postgres:${plan.postgres.version}`,
      restart: "unless-stopped",
      environment: {
        POSTGRES_USER: "serverguy",
        POSTGRES_PASSWORD: password,
        POSTGRES_DB: "application",
      },
      volumes: [
        {
          type: "volume",
          source: "database",
          target: `/var/lib/postgresql${plan.postgres.version === "18" ? "" : "/data"}`,
        },
      ],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U serverguy -d application"],
        interval: "5s",
        timeout: "5s",
        retries: 20,
      },
      logging,
    };
  services.app.volumes = mount({
    name: "app",
    volumes: plan.volumes,
    configs: plan.configs,
  });
  for (const service of plan.services ?? [])
    services[service.name] = {
      image: imageOf(service.name),
      restart: "unless-stopped",
      ...(service.command ? { command: service.command.map(literal) } : {}),
      environment: Object.fromEntries(
        (service.environment ?? []).map((item) => [
          item.name,
          literal(item.value),
        ]),
      ),
      volumes: mount(service),
      // Only the web container was ever attributed by label: older hosts
      // run other services without a revision label.
      labels: { "server-guy.deployment": id },
      logging,
    };
  for (const build of builds)
    services[build.name].build = {
      // Native bundles hold the repository at the project root.
      context: build.context,
      dockerfile:
        build.context === "."
          ? build.dockerfile
          : `${"../".repeat(build.context.split("/").length)}${build.dockerfile}`,
    };
  for (const service of [
    { name: "app", healthCommand: plan.healthCommand },
    ...(plan.services ?? []),
  ])
    if (service.healthCommand)
      services[service.name].healthcheck = {
        test: ["CMD", ...service.healthCommand.map(literal)],
        interval: "5s",
        timeout: "5s",
        retries: 20,
      };
  for (const binding of plan.inputBindings ?? []) {
    const value =
      binding.connection && plan.postgres
        ? connection[binding.field ?? "url"]
        : supplied[binding.input];
    if (!value?.trim())
      throw new Error(
        `Input binding ${binding.service}.${binding.variable} has no value source.`,
      );
    services[binding.service].environment[binding.variable] = literal(value);
  }
  for (const dependency of plan.dependencies ?? []) {
    const target = services[dependency.service];
    target.depends_on ??= {};
    target.depends_on[dependency.needs] = {
      condition:
        dependency.condition === "healthy"
          ? "service_healthy"
          : "service_started",
    };
  }
  return { services, volumes, builds };
}

function referencePrivateValues(value, sentinels) {
  if (typeof value === "string") {
    let text = value;
    for (const [sentinel, name] of sentinels)
      text = text.replaceAll(sentinel, `\${${name}}`);
    return text;
  }
  if (Array.isArray(value))
    return value.map((item) => referencePrivateValues(item, sentinels));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        referencePrivateValues(item, sentinels),
      ]),
    );
  return value;
}

/** The native configuration equivalent to a retired plan's rendering. */
export function convertPlan(plan, deploymentId, revision) {
  const project = `sg-${deploymentId.slice(0, 8)}`;
  const inputs = (plan.missingInputs ?? []).map((input) => input.name);
  const nonce = randomUUID().replaceAll("-", "");
  const names = [...inputs, DATABASE_PASSWORD];
  const sentinels = new Map(
    names.map((name, index) => [`sgp${nonce}i${index}e`, name]),
  );
  const value = (name) => `sgp${nonce}i${names.indexOf(name)}e`;
  const rendered = renderPlan(
    plan,
    revision,
    deploymentId,
    value(DATABASE_PASSWORD),
    Object.fromEntries(inputs.map((name) => [name, value(name)])),
  );
  const resolved = referencePrivateValues(
    {
      name: project,
      services: rendered.services,
      volumes: Object.fromEntries(
        Object.keys(rendered.volumes).map((name) => [
          name,
          { name: `${project}_${name}` },
        ]),
      ),
    },
    sentinels,
  );
  if (JSON.stringify(resolved).includes(`sgp${nonce}`))
    throw new Error("A private input was used outside a value.");
  const file = (path, mode, content) => ({
    path,
    mode,
    sha256: createHash("sha256").update(content).digest("hex"),
    content: Buffer.from(content).toString("base64"),
  });
  const dockerfiles = new Map(
    rendered.builds
      .filter((build) => build.generatedDockerfile)
      .map((build) => [build.dockerfile, build.generatedDockerfile]),
  );
  const data = new Map(
    plan.postgres
      ? [["database", { volume: "database", kind: "database", sqlite: null }]]
      : [],
  );
  for (const service of [
    { volumes: plan.volumes ?? [] },
    ...(plan.services ?? []),
  ])
    for (const volume of service.volumes ?? [])
      if (!data.has(volume.name))
        data.set(volume.name, {
          volume: volume.name,
          kind: volume.kind,
          sqlite: volume.sqlite
            ? volume.sqlite.slice(volume.target.replace(/\/$/, "").length + 1)
            : null,
          ...(volume.capture ? { capture: volume.capture } : {}),
        });
  const reasons = Object.fromEntries(
    (plan.missingInputs ?? []).map((input) => [input.name, input.reason]),
  );
  return {
    format: 1,
    resolver: "schema v14 conversion of a retired Server Guy plan",
    converted: { from: "deployment-plan", schema: 14 },
    compose: [],
    files: [
      ...[...dockerfiles].map(([path, content]) => file(path, 0o644, content)),
      ...[
        { name: "app", configs: plan.configs ?? [] },
        ...(plan.services ?? []),
      ].flatMap((service) =>
        (service.configs ?? []).map((config) =>
          file(`configs/${service.name}-${config.name}`, 0o600, config.content),
        ),
      ),
    ],
    resolved,
    inputs: [...inputs].sort(),
    ...(inputs.length ? { inputReasons: reasons } : {}),
    data: [...data.values()],
    database: plan.postgres
      ? { service: "postgres", version: plan.postgres.version }
      : null,
    httpAccess: plan.httpAccess ?? "public",
    criterion: {
      healthPath: plan.healthPath,
      checks: plan.checks,
      services: (plan.services ?? []).flatMap((service) =>
        service.port && service.healthPath
          ? [
              {
                name: service.name,
                port: service.port,
                healthPath: service.healthPath,
                checks: service.checks,
              },
            ]
          : [],
      ),
    },
    summary: plan.summary,
  };
}

function describe(table, record, repository) {
  const at =
    record.created_at ?? record.granted_at ?? record.record?.createdAt ?? null;
  switch (table) {
    case "phase_workspaces":
      return {
        at: record.completed_at ?? at,
        label: "Retired phase workspace",
        summary: record.completed_at
          ? `Phase ${record.phase_key} completed at ${record.completed_at}; its retained deliverable evidence is kept here.`
          : `Phase ${record.phase_key} was not completed.`,
      };
    case "application_contracts":
      return {
        at,
        label: "Retired Application Contract",
        url: repository ? `${repository}/tree/${record.commit_sha}` : null,
        summary: `Application Contract v${record.version} for commit ${short(record.commit_sha)}${record.superseded_by_id ? " (superseded)" : ""}.`,
      };
    case "conformance_proposals": {
      const pr = record.publication_json ?? record.external_json;
      return {
        at,
        label: "Retired source proposal",
        url: pr?.pullRequestUrl ?? null,
        summary: `Source proposal (${record.origin}, ${record.status})${pr?.pullRequestNumber ? `: pull request #${pr.pullRequestNumber}${pr.branch ? ` on ${pr.branch}` : ""}${pr.state ? `, last seen ${pr.state}` : ""}` : ""}.`,
        attention:
          record.publication_json &&
          !["merged", "closed"].includes(record.publication_json.state)
            ? `Pull request #${record.publication_json.pullRequestNumber} (${record.publication_json.branch}) was opened by the retired publication workflow and may still be open: ${record.publication_json.pullRequestUrl}`
            : null,
      };
    }
    case "conformance_runs":
      return {
        at,
        label: "Retired conformance run",
        summary: `${record.kind} conformance run ${record.status} at ${short(record.source_json?.commitSha)}: ${record.summary}`,
        attention: ["queued", "running"].includes(record.status)
          ? `A ${record.kind} conformance run was ${record.status}; it will not run. Remove any leftover local runner containers labeled server-guy.conformance-run=${record.id}.`
          : null,
      };
    case "acceptance_checks":
      return {
        at,
        label: "Retired behavior checks",
        summary: `Behavior checks v${record.version} (${record.status}), ${Array.isArray(record.steps_json) ? record.steps_json.length : 0} steps.`,
      };
    case "publication_grants":
      return {
        at,
        label: "Retired publication permission",
        summary: `Permission to publish to the repository (${record.mechanism}), granted ${record.granted_at}${record.revoked_at ? `, revoked ${record.revoked_at}` : ""}. It no longer grants anything.`,
      };
    case "application_previews": {
      const preview = record.record ?? {};
      return {
        at,
        label: "Retired local preview",
        url: null,
        summary: `Local preview ${preview.status ?? "unknown"}${preview.containerId ? ` (container ${short(preview.containerId)})` : ""}.`,
        attention: ["starting", "ready"].includes(preview.status)
          ? `A local preview container${preview.containerId ? ` (${preview.containerId})` : ""} may still run on the controller's Docker engine; stop it with docker rm -f.`
          : null,
      };
    }
    case "preparation_branches": {
      const branch = record.record ?? {};
      return {
        at,
        label: "Retired preparation branch",
        url:
          branch.pullRequestUrl ??
          (repository && branch.branch
            ? `${repository}/tree/${branch.branch}`
            : null),
        summary: `Shared preparation branch ${branch.branch ?? "unknown"} (${branch.status ?? "unknown"})${branch.pullRequestNumber ? `, draft pull request #${branch.pullRequestNumber}` : ""}.`,
        attention: branch.branch
          ? `Branch ${branch.branch}${branch.pullRequestNumber ? ` and draft pull request #${branch.pullRequestNumber}` : ""} remain on GitHub; Server Guy no longer publishes to them.`
          : null,
      };
    }
    default:
      return { at, label: "Retired record", summary: `Retired ${table} row.` };
  }
}

const HELD_NEXT =
  "Check GitHub, then record what you verified to release this application's change queue. Server Guy cannot verify, repeat or reconcile retired work.";
const heldDecision = () => ({
  kind: "recovery",
  note: HELD_NEXT,
  retry: null,
  cancel: "Record what I verified and release the hold",
  inputs: [
    {
      name: ATTESTATION_INPUT,
      hint: "For example: checked GitHub; branch sg/prepare was deleted and pull request #12 is closed.",
      secret: false,
    },
  ],
});

/**
 * Retired commands never run again. Unstarted work is cancelled; anything
 * that may have started keeps its recorded hold until the owner attests.
 */
function retireOperation(body, repository, now) {
  const retired = body.command && RETIRED_COMMANDS.has(body.command.type);
  if (!retired) {
    if (!["proposed", "queued", "working"].includes(body.state)) return null;
    const keys = RETIRED_PRECONDITIONS.filter(
      (key) => body.preconditions && key in body.preconditions,
    );
    if (!keys.length) return null;
    for (const key of keys) delete body.preconditions[key];
    return body;
  }
  const type = body.command.type;
  body.command = null;
  const note = `Schema v14 (${now}): source preparation and publication (${type}) were retired. Server Guy will not run, retry or reconcile this operation.`;
  const claimed = body.state === "working" && Boolean(body.executorPid);
  const held = Boolean(body.blocksQueue);
  if (
    ["verified", "inspected", "cancelled"].includes(body.state) ||
    body.resolvedById
  )
    return body;
  if (
    ["proposed", "queued", "working"].includes(body.state) &&
    !claimed &&
    !held
  ) {
    body.state = "cancelled";
    body.summary = `Retired before it ran: Server Guy no longer prepares or publishes source changes. Nothing was executed.`;
    body.evidence = [body.evidence, note].filter(Boolean).join("\n\n");
    body.decision = null;
    body.waitingForId = null;
    body.waitingForTitle = null;
    body.executorPid = null;
    body.executionId = null;
    return body;
  }
  const outcome = held
    ? `Its GitHub outcome is unknown: it may have created or changed a branch, commit or pull request in ${repository ?? "the repository"} before Server Guy stopped.`
    : claimed
      ? "Server Guy stopped while it was running, before any GitHub change was recorded."
      : "It had already failed.";
  if (body.state !== "failed") {
    body.summary = `Stopped and retired: ${outcome}`;
    body.steps = [{ label: body.title, state: "failed" }];
  }
  body.state = "failed";
  body.evidence = [body.evidence, `${note} ${outcome}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(-12000);
  body.executorPid = null;
  body.executionId = null;
  body.waitingForId = null;
  body.waitingForTitle = null;
  // The hold, if any, is historical evidence: only the owner releases it.
  body.blocksQueue = held;
  body.next = held
    ? HELD_NEXT
    : "Dismiss this retired operation; nothing will run again.";
  body.decision = held
    ? heldDecision()
    : { kind: "recovery", note: body.next, retry: null, cancel: "Dismiss" };
  return body;
}

function rebuild(database, table, selection) {
  const spec = REBUILT[table];
  const temporary = `__${table}_v14`;
  database.exec(`CREATE TABLE ${quote(temporary)} ${spec.sql}`);
  database.exec(`INSERT INTO ${quote(temporary)} ${selection(temporary)}`);
  const copied = count(database, temporary);
  const source = count(database, table);
  if (copied !== source)
    throw new Error(
      `Retirement would change ${table} from ${source} to ${copied} rows. Rolled back.`,
    );
  database.exec(`DROP TABLE ${quote(table)}`);
  database.exec(`ALTER TABLE ${quote(temporary)} RENAME TO ${quote(table)}`);
  for (const index of spec.indexes) database.exec(index);
}

function retire(database, now, alive) {
  const tables = tableNames(database);
  const before = Object.fromEntries(
    RETAINED_TABLES.filter((name) => tables.has(name)).map((name) => [
      name,
      count(database, name),
    ]),
  );
  const repositories = new Map(
    database
      .prepare("SELECT id, repository_url FROM applications")
      .all()
      .map((row) => [row.id, row.repository_url]),
  );
  const notes = new Map();
  const note = (applicationId) => {
    if (!notes.has(applicationId))
      notes.set(applicationId, { retained: new Map(), attention: [] });
    return notes.get(applicationId);
  };
  let archived = 0;
  let heldOperations = 0;
  const exists = database.prepare("SELECT 1 FROM observations WHERE id = ?");
  const insertObservation = database.prepare(
    "INSERT INTO observations (id, application_id, kind, status, summary, source_label, source_url, raw_json, observed_at) VALUES (?, ?, 'retired-record', 'passed', ?, ?, ?, ?, ?)",
  );
  const archive = (applicationId, id, table, record, description) => {
    const key = exists.get(id) ? `${table}:${id}` : id;
    insertObservation.run(
      key,
      applicationId,
      description.summary.slice(0, 2000),
      description.label,
      description.url ?? null,
      JSON.stringify({
        table,
        record,
        archivedAt: now,
        archivedBy: "schema v14",
      }),
      description.at ?? now,
    );
    archived++;
    const entry = note(applicationId);
    entry.retained.set(
      description.label,
      (entry.retained.get(description.label) ?? 0) + 1,
    );
    if (description.attention) entry.attention.push(description.attention);
  };

  // Retired workflow rows are retained verbatim as evidence, under their ids.
  for (const table of RETIRED_TABLES) {
    if (!tables.has(table) || table === "application_operation_processes")
      continue;
    for (const row of database.prepare(`SELECT * FROM ${quote(table)}`).all()) {
      for (const column of JSON_COLUMNS[table] ?? [])
        if (typeof row[column] === "string")
          try {
            row[column] = JSON.parse(row[column]);
          } catch {
            /* keep the stored text */
          }
      const applicationId = row.application_id;
      if (!repositories.has(applicationId))
        throw new Error(`${table} ${row.id} has no application. Rolled back.`);
      archive(
        applicationId,
        row.id,
        table,
        row,
        describe(table, row, repositories.get(applicationId)),
      );
    }
  }

  if (!tables.has("application_operations") && tables.has("applications")) {
    for (const statement of OPERATIONS_DDL) database.exec(statement);
    tables.add("application_operations");
    before.application_operations = 0;
  }
  const insertOperation = database.prepare(
    "INSERT INTO application_operations (id, application_id, kind, state, body) VALUES (?, ?, ?, ?, ?)",
  );
  // A live pre-v13 guard blocked changes. Keep that as an explicit hold.
  if (tables.has("application_operation_processes"))
    for (const row of database
      .prepare("SELECT * FROM application_operation_processes")
      .all()) {
      const running = alive(row.pid);
      archive(
        row.application_id,
        row.id,
        "application_operation_processes",
        row,
        {
          label: "Retired process guard",
          summary: `Pre-v13 source-preparation process guard, pid ${row.pid}${running ? ", still present at upgrade" : ", not running at upgrade"}.`,
        },
      );
      if (!running) continue;
      const id = randomUUID();
      const summary = `A process (pid ${row.pid}) recorded by an earlier Server Guy version as running source preparation was still present at upgrade. Its outcome is unknown.`;
      insertOperation.run(
        id,
        row.application_id,
        "change",
        "failed",
        JSON.stringify({
          id,
          source: { type: "preparation", id: `process-guard:${row.id}` },
          kind: "change",
          title: "Earlier source preparation process",
          state: "failed",
          destinations: ["deployment", "history"],
          origin: null,
          mentions: [],
          startedAt: now,
          updatedAt: now,
          summary,
          steps: [
            { label: "Earlier source preparation process", state: "failed" },
          ],
          evidence: summary,
          next: HELD_NEXT,
          decision: heldDecision(),
          applicationId: row.application_id,
          target: `process-guard:${row.id}`,
          preconditions: {},
          command: null,
          approvedAt: null,
          executorPid: null,
          executionId: null,
          blocksQueue: true,
          queuedAt: null,
        }),
      );
      heldOperations++;
      note(row.application_id).attention.push(summary);
    }

  // Activity belongs to its application, not to a phase workspace.
  if (
    tables.has("activity_events") &&
    columnNames(database, "activity_events").includes("workspace_id")
  )
    rebuild(
      database,
      "activity_events",
      () =>
        "(id, application_id, kind, summary, detail, created_at) SELECT a.id, w.application_id, a.kind, a.summary, a.detail, a.created_at FROM activity_events a JOIN phase_workspaces w ON w.id = a.workspace_id",
    );

  if (tables.has("application_operations")) {
    const update = database.prepare(
      "UPDATE application_operations SET kind = ?, state = ?, body = ? WHERE id = ?",
    );
    for (const row of database
      .prepare("SELECT * FROM application_operations")
      .all()) {
      const body = JSON.parse(row.body);
      const wasRetired =
        body.command && RETIRED_COMMANDS.has(body.command.type);
      const next = retireOperation(
        body,
        repositories.get(row.application_id),
        now,
      );
      if (!next) continue;
      update.run(next.kind, next.state, JSON.stringify(next), row.id);
      if (wasRetired && next.state === "failed" && next.blocksQueue)
        note(row.application_id).attention.push(
          `${next.title}: outcome unknown; the change queue stays held until you record what you verified.`,
        );
    }
  }

  if (tables.has("deployments")) {
    const update = database.prepare(
      "UPDATE deployments SET status = ?, body = ? WHERE id = ?",
    );
    const operation = database.prepare(
      "SELECT body FROM application_operations WHERE id = ?",
    );
    for (const row of database.prepare("SELECT * FROM deployments").all()) {
      const body = JSON.parse(row.body);
      const changed = convertDeployment(body, now, archive, (id, patch) => {
        if (!tables.has("application_operations")) return;
        const found = operation.get(id);
        if (!found) return;
        const tracked = { ...JSON.parse(found.body), ...patch };
        database
          .prepare(
            "UPDATE application_operations SET kind = ?, state = ?, body = ? WHERE id = ?",
          )
          .run(tracked.kind, tracked.state, JSON.stringify(tracked), id);
      });
      if (changed) update.run(body.status, JSON.stringify(body), row.id);
    }
  }

  if (tables.has("applications")) {
    const columns = columnNames(database, "applications");
    const retiredColumns = [
      "environment",
      "approval_mode",
      "approval_scope",
    ].filter((name) => columns.includes(name));
    if (retiredColumns.length) {
      for (const row of database.prepare("SELECT * FROM applications").all())
        archive(
          row.id,
          randomUUID(),
          "applications",
          {
            id: row.id,
            environment: row.environment ?? null,
            approval_mode: row.approval_mode ?? null,
            approval_scope: row.approval_scope ?? null,
          },
          {
            at: row.updated_at,
            label: "Retired application settings",
            summary: `Retired settings: ${row.approval_mode ?? "no"} permission policy${row.approval_scope ? ` (${row.approval_scope})` : ""}, ${row.environment ?? "unspecified"} environment. Every change now asks for its own approval.`,
          },
        );
      for (const name of retiredColumns)
        database.exec(`ALTER TABLE applications DROP COLUMN ${quote(name)}`);
    }
  }

  const select = (table) => {
    const present = columnNames(database, table);
    const spec = REBUILT[table].columns;
    for (const [name, fallback] of spec)
      if (!present.includes(name) && fallback === null)
        throw new Error(`${table}.${name} is missing. Rolled back.`);
    return `(${spec.map(([name]) => name).join(", ")}) SELECT ${spec
      .map(([name, fallback]) => (present.includes(name) ? name : fallback))
      .join(", ")} FROM ${quote(table)}`;
  };
  for (const table of ["chats", "pi_runs"])
    if (
      tables.has(table) &&
      columnNames(database, table).some((name) =>
        ["workspace_id", "is_primary"].includes(name),
      )
    )
      rebuild(database, table, () => select(table));

  for (const table of RETIRED_TABLES)
    database.exec(`DROP TABLE IF EXISTS ${quote(table)}`);

  let summaries = 0;
  if (tables.has("activity_events")) {
    const insertActivity = database.prepare(
      "INSERT OR IGNORE INTO activity_events (id, application_id, kind, summary, detail, created_at) VALUES (?, ?, 'preparation-retired', ?, ?, ?)",
    );
    for (const [applicationId, entry] of notes) {
      if (!repositories.has(applicationId)) continue;
      const retained = [...entry.retained]
        .map(([label, n]) => `${n} × ${label.replace(/^Retired /, "")}`)
        .join(", ");
      const result = insertActivity.run(
        `retirement:v14:${applicationId}`,
        applicationId,
        entry.attention.length
          ? "Earlier preparation records retained; some need your attention"
          : "Earlier preparation records retained as history",
        `Server Guy retired its phase, contract, conformance and publication workflow. It no longer prepares or publishes source changes; application code changes come from owner-merged revisions. Retained as evidence: ${retained || "no records"}.${entry.attention.length ? ` Needs your attention: ${entry.attention.join(" ")}` : ""}`.slice(
          0,
          8000,
        ),
        now,
      );
      summaries += result.changes;
    }
  }

  const after = Object.fromEntries(
    Object.keys(before).map((name) => [name, count(database, name)]),
  );
  const expected = {
    ...before,
    ...(before.observations !== undefined
      ? { observations: before.observations + archived }
      : {}),
    ...(before.activity_events !== undefined
      ? { activity_events: before.activity_events + summaries }
      : {}),
    ...(before.application_operations !== undefined
      ? {
          application_operations:
            before.application_operations + heldOperations,
        }
      : {}),
  };
  for (const name of Object.keys(expected))
    if (after[name] !== expected[name])
      throw new Error(
        `Retirement changed ${name} from ${expected[name]} to ${after[name]} rows. Rolled back.`,
      );
  if (database.pragma("foreign_key_check").length)
    throw new Error("Retirement produced invalid references. Rolled back.");
  return { changed: true, archived, heldOperations, summaries };
}

/**
 * Converts one deployment record in place. Returns whether it changed.
 * Retired plans are validated against their recorded identities, archived,
 * and replaced by native configurations only where an effect exists.
 */
function convertDeployment(body, now, archive, updateOperation) {
  let changed = false;
  const converted = new Map();
  const convert = (releaseId, revision, plan) => {
    if (!converted.has(releaseId))
      converted.set(releaseId, convertPlan(plan, body.id, revision));
    return structuredClone(converted.get(releaseId));
  };
  const archivePlan = (releaseId, revision, plan, at) =>
    archive(
      body.applicationId,
      `plan:${body.id}:${releaseId}`,
      "deployments",
      {
        deploymentId: body.id,
        releaseId,
        repository: body.repository,
        revision,
        plan,
      },
      {
        at,
        label: "Retired deployment plan",
        summary: `Deployment plan of release ${short(releaseId)} (revision ${short(revision)}), retired at schema v14.`,
      },
    );
  const archived = new Set();
  for (const release of body.lifecycle?.releases ?? []) {
    if (!release.plan) continue;
    const expected = legacyReleaseId(
      release.repository,
      release.revision,
      release.plan,
    );
    if (expected !== release.id)
      throw new Error(
        `Deployment ${body.id}: release ${release.id} does not match its recorded plan. Nothing was migrated; inspect the backup.`,
      );
    const started = body.lifecycle.attempts?.find(
      (attempt) => attempt.releaseId === release.id,
    )?.startedAt;
    if (!archived.has(release.id)) {
      archivePlan(
        release.id,
        release.revision,
        release.plan,
        started ?? body.createdAt,
      );
      archived.add(release.id);
    }
    release.native = convert(release.id, release.revision, release.plan);
    delete release.plan;
    changed = true;
  }
  if (body.plan && !body.native) {
    if (!body.revision)
      throw new Error(
        `Deployment ${body.id} has a plan without a revision. Nothing was migrated; inspect the backup.`,
      );
    const releaseId = legacyReleaseId(
      body.repository,
      body.revision,
      body.plan,
    );
    if (body.releaseId && body.releaseId !== releaseId)
      throw new Error(
        `Deployment ${body.id}: recorded release ${body.releaseId} does not match its plan. Nothing was migrated; inspect the backup.`,
      );
    if (!archived.has(releaseId))
      archivePlan(releaseId, body.revision, body.plan, body.updatedAt);
    const effect = Boolean(body.serverId || body.serverCreateAttempted);
    if (body.status === "live" || effect) {
      body.native = convert(releaseId, body.revision, body.plan);
      body.releaseId = releaseId;
      body.events.push({
        at: now,
        message:
          body.status === "live"
            ? "Schema v14: the retired deployment plan was converted to native Compose with the same release identity. Nothing on the host changed."
            : "Schema v14: the retired deployment plan was converted to native Compose with the same release identity. A retry continues this approved deployment through the native executor.",
      });
    } else {
      // Nothing was bought or started: its approval, if any, is not reused.
      const approved = body.authority?.acceptedAt;
      body.native = null;
      delete body.releaseId;
      delete body.recommendationId;
      body.authority = null;
      body.status = "failed";
      body.error =
        "This recommendation came from Server Guy's retired planner and can no longer be approved or run. Nothing was purchased. Retry to prepare a new recommendation, or cancel the setup.";
      body.events.push({
        at: now,
        message: `Schema v14: the retired planner's recommendation was withdrawn.${approved ? ` The approval of ${approved} was not used.` : ""} Nothing was purchased.`,
      });
      updateOperation(body.operationId ?? `deployment:${body.id}`, {
        kind: "inspection",
        state: "failed",
        blocksQueue: false,
        executorPid: null,
        executionId: null,
        waitingForId: null,
        waitingForTitle: null,
        decision: null,
        summary:
          "Stopped before claiming success. Earlier verification is historical; it does not establish the current runtime.",
        next: body.error,
        updatedAt: now,
      });
    }
    delete body.plan;
    changed = true;
  } else if ("plan" in body) {
    if (body.plan) {
      const releaseId = legacyReleaseId(
        body.repository,
        body.revision,
        body.plan,
      );
      if (!archived.has(releaseId))
        archivePlan(releaseId, body.revision, body.plan, body.updatedAt);
    }
    delete body.plan;
    changed = true;
  }
  if ("inspectedRevision" in body) {
    delete body.inspectedRevision;
    changed = true;
  }
  // Materialize the lifecycle the runtime used to import on first use.
  if (
    !body.lifecycle &&
    body.status === "live" &&
    body.verifiedAt &&
    body.serverId &&
    body.native &&
    body.revision
  ) {
    const releaseId = body.releaseId;
    if (!releaseId)
      throw new Error(
        `Deployment ${body.id} is live without a release identity. Nothing was migrated; inspect the backup.`,
      );
    const hostId = `host:${body.id}`;
    const attemptId = `legacy:${body.id}`;
    const images = structuredClone(
      body.serviceImages ?? (body.imageId ? { app: body.imageId } : {}),
    );
    body.lifecycle = {
      host: {
        id: hostId,
        provider: "hetzner",
        connectionId: body.authority?.connectionId ?? null,
        serverId: body.serverId,
        address: body.address,
      },
      releases: [
        {
          id: releaseId,
          repository: body.repository,
          revision: body.revision,
          native: structuredClone(body.native),
        },
      ],
      attempts: [
        {
          id: attemptId,
          operationId: body.operationId ?? `deployment:${body.id}`,
          releaseId,
          hostId,
          kind: "legacy",
          startedAt: body.createdAt,
          finishedAt: body.verifiedAt,
          outcome: "verified",
          remoteStartedAt: null,
          error: null,
          eventOffset: 0,
        },
      ],
      runtime: {
        state: "verified",
        lastVerified: {
          attemptId,
          releaseId,
          hostId,
          revision: body.revision,
          checkedAt: body.verifiedAt,
          images,
        },
      },
    };
    changed = true;
  }
  return changed;
}

/** Whether this database still holds any retired shape. */
export function needsRetirement(database) {
  const tables = tableNames(database);
  if (RETIRED_TABLES.some((name) => tables.has(name))) return true;
  const has = (table, names) =>
    tables.has(table) &&
    columnNames(database, table).some((name) => names.includes(name));
  if (
    has("applications", ["environment", "approval_mode", "approval_scope"]) ||
    has("chats", ["workspace_id", "is_primary"]) ||
    has("pi_runs", ["workspace_id"]) ||
    has("activity_events", ["workspace_id"])
  )
    return true;
  if (tables.has("deployments"))
    for (const { body } of database
      .prepare("SELECT body FROM deployments")
      .all()) {
      const record = JSON.parse(body);
      if (
        "plan" in record ||
        "inspectedRevision" in record ||
        record.lifecycle?.releases?.some((release) => "plan" in release)
      )
        return true;
    }
  if (tables.has("application_operations"))
    for (const { body } of database
      .prepare("SELECT body FROM application_operations")
      .all()) {
      const record = JSON.parse(body);
      if (record.command && RETIRED_COMMANDS.has(record.command.type))
        return true;
      if (
        ["proposed", "queued", "working"].includes(record.state) &&
        RETIRED_PRECONDITIONS.some(
          (key) => record.preconditions && key in record.preconditions,
        )
      )
        return true;
    }
  return false;
}

/**
 * Runs the whole retirement in one immediate transaction with foreign keys
 * off, so dropping a table cannot cascade into retained records. A database
 * that no longer holds a retired shape is left untouched.
 */
export function retirePreparationWorkflow(
  database,
  { now = new Date().toISOString(), pidAlive: alive = pidAlive } = {},
) {
  if (!needsRetirement(database)) return { changed: false };
  if (database.pragma("foreign_key_check").length)
    throw new Error(
      "Database has invalid references. Retirement was not attempted; inspect the backup.",
    );
  const foreignKeys = database.pragma("foreign_keys", { simple: true });
  database.pragma("foreign_keys = OFF");
  try {
    return database.transaction(() => retire(database, now, alive)).immediate();
  } finally {
    database.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}
