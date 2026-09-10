import { expect, it } from "vitest";
import {
  composeDefinition,
  composeStartCommand,
} from "../../../src/server/deployment-compose";
import {
  deploymentPlanSchema,
  type DeploymentRecord,
} from "../../../src/server/deployment-types";
import {
  assertApprovedRelease,
  releaseOf,
} from "../../../src/server/deployment-release";
import {
  stackOf,
  persistentState,
} from "../../../src/server/application-stack";
import { queuePlan } from "../../fixtures/queue-worker/plan";
import { legacyPlans } from "../../fixtures/queue-worker/legacy-plans";

it("builds web and worker once, keeps the queue private, and escapes credentials only at Compose serialization", () => {
  const plan = queuePlan();
  const compose = composeDefinition(plan, "a".repeat(40), "test", "unused", {
    QUEUE_PASSWORD: "test$HOME${SECRET}",
  });
  expect(compose.services.worker).toMatchObject({
    image: `server-guy-test:${"a".repeat(40)}`,
    command: ["python", "app.py", "worker"],
    environment: { QUEUE_PASSWORD: "test$$HOME$${SECRET}" },
    depends_on: { queue: { condition: "service_healthy" } },
  });
  expect(compose.services.app).toHaveProperty("build");
  expect(compose.services.worker).not.toHaveProperty("build");
  expect(compose.services.queue).not.toHaveProperty("ports");
  expect(compose.services.worker).not.toHaveProperty("ports");
  expect(compose.services.queue).toHaveProperty("volumes", [
    "queue-data:/data",
  ]);
  expect(composeStartCommand(plan, "compose")).toBe(
    "compose build app && compose up -d --no-build --wait --wait-timeout 120",
  );
});

it("only delivers an input to its named consumers and rejects missing input values", () => {
  const plan = queuePlan();
  plan.inputBindings = plan.inputBindings!.filter((b) => b.service !== "app");
  const compose = composeDefinition(plan, "rev", "id", "unused", {
    QUEUE_PASSWORD: "synthetic",
  });
  expect(compose.services.app).not.toHaveProperty("environment.QUEUE_PASSWORD");
  expect(compose.services.worker).toHaveProperty(
    "environment.QUEUE_PASSWORD",
    "synthetic",
  );
  expect(() => composeDefinition(plan, "rev", "id", "unused", {})).toThrow(
    "Provide QUEUE_PASSWORD",
  );
});

it("lets a worker reuse the managed PostgreSQL connection without copying secrets into the plan", () => {
  const plan = queuePlan();
  plan.postgres = {
    version: "16",
    variable: "DATABASE_URL",
    scheme: "postgresql",
  };
  plan.inputBindings!.push({
    service: "worker",
    variable: "DATABASE_URL",
    connection: "postgres",
  });
  plan.dependencies!.push({
    service: "worker",
    needs: "postgres",
    condition: "healthy",
  });
  deploymentPlanSchema.parse(plan);
  const compose = composeDefinition(plan, "rev", "id", "random-password", {
    QUEUE_PASSWORD: "synthetic",
  });
  expect(compose.services.worker).toHaveProperty(
    "environment.DATABASE_URL",
    "postgresql://serverguy:random-password@postgres:5432/application",
  );
  expect(JSON.stringify(plan)).not.toContain("random-password");
});

it.each([
  [
    "cycle",
    (p: ReturnType<typeof queuePlan>): unknown =>
      p.dependencies!.push({
        service: "queue",
        needs: "worker",
        condition: "started",
      }),
  ],
  [
    "unknown dependency",
    (p: ReturnType<typeof queuePlan>): unknown =>
      (p.dependencies![0].needs = "missing"),
  ],
  [
    "no readiness",
    (p: ReturnType<typeof queuePlan>): unknown =>
      delete p.services![1].healthCommand,
  ],
  [
    "ambiguous image",
    (p: ReturnType<typeof queuePlan>): unknown =>
      (p.services![0].image = "example/worker:1"),
  ],
  [
    "missing image",
    (p: ReturnType<typeof queuePlan>): unknown =>
      delete p.services![0].imageFrom,
  ],
  [
    "unknown secret",
    (p: ReturnType<typeof queuePlan>): unknown =>
      (p.inputBindings![0].input = "MISSING"),
  ],
  [
    "shadowed variable",
    (p: ReturnType<typeof queuePlan>): unknown =>
      (p.inputBindings![0].variable = "QUEUE_HOST"),
  ],
  [
    "duplicate binding",
    (p: ReturnType<typeof queuePlan>): unknown =>
      p.inputBindings!.push(p.inputBindings![0]),
  ],
  [
    "unbound input",
    (p: ReturnType<typeof queuePlan>): unknown => (p.inputBindings = []),
  ],
  [
    "mutating retry",
    (p: ReturnType<typeof queuePlan>): unknown =>
      (p.checks[1].waitSeconds = 10),
  ],
] as const)("rejects %s before execution", (_name, change) => {
  const plan = queuePlan();
  change(plan);
  expect(deploymentPlanSchema.safeParse(plan).success).toBe(false);
});

it("separates release identity from the host and attempt outcome, while detecting changed configuration", () => {
  const record = {
    repository: "example/repo",
    revision: "a".repeat(40),
    plan: queuePlan(),
  } as DeploymentRecord;
  record.releaseId = releaseOf(record)!.id;
  record.address = "203.0.113.1";
  record.id = "another-attempt";
  record.status = "failed";
  expect(releaseOf(record)!.id).toBe(record.releaseId);
  assertApprovedRelease(record);
  record.plan!.services![0].command = ["another", "command"];
  expect(() => assertApprovedRelease(record)).toThrow("release changed");
  delete record.releaseId;
  // Old records remain readable.
  expect(() => assertApprovedRelease(record)).not.toThrow();
});

it("projects explicit roles and individual historical readiness without making it current health", () => {
  const record = {
    status: "live",
    plan: queuePlan(),
    serviceReadiness: {
      worker: {
        checkedAt: "2026-09-10T12:00:00Z",
        kind: "command",
        imageId: "image",
      },
    },
  } as unknown as DeploymentRecord;
  const stack = stackOf(record);
  expect(stack.processes.map((p) => p.role)).toEqual([
    "web",
    "worker",
    "broker",
  ]);
  expect(stack.processes[1].readiness?.kind).toBe("command");
  expect(stack.processes[2].readiness).toBeUndefined();
  expect(persistentState(stack)).toContainEqual({
    key: "volume:queue-data",
    label: "Data · queue-data",
    detail: "/data · used by queue",
    method: "consistency procedure not yet supported",
  });
});

// Existing hosts keep their data only if services, images, ports, named
// volumes, mounts and database wiring stay the same.
it("keeps legacy plans' services, images, ports, volumes and database wiring", () => {
  const [postgres, kuma, grafana] = legacyPlans().map((plan) => {
    deploymentPlanSchema.parse(plan);
    return composeDefinition(
      plan,
      "a".repeat(40),
      "legacy",
      "synthetic-password",
      { API_KEY: "test$dollar" },
    );
  });
  expect(postgres).toMatchObject({
    services: {
      app: {
        ports: ["80:8080"],
        environment: {
          API_KEY: "test$$dollar",
          DATABASE_URL:
            "postgresql://serverguy:synthetic-password@postgres:5432/application",
        },
        depends_on: { postgres: { condition: "service_healthy" } },
        volumes: [],
      },
      postgres: {
        image: "postgres:16",
        environment: { POSTGRES_USER: "serverguy", POSTGRES_DB: "application" },
        volumes: ["database:/var/lib/postgresql/data"],
      },
    },
  });
  expect(kuma).toMatchObject({
    services: {
      app: {
        image: "louislam/uptime-kuma@sha256:" + "a".repeat(64),
        ports: ["80:8080"],
        volumes: ["data:/app/data"],
      },
    },
  });
  expect(grafana).toMatchObject({
    services: {
      app: {
        image: "grafana/grafana@sha256:" + "b".repeat(64),
        ports: ["80:8080"],
        volumes: [
          "data:/var/lib/grafana",
          "./configs/app-source:/etc/grafana/provisioning/datasources/source.yaml:ro",
        ],
      },
      prometheus: {
        image: "prom/prometheus@sha256:" + "c".repeat(64),
        volumes: ["metrics:/prometheus"],
      },
    },
  });
  expect(grafana.services.prometheus).not.toHaveProperty("ports");
  expect(
    [postgres, kuma, grafana].map((compose) => [
      Object.keys(compose.services),
      Object.keys(compose.volumes ?? {}),
    ]),
  ).toEqual([
    [["app", "postgres"], ["database"]],
    [["app"], ["data"]],
    [
      ["app", "prometheus"],
      ["data", "metrics"],
    ],
  ]);
});

it("uses plan services in preference to stale legacy process projections", () => {
  const record = {
    status: "live",
    plan: queuePlan(),
    stack: {
      processes: [{ name: "worker", role: "web", command: "old-command" }],
    },
  } as unknown as DeploymentRecord;
  const processes = stackOf(record).processes;
  expect(processes).toHaveLength(3);
  expect(processes.find((p) => p.name === "worker")?.role).toBe("worker");
});
