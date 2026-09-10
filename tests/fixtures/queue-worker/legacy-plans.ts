import type { DeploymentPlan } from "../../../src/server/deployment-types";
export function legacyPlans(): DeploymentPlan[] {
  const base: DeploymentPlan = {
    summary: "A legacy HTTP deployment plan",
    dockerfile: "Dockerfile",
    context: ".",
    generatedDockerfile: null,
    port: 8080,
    command: null,
    environment: [],
    postgres: null,
    missingInputs: [],
    healthPath: "/health",
    checks: [
      {
        name: "Content",
        method: "GET",
        path: "/",
        body: null,
        expectedStatus: 200,
        contains: "Application",
        captureId: null,
      },
    ],
  };
  return [
    {
      ...base,
      postgres: {
        version: "16",
        variable: "DATABASE_URL",
        scheme: "postgresql",
      },
    },
    {
      ...base,
      image: "louislam/uptime-kuma@sha256:" + "a".repeat(64),
      volumes: [
        {
          name: "data",
          target: "/app/data",
          kind: "database",
          sqlite: "/app/data/kuma.db",
        },
      ],
    },
    {
      ...base,
      image: "grafana/grafana@sha256:" + "b".repeat(64),
      volumes: [
        {
          name: "data",
          target: "/var/lib/grafana",
          kind: "database",
          sqlite: "/var/lib/grafana/grafana.db",
        },
      ],
      configs: [
        {
          name: "source",
          target: "/etc/grafana/provisioning/datasources/source.yaml",
          content: "url: http://prometheus:9090",
        },
      ],
      services: [
        {
          name: "prometheus",
          image: "prom/prometheus@sha256:" + "c".repeat(64),
          command: null,
          environment: [],
          volumes: [
            {
              name: "metrics",
              target: "/prometheus",
              kind: "files",
              sqlite: null,
            },
          ],
          configs: [],
          port: 9090,
          healthPath: "/-/ready",
          checks: [],
        },
      ],
    },
  ];
}
