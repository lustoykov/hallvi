import { serviceImage, sourceBuilds } from "./deployment-layout";
import type { DeploymentPlan } from "./deployment-types";

export function composeDefinition(
  plan: DeploymentPlan,
  revision: string,
  id: string,
  password: string,
  supplied: Record<string, string>,
) {
  const environment = Object.fromEntries(
    plan.environment.map((item) => [item.name, item.value]),
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
  // Compose interprets dollars in values, including user secrets. Escape once
  // at serialization; never let a remote shell expand these strings.
  const literal = (value: string) => value.replaceAll("$", () => "$$");
  const volumes: Record<string, object> = plan.postgres ? { database: {} } : {};
  const services: Record<string, unknown> = {
    app: {
      image: plan.image ?? `server-guy-${id}:${revision}`,
      ...(plan.image
        ? {}
        : {
            build: {
              context: `./source/${plan.context}`,
              dockerfile:
                plan.context === "."
                  ? plan.dockerfile
                  : `${"../".repeat(plan.context.split("/").length)}${plan.dockerfile}`,
            },
          }),
      restart: "unless-stopped",
      ports: [`80:${plan.port}`],
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
      logging: {
        driver: "json-file",
        options: { "max-size": "10m", "max-file": "3" },
      },
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
        `database:/var/lib/postgresql${plan.postgres.version === "18" ? "" : "/data"}`,
      ],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U serverguy -d application"],
        interval: "5s",
        timeout: "5s",
        retries: 20,
      },
      logging: {
        driver: "json-file",
        options: { "max-size": "10m", "max-file": "3" },
      },
    };
  const mount = (service: {
    name: string;
    volumes?: DeploymentPlan["volumes"];
    configs?: DeploymentPlan["configs"];
  }) => {
    const result: string[] = [];
    for (const volume of service.volumes ?? []) {
      volumes[volume.name] = {};
      result.push(
        `${volume.name}:${volume.target}${volume.readOnly ? ":ro" : ""}`,
      );
    }
    for (const config of service.configs ?? [])
      result.push(
        `./configs/${service.name}-${config.name}:${config.target}:ro`,
      );
    return result;
  };
  (services.app as Record<string, unknown>).volumes = mount({
    name: "app",
    volumes: plan.volumes,
    configs: plan.configs,
  });
  for (const service of plan.services ?? []) {
    services[service.name] = {
      image: serviceImage(plan, revision, id, service.name),
      restart: "unless-stopped",
      ...(service.command ? { command: service.command.map(literal) } : {}),
      environment: Object.fromEntries(
        service.environment.map((e) => [e.name, literal(e.value)]),
      ),
      volumes: mount(service),
      labels: { "server-guy.revision": revision, "server-guy.deployment": id },
      logging: {
        driver: "json-file",
        options: { "max-size": "10m", "max-file": "3" },
      },
    };
  }
  for (const build of sourceBuilds(plan)) {
    (services[build.name] as Record<string, unknown>).build = {
      context: `./source/${build.context}`,
      dockerfile:
        build.context === "."
          ? build.dockerfile
          : `${"../".repeat(build.context.split("/").length)}${build.dockerfile}`,
    };
  }
  for (const service of [
    { name: "app", healthCommand: plan.healthCommand },
    ...(plan.services ?? []),
  ]) {
    const target = services[service.name] as Record<string, unknown>;
    if (service.healthCommand)
      target.healthcheck = {
        test: ["CMD", ...service.healthCommand.map(literal)],
        interval: "5s",
        timeout: "5s",
        retries: 20,
      };
  }
  for (const binding of plan.inputBindings ?? []) {
    const value =
      binding.connection && plan.postgres
        ? connection[binding.field ?? "url"]
        : supplied[binding.input!];
    if (!value?.trim())
      throw new Error(
        binding.connection
          ? `Managed PostgreSQL ${binding.field ?? "url"} is unavailable.`
          : `Provide ${binding.input} before deploying.`,
      );
    const target = services[binding.service] as {
      environment: Record<string, string>;
    };
    target.environment[binding.variable] = literal(value);
  }
  for (const dependency of plan.dependencies ?? []) {
    const target = services[dependency.service] as {
      depends_on?: Record<string, unknown>;
    };
    target.depends_on ??= {};
    target.depends_on[dependency.needs] = {
      condition:
        dependency.condition === "healthy"
          ? "service_healthy"
          : "service_started",
    };
  }
  return { services, volumes };
}

/** Build shared source once before Compose can try to pull a worker's image. */
export function composeStartCommand(plan: DeploymentPlan, compose: string) {
  const builds = sourceBuilds(plan);
  return builds.length
    ? `${compose} build ${builds.map((b) => b.name).join(" ")} && ${compose} up -d --no-build --wait --wait-timeout 120`
    : `${compose} up -d --wait --wait-timeout 120`;
}
